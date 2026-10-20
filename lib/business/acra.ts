import "server-only";

/**
 * Looks a Singapore UEN up in ACRA's register of businesses and companies,
 * published as open data on data.gov.sg ("ACRA Information on Corporate
 * Entities", refreshed monthly). Free; an optional DATA_GOV_SG_API_KEY
 * (data.gov.sg account -> API keys) raises the request limits.
 *
 * The register is split into one dataset per first letter of the entity's
 * name (plus "others"), and nothing maps a UEN to its letter, so a lookup asks
 * every dataset for that exact UEN — in small batches, stopping at the first
 * hit. Covers ACRA entities only (companies, sole proprietorships,
 * partnerships, LLPs/LPs); societies, charities etc. register their UENs with
 * other agencies and come back "not found".
 */

// childDatasets of https://api-production.data.gov.sg/v2/public/api/collections/2/metadata
const ACRA_DATASETS = [
  "d_af2042c77ffaf0db5d75561ce9ef5688",
  "d_0cc5f52a1f298b916f317800251057f3",
  "d_4e3db8955fdcda6f9944097bef3d2724",
  "d_1cd970d8351b42be4a308d628a6dd9d3",
  "d_e97e8e7fc55b85a38babf66b0fa46b73",
  "d_df7d2d661c0c11a7c367c9ee4bf896c1",
  "d_fa2ed456cf2b8597bb7e064b08fc3c7c",
  "d_300ddc8da4e8f7bdc1bfc62d0d99e2e7",
  "d_31af23fdb79119ed185c256f03cb5773",
  "d_67e99e6eabc4aad9b5d48663b579746a",
  "d_c0650f23e94c42e7a20921f4c5b75c24",
  "d_3a3807c023c61ddfba947dc069eb53f2",
  "d_478f45a9c541cbe679ca55d1cd2b970b",
  "d_a2141adf93ec2a3c2ec2837b78d6d46e",
  "d_181005ca270b45408b4cdfc954980ca2",
  "d_8575e84912df3c28995b8e6e0e05205a",
  "d_9af9317c646a1c881bb5591c91817cc6",
  "d_5c4ef48b025fdfbc80056401f06e3df9",
  "d_5573b0db0575db32190a2ad27919a7aa",
  "d_2b8c54b2a490d2fa36b925289e5d9572",
  "d_85518d970b8178975850457f60f1e738",
  "d_72f37e5c5d192951ddc5513c2b134482",
  "d_4526d47d6714d3b052eed4a30b8b1ed6",
  "d_b58303c68e9cf0d2ae93b73ffdbfbfa1",
  "d_acbc938ec77af18f94cecc4a7c9ec720",
  "d_4130f1d9d365d9f1633536e959f62bb7",
  "d_124a9bd407c7a25f8335b93b86e50fdd",
];

const ENDPOINT = "https://data.gov.sg/api/action/datastore_search";
// Small batches: data.gov.sg rate-limits requests without an API key.
const BATCH_SIZE = process.env.DATA_GOV_SG_API_KEY ? 9 : 3;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 1000;
const REQUEST_TIMEOUT_MS = 8000;

export type AcraEntity = {
  uen: string;
  name: string;
  formerNames: string[];
  status: string;
  entityType: string | null;
  registeredOn: string | null; // yyyy-mm-dd
  address: string | null;
  activity: string | null;
};

export type AcraLookup =
  | { found: true; entity: AcraEntity }
  | { found: false }
  /** data.gov.sg couldn't be reached or refused (rate limit) — try later. */
  | { found: false; error: string };

type Row = Record<string, string | number | null | undefined>;

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return !s || s.toLowerCase() === "na" ? null : s;
};

