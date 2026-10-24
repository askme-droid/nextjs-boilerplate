"use client";

import { useEffect, useRef, useState } from "react";
import { isPlaceholderSlug, slugify } from "@/lib/listings/slug";
import { uploadSocialImage } from "./actions";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  FOCUS_KEYWORD_LIMIT,
  SEO_DESCRIPTION_LIMIT,
  SEO_TITLE_LIMIT,
  SOCIAL_DESCRIPTION_MAX,
  SOCIAL_TITLE_MAX,
  TITLE_MAX,
  TITLE_MIN,
  effectiveDescription,
  effectiveSocialDescription,
  effectiveSocialTitle,
  effectiveTitle,
  socialImageAdvice,
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
    // The panel renders outside the <form> (below the images), so find the
    // listing form by id rather than by nesting.
    const form = anchor.current?.closest("form") ?? (document.getElementById("listing-form") as HTMLFormElement | null);
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

type PanelImage = { url: string; is_featured: boolean; position: number };

/** Loads an image just to read its pixel size (for the 1200×630 advice). */
function useImageSize(url: string | null) {
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setSize({ url, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return size && size.url === url ? size : null;
}

export function SeoPanel({
  initial,
  errors,
  listingId,
  images,
}: {
  initial: {
    seo_title: string;
    seo_description: string;
    focus_keyword: string;
    og_title: string;
    og_description: string;
    og_image_url: string;
  };
  errors?: {
    seo_title?: string;
    seo_description?: string;
    focus_keyword?: string;
    og_title?: string;
    og_description?: string;
    og_image_url?: string;
  };
  /** Present on the edit form; needed to upload a social image. */
  listingId?: string;
  images?: PanelImage[];
}) {
  const ref = useRef<HTMLFieldSetElement>(null);
  const listing = useListingFields(ref);
  const [seoTitle, setSeoTitle] = useState(initial.seo_title);
  const [seoDescription, setSeoDescription] = useState(initial.seo_description);
  const [keyword, setKeyword] = useState(initial.focus_keyword);
  const [ogTitle, setOgTitle] = useState(initial.og_title);
  const [ogDescription, setOgDescription] = useState(initial.og_description);
  const [ogImageUrl, setOgImageUrl] = useState(initial.og_image_url);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

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
  const socialTitle = effectiveSocialTitle(ogTitle, seoTitle, listing.title);
  const socialDescription = effectiveSocialDescription(ogDescription, seoDescription, listing.description);
  const photos = [...(images ?? [])].sort((a, b) =>
    a.is_featured !== b.is_featured ? (a.is_featured ? -1 : 1) : a.position - b.position,
  );
  const defaultImage = photos[0]?.url ?? null;
  const socialImage = ogImageUrl || defaultImage;
  const isCustomUpload = !!ogImageUrl && !photos.some((p) => p.url === ogImageUrl);
  const imageSize = useImageSize(socialImage);
  const imageAdvice = imageSize ? socialImageAdvice(imageSize.width, imageSize.height) : null;

  async function handleUpload(file: File) {
    if (!listingId) return;
    setUploadError(null);
    setUploading(true);
    const data = new FormData();
    data.set("listingId", listingId);
    data.set("file", file);
    const result = await uploadSocialImage(data);
    setUploading(false);
    if (uploadRef.current) uploadRef.current.value = "";
    if (result.url) setOgImageUrl(result.url);
    else setUploadError(result.error ?? "Upload failed.");
  }

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
            form="listing-form"
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
            form="listing-form"
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
            form="listing-form"
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

      {/* ── Social media sharing (Open Graph) ── */}
      <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div>
          <p className="text-sm font-semibold">Social media share</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            How this listing looks when shared on Facebook, WhatsApp, LinkedIn or X. Leave empty to use the SEO
            title, meta description and featured photo.
          </p>
        </div>

        {/* Facebook / WhatsApp style preview */}
        <div className="w-full max-w-md overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="relative aspect-[1.91/1] w-full bg-zinc-200 dark:bg-zinc-800">
            {socialImage ? (
              // Admin-only preview of an arbitrary URL; same reasoning as the
              // image manager's plain <img>.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={socialImage} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                No image — add a listing photo or upload one below
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">directories.fd.sg</p>
            <p className="line-clamp-2 font-semibold leading-snug">{socialTitle}</p>
            <p className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
              {socialDescription || "No description yet."}
            </p>
          </div>
        </div>

        <label className="text-sm font-medium">
          Social title
          <input
            type="text"
            name="og_title"
            form="listing-form"
            value={ogTitle}
            maxLength={SEO_TITLE_LIMIT}
            onChange={(e) => setOgTitle(e.target.value)}
            placeholder={effectiveTitle(seoTitle, listing.title)}
            className={inputClass}
          />
          <LengthMeter length={socialTitle.length} min={1} max={SOCIAL_TITLE_MAX} />
          <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {ogTitle.trim() ? "Used for social shares only." : "Empty — using the SEO title."}
          </span>
          {errors?.og_title && <p className={errorClass}>{errors.og_title}</p>}
        </label>

        <label className="text-sm font-medium">
          Social description
          <textarea
            name="og_description"
            form="listing-form"
            rows={2}
            value={ogDescription}
            maxLength={SEO_DESCRIPTION_LIMIT}
            onChange={(e) => setOgDescription(e.target.value)}
            placeholder={effectiveDescription(seoDescription, listing.description) || "A short, catchy line for shares"}
            className={inputClass}
          />
          <LengthMeter length={socialDescription.length} min={1} max={SOCIAL_DESCRIPTION_MAX} />
          <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {ogDescription.trim()
              ? "Facebook shows about 110 characters; keep the key message early."
              : "Empty — using the meta description."}
          </span>
          {errors?.og_description && <p className={errorClass}>{errors.og_description}</p>}
        </label>

        <div className="text-sm font-medium">
          Social image
          <input type="hidden" name="og_image_url"
            form="listing-form" value={ogImageUrl} />
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Social image">
            {photos.map((photo, i) => {
              const selected = ogImageUrl ? ogImageUrl === photo.url : i === 0;
              return (
                <button
                  key={photo.url}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setOgImageUrl(i === 0 ? "" : photo.url)}
                  className={`relative h-16 w-28 overflow-hidden rounded-md border-2 ${
                    selected ? "border-emerald-500" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  title={i === 0 ? "Featured photo (default)" : "Use this photo"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                  {i === 0 && (
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[10px] text-white">
                      Default
                    </span>
                  )}
                </button>
              );
            })}
            {isCustomUpload && (
              <button
                type="button"
                role="radio"
                aria-checked
                className="relative h-16 w-28 overflow-hidden rounded-md border-2 border-emerald-500"
                title="Uploaded social image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ogImageUrl} alt="" className="size-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[10px] text-white">
                  Uploaded
                </span>
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {listingId ? (
              <>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => uploadRef.current?.click()}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {uploading ? "Uploading…" : "Upload a social image"}
                </button>
              </>
            ) : (
              <span className="text-xs font-normal text-zinc-500">Save the listing first to upload a social image.</span>
            )}
            {ogImageUrl && (
              <button
                type="button"
                onClick={() => setOgImageUrl("")}
                className="text-sm font-normal text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
              >
                Use the featured photo instead
              </button>
            )}
          </div>

          {imageAdvice && (
            <p
              className={`mt-1.5 text-xs font-normal ${
                imageAdvice.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {imageAdvice.message}
            </p>
          )}
          <p className="mt-1 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            Best size: 1200 × 630 pixels (landscape). Uploaded images are only used for sharing, not shown in the listing.
          </p>
          {uploadError && <p className={errorClass}>{uploadError}</p>}
          {errors?.og_image_url && <p className={errorClass}>{errors.og_image_url}</p>}
        </div>
      </div>
    </fieldset>
  );
}
