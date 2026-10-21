"use client";

import { useEffect, useRef, useState } from "react";
import {
  AUDIENCE_MAX,
  KEY_POINT_MAX,
  KEY_POINTS_MAX,
  FAQ_ANSWER_MAX,
  FAQ_MAX,
  FAQ_QUESTION_MAX,
  OFFER_DISCOUNT_MAX,
  QUICK_ANSWER_MAX,
  QUICK_ANSWER_MIN,
  REDEMPTION_MAX,
  runAeoChecks,
  type Faq,
} from "@/lib/seo/aeo";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";
const hintClass = "mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400";

const WATCHED = ["description", "location", "company_name", "expires_at"] as const;
type Watched = Record<(typeof WATCHED)[number], string>;

/** Reads the listing fields the checks need, live from the listing form
 *  (same approach as the SEO panel: this panel sits outside the <form>). */
function useFormFields(anchor: React.RefObject<HTMLElement | null>): Watched {
  const [fields, setFields] = useState<Watched>({ description: "", location: "", company_name: "", expires_at: "" });
  useEffect(() => {
    const form = anchor.current?.closest("form") ?? (document.getElementById("listing-form") as HTMLFormElement | null);
    if (!form) return;
    const read = () => {
      const data = new FormData(form);
      const get = (n: string) => String(data.get(n) ?? "");
      setFields({
        description: get("description"),
        location: get("location"),
        company_name: get("company_name"),
        expires_at: get("expires_at"),
      });
    };
    read();
    const names = new Set<string>(WATCHED);
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      // Expiry presets/radios update the date field by script, so re-read on
      // any change of the expiry controls too.
      if (t?.name && (names.has(t.name) || t.name.startsWith("expiry"))) read();
    };
    // The expiry presets (+30 days etc.) are buttons that set the date by
    // script without an input event; re-read after any click in the form.
    const onClick = () => setTimeout(read, 0);
    form.addEventListener("input", onChange);
    form.addEventListener("change", onChange);
    form.addEventListener("click", onClick);
    return () => {
      form.removeEventListener("input", onChange);
      form.removeEventListener("change", onChange);
      form.removeEventListener("click", onClick);
    };
  }, [anchor]);
  return fields;
}

function Counter({ length, min, max }: { length: number; min: number; max: number }) {
  const tone =
    length === 0
      ? "text-zinc-500"
      : length > max
        ? "text-red-600 dark:text-red-400"
        : length < min
          ? "text-amber-600 dark:text-amber-400"
          : "text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`text-xs font-medium tabular-nums ${tone}`}>
      {length} / {max}
    </span>
  );
}

/** "Answer engines (AEO / GEO)" section of the listing editor: quick summary,
 *  who it's for, key points, offer details, Q&A pairs and a checklist. */
