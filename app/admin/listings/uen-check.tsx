"use client";

import { useState, useTransition } from "react";
import { isLiveStatus } from "@/lib/business/uen-status";
import type { UenVerification } from "@/lib/listings/admin-queries";
import { checkListingUen, type UenCheckResult } from "./uen-actions";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-SG", { year: "numeric", month: "short", day: "numeric" });
}

/** "Verify with ACRA" button + result, under the Company UEN field. Reads the
 *  UEN and company name currently typed in the listing form. */
export function UenCheck({ listingId, saved }: { listingId: string; saved: UenVerification | null }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<UenCheckResult | null>(null);

  function verify() {
    const form = document.getElementById("listing-form") as HTMLFormElement | null;
    const data = form ? new FormData(form) : null;
    const uen = String(data?.get("company_uen") ?? "");
    const companyName = String(data?.get("company_name") ?? "");
    startTransition(async () => {
      try {
        setResult(await checkListingUen(listingId, uen, companyName));
      } catch {
        setResult({ ok: false, message: "Could not check the UEN. Try again." });
      }
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2 text-sm font-normal">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={verify}
          disabled={pending}
          className="w-fit rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {pending ? "Checking ACRA…" : "Verify with ACRA"}
        </button>
        {!result && saved && <SavedStatus saved={saved} />}
      </div>
      {result && <ResultBox result={result} />}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Checks ACRA&apos;s register (data.gov.sg, updated monthly). Also runs by itself when a new UEN is saved. A
        &quot;Verified business&quot; badge shows on the listing when the saved UEN is a live business.
      </p>
    </div>
  );
}

function SavedStatus({ saved }: { saved: UenVerification }) {
  const live = isLiveStatus(saved.status);
  return (
    <span className={live ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
      {live ? "✓ " : "⚠ "}
      {saved.name ? `${saved.name} · ` : ""}
      {saved.status} <span className="text-zinc-500 dark:text-zinc-400">(UEN {saved.uen}, checked {formatDate(saved.verified_at)})</span>
    </span>
  );
}

function ResultBox({ result }: { result: UenCheckResult }) {
  if (!result.ok) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/40 dark:text-red-300">{result.message}</p>;
  }
  if (!result.found) {
    return (
      <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
        ⚠ UEN {result.uen} isn&apos;t in ACRA&apos;s register. Check for a typo. Societies, charities and some other
        organisations register with other agencies and won&apos;t be found here; a business registered in the last few
        weeks may not be listed yet.
      </p>
    );
  }
  const e = result.entity;
  const tone = result.live
    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
    : "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  return (
    <div className={`rounded-md px-3 py-2 ${tone}`}>
      <p className="font-medium">
        {result.live ? "✓ " : "⚠ "}
        {e.name} · {e.status}
      </p>
      <p className="mt-1">
        {[e.entityType, e.registeredOn ? `registered ${formatDate(e.registeredOn)}` : null].filter(Boolean).join(" · ")}
      </p>
      {e.address && <p>{e.address}</p>}
      {e.activity && <p>{e.activity}</p>}
      {!result.live && <p className="mt-1 font-medium">This business is no longer live, so no badge is shown.</p>}
      {result.nameMatches === false && (
        <p className="mt-1 font-medium text-amber-800 dark:text-amber-300">
          ⚠ The company name entered doesn&apos;t match ACRA&apos;s name for this UEN — check it&apos;s the right business.
        </p>
      )}
      {result.nameMatches === null && <p className="mt-1">Tip: enter the company name to compare it with ACRA&apos;s.</p>}
    </div>
  );
}
