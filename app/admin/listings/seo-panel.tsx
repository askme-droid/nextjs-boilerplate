"use client";

import { useEffect, useRef, useState } from "react";
import { isPlaceholderSlug, slugify } from "@/lib/listings/slug";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  FOCUS_KEYWORD_LIMIT,
  SEO_DESCRIPTION_LIMIT,
  SEO_TITLE_LIMIT,
  TITLE_MAX,
  TITLE_MIN,
  effectiveDescription,
  effectiveTitle,
  lengthStatus,
  runSeoChecks,
  type LengthStatus,
} from "@/lib/seo/listing-seo";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

const barColor: Record<LengthStatus, string> = {
  empty: "bg-zinc-300 dark:bg-zinc-700",
  short: "bg-amber-500",
  good: "bg-emerald-500",
  long: "bg-red-500",
};
const textColor: Record<LengthStatus, string> = {
  empty: "text-zinc-500",
  short: "text-amber-600 dark:text-amber-400",
  good: "text-emerald-600 dark:text-emerald-400",
  long: "text-red-600 dark:text-red-400",
};

function LengthMeter({ length, min, max }: { length: number; min: number; max: number }) {
  const status = lengthStatus(length, min, max);
  const pct = Math.min(100, Math.round((length / max) * 100));
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full rounded-full transition-all ${barColor[status]}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-16 text-right text-xs font-medium tabular-nums ${textColor[status]}`}>
        {length} / {max}
      </span>
    </div>
  );
}

/** Reads the other listing fields (title, slug, description) live from the
 *  surrounding listing form, so the checks and preview follow what's typed
 *  without the form having to become controlled. */
function useListingFields(anchor: React.RefObject<HTMLElement | null>) {
  const [fields, setFields] = useState({ title: "", slug: "", description: "" });

  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const read = () => {
      const get = (name: string) => {
        const el = form.elements.namedItem(name);
        return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : "";
      };
      setFields({ title: get("title"), slug: get("slug"), description: get("description") });
    };
    read();
    // Only react to the listing fields we read. Re-rendering on the panel's
    // own (controlled) inputs from this native listener would run before
    // React's onChange and put the old value back, so typing there would
    // appear to do nothing.
    const watched = new Set(["title", "slug", "description"]);
    const onInput = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      if (target?.name && watched.has(target.name)) read();
    };
    form.addEventListener("input", onInput);
    return () => form.removeEventListener("input", onInput);
  }, [anchor]);

  return fields;
}

export function SeoPanel({
  initial,
  errors,
}: {
  initial: { seo_title: string; seo_description: string; focus_keyword: string };
  errors?: { seo_title?: string; seo_description?: string; focus_keyword?: string };
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const listing = useListingFields(ref);
  const [seoTitle, setSeoTitle] = useState(initial.seo_title);
  const [seoDescription, setSeoDescription] = useState(initial.seo_description);
  const [keyword, setKeyword] = useState(initial.focus_keyword);

  const title = effectiveTitle(seoTitle, listing.title);
  const description = effectiveDescription(seoDescription, listing.description);
  const slug =
    (listing.slug && !isPlaceholderSlug(listing.slug) ? slugify(listing.slug) : slugify(listing.title)) ||
    "your-listing";
  const checks = runSeoChecks({
    focusKeyword: keyword,
    title,
    description,
    slug,
    content: listing.description,
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

  return (
    <fieldset ref={ref} className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <legend className="px-1 text-sm font-semibold">
        SEO{" "}
        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${overallClass}`}>{overall}</span>
      </legend>

      {/* Google search result preview */}
      <div className="rounded-md bg-zinc-50 p-3 dark:bg-zinc-900">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Google preview</p>
        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">directories.fd.sg › listings › {slug}</p>
        <p className="truncate text-lg leading-snug text-[#1a0dab] dark:text-sky-400">
          {title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title}
        </p>
        <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
          {description
            ? description.length > DESCRIPTION_MAX
              ? `${description.slice(0, DESCRIPTION_MAX - 1)}…`
              : description
            : "No description yet."}
        </p>
      </div>

      <label className="text-sm font-medium">
        Focus keyword
        <input
          type="text"
          name="focus_keyword"
          value={keyword}
          maxLength={FOCUS_KEYWORD_LIMIT}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. durian delivery singapore"
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          The phrase people would search to find this listing. Used for the checks below only — it isn&apos;t
          shown on the page.
        </span>
        {errors?.focus_keyword && <p className={errorClass}>{errors.focus_keyword}</p>}
      </label>

      <label className="text-sm font-medium">
        SEO title
        <input
          type="text"
          name="seo_title"
          value={seoTitle}
          maxLength={SEO_TITLE_LIMIT}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder={effectiveTitle("", listing.title)}
          className={inputClass}
        />
        <LengthMeter length={title.length} min={TITLE_MIN} max={TITLE_MAX} />
        <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          {seoTitle.trim()
            ? "Used exactly as written for the page title in Google and browser tabs."
            : "Empty — using the listing title plus “| FDSG”. Type here to override."}
        </span>
        {errors?.seo_title && <p className={errorClass}>{errors.seo_title}</p>}
      </label>

      <label className="text-sm font-medium">
        Meta description
        <textarea
          name="seo_description"
          rows={3}
          value={seoDescription}
          maxLength={SEO_DESCRIPTION_LIMIT}
          onChange={(e) => setSeoDescription(e.target.value)}
          placeholder={effectiveDescription("", listing.description) || "A short summary for search results"}
          className={inputClass}
        />
        <LengthMeter length={description.length} min={DESCRIPTION_MIN} max={DESCRIPTION_MAX} />
        <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          {seoDescription.trim()
            ? "Shown under the title in search results and link previews."
            : "Empty — using the start of the listing description. Type here to override."}
        </span>
        {errors?.seo_description && <p className={errorClass}>{errors.seo_description}</p>}
      </label>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Checks{" "}
          <span className="font-normal text-zinc-500">
            ({passed}/{checks.length} passed)
          </span>
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