export function AeoPanel({
  initial,
  errors,
  verified,
}: {
  initial: {
    quick_answer: string;
    faqs_json: string;
    offer_price: string;
    offer_discount: string;
    redemption_info: string;
    audience: string;
    key_points_json: string;
  };
  errors?: Partial<
    Record<
      | "quick_answer"
      | "faqs_json"
      | "offer_price"
      | "offer_discount"
      | "redemption_info"
      | "audience"
      | "key_points_json",
      string
    >
  >;
  /** Saved UEN is ACRA-verified and live. */
  verified: boolean;
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const form = useFormFields(ref);
  const [quickAnswer, setQuickAnswer] = useState(initial.quick_answer);
  const [offerPrice, setOfferPrice] = useState(initial.offer_price);
  const [offerDiscount, setOfferDiscount] = useState(initial.offer_discount);
  const [redemption, setRedemption] = useState(initial.redemption_info);
  const [audience, setAudience] = useState(initial.audience);
  const [points, setPoints] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(initial.key_points_json || "[]");
      return Array.isArray(parsed) ? parsed.map((p) => String(p ?? "")) : [];
    } catch {
      return [];
    }
  });
  const [faqs, setFaqs] = useState<Faq[]>(() => {
    try {
      const parsed = JSON.parse(initial.faqs_json || "[]");
      return Array.isArray(parsed) ? parsed.map((f) => ({ q: String(f?.q ?? ""), a: String(f?.a ?? "") })) : [];
    } catch {
      return [];
    }
  });

  const filledFaqs = faqs.filter((f) => f.q.trim() && f.a.trim());
  const checks = runAeoChecks({
    quickAnswer,
    audience,
    keyPoints: points.map((p) => p.trim()).filter(Boolean),
    faqs: filledFaqs,
    description: form.description,
    location: form.location,
    companyName: form.company_name,
    expiresAt: form.expires_at,
    offerPrice,
    offerDiscount,
    redemption,
    verified,
  });
  const passed = checks.filter((c) => c.ok).length;
  const problems = checks.filter((c) => !c.ok && !c.warn).length;
  const overall = problems > 0 ? "Needs work" : passed === checks.length ? "Good" : "OK";
  const overallClass =
    problems > 0
      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
      : passed === checks.length
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";

  const updateFaq = (i: number, patch: Partial<Faq>) =>
    setFaqs((list) => list.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <fieldset ref={ref} className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-sm font-semibold">
        Answer engines (AEO / GEO){" "}
        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${overallClass}`}>{overall}</span>
      </legend>
      <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Helps Google&apos;s AI answers, ChatGPT, Perplexity and voice assistants quote this listing correctly. Everything
        here is shown on the listing page and marked up for them.
      </p>

      <label className="text-sm font-medium">
        Listing quick summary
        <textarea
          name="quick_answer"
          form="listing-form"
          rows={3}
          value={quickAnswer}
          onChange={(e) => setQuickAnswer(e.target.value)}
          placeholder="e.g. Overly Cheezy Pizza offers 1-for-1 large pizzas and 10% off your first online order at its Singapore outlets, until 31 Dec 2026."
          className={inputClass}
        />
        <span className="mt-1 flex items-start justify-between gap-3">
          <span className={hintClass}>
            1–2 factual sentences: who, what, where, until when. Shown at the top of the listing.
          </span>
          <Counter length={quickAnswer.replace(/\s+/g, " ").trim().length} min={QUICK_ANSWER_MIN} max={QUICK_ANSWER_MAX} />
        </span>
        {errors?.quick_answer && <p className={errorClass}>{errors.quick_answer}</p>}
      </label>

      <label className="text-sm font-medium">
        Who is this for
        <input
          type="text"
          name="audience"
          form="listing-form"
          maxLength={AUDIENCE_MAX}
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="e.g. Parents of Primary 1 – Secondary 4 students in Bukit Batok and the west"
          className={inputClass}
        />
        <span className={hintClass}>One line on the customers this offer suits. Shown on the listing page.</span>
        {errors?.audience && <p className={errorClass}>{errors.audience}</p>}
      </label>

      <div className="flex flex-col gap-2">
        <div>
          <p className="text-sm font-semibold">Key points</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            3–6 short bullet points: what&apos;s included, highlights, conditions. Shown as a list on the listing page.
          </p>
        </div>
        <input type="hidden" name="key_points_json" form="listing-form" value={JSON.stringify(points)} />
        {points.map((point, i) => (
          <div key={i} className="flex items-center gap-2">
            <span aria-hidden className="text-zinc-400">
              •
            </span>
            <input
              type="text"
              aria-label={`Key point ${i + 1}`}
              value={point}
              maxLength={KEY_POINT_MAX}
              onChange={(e) => setPoints((list) => list.map((p, j) => (j === i ? e.target.value : p)))}
              onKeyDown={(e) => {
                // Enter adds the next bullet instead of submitting the form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (points.length < KEY_POINTS_MAX) setPoints((list) => [...list.slice(0, i + 1), "", ...list.slice(i + 1)]);
                }
              }}
              placeholder={i === 0 ? "e.g. Small classes of up to 8 students" : ""}
              className={`${inputClass} mt-0`}
            />
            <button
              type="button"
              onClick={() => setPoints((list) => list.filter((_, j) => j !== i))}
              aria-label={`Remove key point ${i + 1}`}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Remove
            </button>
          </div>
        ))}
        {points.length < KEY_POINTS_MAX && (
          <button
            type="button"
            onClick={() => setPoints((list) => [...list, ""])}
            className="w-fit rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            + Add a key point
          </button>
        )}
        {errors?.key_points_json && <p className={errorClass}>{errors.key_points_json}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">Offer details</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Price (S$, optional)
            <input
              type="text"
              inputMode="decimal"
              name="offer_price"
              form="listing-form"
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              placeholder="e.g. 25.90"
              className={inputClass}
            />
            {errors?.offer_price && <p className={errorClass}>{errors.offer_price}</p>}
          </label>
          <label className="text-sm font-medium">
            Discount (optional)
            <input
              type="text"
              name="offer_discount"
              form="listing-form"
              maxLength={OFFER_DISCOUNT_MAX}
              value={offerDiscount}
              onChange={(e) => setOfferDiscount(e.target.value)}
              placeholder="e.g. 1-for-1, 50% off, Free trial"
              className={inputClass}
            />
            {errors?.offer_discount && <p className={errorClass}>{errors.offer_discount}</p>}
          </label>
        </div>
        <label className="text-sm font-medium">
          How to redeem or book (optional)
          <textarea
            name="redemption_info"
            form="listing-form"
            rows={2}
            maxLength={REDEMPTION_MAX}
            value={redemption}
            onChange={(e) => setRedemption(e.target.value)}
            placeholder="e.g. Show this listing at any outlet, or use code FDSG10 when ordering online."
            className={inputClass}
          />
          {errors?.redemption_info && <p className={errorClass}>{errors.redemption_info}</p>}
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold">Questions &amp; answers</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            2–5 questions customers would really ask. Shown as an FAQ on the listing page.
          </p>
        </div>
        <input type="hidden" name="faqs_json" form="listing-form" value={JSON.stringify(faqs)} />
        {faqs.map((faq, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
            <label className="text-sm font-medium">
              Question {i + 1}
              <input
                type="text"
                value={faq.q}
                maxLength={FAQ_QUESTION_MAX}
                onChange={(e) => updateFaq(i, { q: e.target.value })}
                placeholder="e.g. How do I redeem this offer?"
                className={inputClass}
              />
            </label>
            <label className="text-sm font-medium">
              Answer
              <textarea
                rows={2}
                value={faq.a}
                maxLength={FAQ_ANSWER_MAX}
                onChange={(e) => updateFaq(i, { a: e.target.value })}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => setFaqs((list) => list.filter((_, j) => j !== i))}
              className="w-fit text-sm text-red-600 underline-offset-4 hover:underline dark:text-red-400"
            >
              Remove
            </button>
          </div>
        ))}
        {faqs.length < FAQ_MAX && (
          <button
            type="button"
            onClick={() => setFaqs((list) => [...list, { q: "", a: "" }])}
            className="w-fit rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            + Add a question
          </button>
        )}
        {errors?.faqs_json && <p className={errorClass}>{errors.faqs_json}</p>}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Checks <span className="font-normal text-zinc-500">({passed}/{checks.length} passed)</span>
        </p>
        <ul className="flex flex-col gap-1.5">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              <span
                aria-hidden
                className={`mt-1 inline-block size-2.5 shrink-0 rounded-full ${
                  check.ok ? "bg-emerald-500" : check.warn ? "bg-amber-500" : "bg-red-500"
                }`}
              />
              <span className="text-zinc-700 dark:text-zinc-300">
                <span className="sr-only">{check.ok ? "Passed: " : check.warn ? "Improvement: " : "Problem: "}</span>
                {check.message}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </fieldset>
  );
}