function toEntity(row: Row): AcraEntity {
  const formerNames: string[] = [];
  for (let i = 1; i <= 15; i++) {
    const n = clean(row[`former_entity_name${i}`]);
    if (n) formerNames.push(n);
  }
  const unit = [clean(row.level_no), clean(row.unit_no)].filter(Boolean).join("-");
  const address = [
    [clean(row.block), clean(row.street_name)].filter(Boolean).join(" "),
    unit ? `#${unit}` : null,
    clean(row.building_name),
    clean(row.postal_code) ? `Singapore ${clean(row.postal_code)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    uen: clean(row.uen) ?? "",
    name: clean(row.entity_name) ?? "",
    formerNames,
    status: clean(row.entity_status_description) ?? "Unknown",
    entityType:
      clean(row.company_type_description) ??
      clean(row.business_constitution_description) ??
      clean(row.entity_type_description),
    registeredOn: clean(row.registration_incorporation_date),
    address: address || null,
    activity: clean(row.primary_ssic_description) ?? clean(row.primary_user_described_activity),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchDataset(resourceId: string, uen: string): Promise<Row | null> {
  const url = `${ENDPOINT}?resource_id=${resourceId}&limit=5&filters=${encodeURIComponent(JSON.stringify({ uen }))}`;
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.DATA_GOV_SG_API_KEY;
  if (key) headers["x-api-key"] = key;

  // Without an API key data.gov.sg allows only a few requests at a time and
  // answers the rest with 429 "Too Many Requests" — wait and retry those.
  let res: Response | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (res.status !== 429 && res.status < 500) break;
    if (attempt < MAX_ATTEMPTS - 1) await sleep(RETRY_BASE_MS * 2 ** attempt + Math.random() * 300);
  }
  if (!res || !res.ok) {
    console.error(`ACRA lookup: data.gov.sg answered ${res?.status} for ${resourceId}`);
    throw new Error(`data.gov.sg ${res?.status}`);
  }
  const json = (await res.json()) as { success?: boolean; result?: { records?: Row[] } };
  if (json.success === false) throw new Error("data.gov.sg refused the request");
  // Match on the exact UEN ourselves too, so a filter that's ignored for any
  // reason can never verify the wrong business.
  return json.result?.records?.find((r) => String(r.uen ?? "").trim().toUpperCase() === uen) ?? null;
}

export async function lookupUen(rawUen: string): Promise<AcraLookup> {
  const uen = rawUen.trim().toUpperCase().replace(/\s+/g, "");
  if (!uen) return { found: false };

  let failures = 0;
  for (let i = 0; i < ACRA_DATASETS.length; i += BATCH_SIZE) {
    const batch = ACRA_DATASETS.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((id) => searchDataset(id, uen)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) return { found: true, entity: toEntity(r.value) };
      if (r.status === "rejected") failures += 1;
    }
  }
  // A miss only counts as "not registered" if every dataset actually answered.
  if (failures > 0) {
    return {
      found: false,
      error:
        failures === ACRA_DATASETS.length
          ? "Couldn't reach ACRA's register on data.gov.sg. Try again in a minute."
          : "ACRA's register only partly answered (busy). Try again in a minute.",
    };
  }
  return { found: false };
}

export { isLiveStatus } from "./uen-status";

const SUFFIXES = /\b(PTE\.?|PRIVATE|LTD\.?|LIMITED|LLP|LP|CO\.?|COMPANY|SDN|BHD|INC\.?|CORP\.?)\b/g;
function normName(n: string): string {
  return n
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(SUFFIXES, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Loose comparison of the company name staff typed with ACRA's (current or
 *  former) name — ignores case, punctuation and "Pte Ltd"-style suffixes. */
export function nameMatches(companyName: string | null | undefined, entity: Pick<AcraEntity, "name" | "formerNames">): boolean {
  if (!companyName?.trim()) return false;
  const typed = normName(companyName);
  if (!typed) return false;
  return [entity.name, ...entity.formerNames].some((n) => {
    const acra = normName(n);
    return acra === typed || acra.startsWith(`${typed} `) || typed.startsWith(`${acra} `);
  });
}
