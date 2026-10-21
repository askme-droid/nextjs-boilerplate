// AEO/GEO (answer engines + generative AI search) helpers for listings.
// Client-safe: used by the admin editor's "Answer engines" panel and by the
// save action, so both apply the same limits and checks.

export type Faq = { q: string; a: string };

export const QUICK_ANSWER_MIN = 60;
export const QUICK_ANSWER_MAX = 300;
export const FAQ_MAX = 6;
export const FAQ_QUESTION_MAX = 200;
export const FAQ_ANSWER_MAX = 1000;
export const OFFER_DISCOUNT_MAX = 80;
export const REDEMPTION_MAX = 600;

/** Parses the editor's hidden JSON field into clean Q&A pairs, dropping
 *  blank rows. Returns an error message instead when a row is half-filled
 *  or too long. */
export function parseFaqs(json: string): { faqs: Faq[]; error?: string } {
  if (!json.trim()) return { faqs: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { faqs: [], error: "The questions couldn't be read — please re-enter them." };
  }
  if (!Array.isArray(raw)) return { faqs: [] };
  const faqs: Faq[] = [];
  for (const item of raw) {
    const q = typeof item?.q === "string" ? item.q.replace(/\s+/g, " ").trim() : "";
    const a = typeof item?.a === "string" ? item.a.trim() : "";
    if (!q && !a) continue;
    if (!q || !a) return { faqs, error: "Each question needs an answer (or remove the empty one)." };
    if (q.length > FAQ_QUESTION_MAX) return { faqs, error: `Keep each question under ${FAQ_QUESTION_MAX} characters.` };
    if (a.length > FAQ_ANSWER_MAX) return { faqs, error: `Keep each answer under ${FAQ_ANSWER_MAX} characters.` };
    faqs.push({ q, a });
  }
  if (faqs.length > FAQ_MAX) return { faqs, error: `Add at most ${FAQ_MAX} questions.` };
  return { faqs };
}

/** "25.9" / "$25.90" / "S$25" → "25.90"; "" → null; anything else → undefined (invalid). */
export function normalizePrice(input: string): string | null | undefined {
  const v = input.replace(/^\s*(S?\$|SGD)\s*/i, "").replace(/,/g, "").trim();
  if (!v) return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(v)) return undefined;
  return Number(v).toFixed(2);
}

export type AeoCheck = { id: string; ok: boolean; warn?: boolean; message: string };

export type AeoInput = {
  quickAnswer: string;
  faqs: Faq[];
  description: string;
  location: string;
  companyName: string;
  expiresAt: string;
  offerPrice: string;
  offerDiscount: string;
  redemption: string;
  verified: boolean;
};

/** Yoast-style checks for how well answer engines / AI tools can quote the
 *  listing. `warn` = nice to have; otherwise it's a problem worth fixing. */
export function runAeoChecks(f: AeoInput): AeoCheck[] {
  const qa = f.quickAnswer.trim();
  const facts = `${qa} ${f.description}`.toLowerCase();
  const hasNumber = /\d/.test(qa);
  return [
    !qa
      ? { id: "qa", ok: false, message: "Add a quick answer — the 1–2 sentences AI assistants quote first." }
      : qa.length < QUICK_ANSWER_MIN
        ? { id: "qa", ok: false, warn: true, message: `Quick answer is short (${qa.length} characters) — say who, what, where and until when.` }
        : qa.length > QUICK_ANSWER_MAX
          ? { id: "qa", ok: false, message: `Quick answer is too long — keep it under ${QUICK_ANSWER_MAX} characters.` }
          : { id: "qa", ok: true, message: "Quick answer is a good length." },
    qa && hasNumber
      ? { id: "qa-facts", ok: true, message: "Quick answer includes concrete details (price, %, date or count)." }
      : { id: "qa-facts", ok: false, warn: true, message: "Put a concrete detail in the quick answer (price, % off, end date, outlets)." },
    f.faqs.length >= 2
      ? { id: "faqs", ok: true, message: `${f.faqs.length} questions & answers — marked up as an FAQ for answer engines.` }
      : f.faqs.length === 1
        ? { id: "faqs", ok: false, warn: true, message: "Add at least one more question & answer (2–5 works best)." }
        : { id: "faqs", ok: false, message: "Add 2–5 questions & answers customers would ask (how to redeem, where, until when)." },
    f.location.trim()
      ? { id: "location", ok: true, message: "Location is set — helps \"near me\" and area questions." }
      : { id: "location", ok: false, message: "Set a location (area or outlet) so AI tools can answer \"where\"." },
    f.verified
      ? { id: "verified", ok: true, message: "Business is ACRA-verified — a trust signal for AI answers." }
      : { id: "verified", ok: false, warn: true, message: f.companyName.trim() ? "Verify the business UEN with ACRA." : "Add the company name and UEN, then verify with ACRA." },
    f.expiresAt
      ? { id: "dates", ok: true, message: "Offer end date is set — AI answers won't quote it after it ends." }
      : { id: "dates", ok: false, warn: true, message: "Set an expiry date if the offer ends (or leave “Never expires” for evergreen listings)." },
    f.offerPrice.trim() || f.offerDiscount.trim() || /(\$|%|free|off)/.test(facts)
      ? { id: "offer", ok: true, message: "Price or discount is stated." }
      : { id: "offer", ok: false, warn: true, message: "State the price or discount (Offer details) — it's what people ask first." },
    f.redemption.trim() || f.faqs.some((x) => /redeem|claim|use|book|order/i.test(x.q))
      ? { id: "redeem", ok: true, message: "Explains how to redeem or book." }
      : { id: "redeem", ok: false, warn: true, message: "Explain how to redeem, claim or book (Offer details or a Q&A)." },
  ];
}
