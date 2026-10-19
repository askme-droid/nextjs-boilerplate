/**
 * SEO title / meta description rules for listing pages, shared by the
 * admin SEO panel (live counters and checks) and the public page's
 * generateMetadata, so what the panel previews is exactly what's served.
 *
 * Pure functions only — safe to import from client components.
 */

export const SITE_NAME = "FDSG";
export const SITE_URL = "https://directories.fd.sg";
/** Appended to a listing's own title when no SEO title is set (matches the
 *  root layout's title template "%s | FDSG"). */
export const TITLE_SUFFIX = ` | ${SITE_NAME}`;

/** Roughly what Google shows before cutting off, in characters. */
export const TITLE_MAX = 60;
export const TITLE_MIN = 30;
export const DESCRIPTION_MAX = 160;
export const DESCRIPTION_MIN = 120;

/** Hard caps on what can be saved — well past the recommended lengths, just
 *  to stop accidental pastes of whole documents. */
export const SEO_TITLE_LIMIT = 200;
export const SEO_DESCRIPTION_LIMIT = 400;
export const FOCUS_KEYWORD_LIMIT = 100;

function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The <title> a listing page will get. A custom SEO title is used exactly
 *  as written; otherwise "<listing title> | FDSG". */
export function effectiveTitle(seoTitle: string | null | undefined, title: string): string {
  const custom = squash(seoTitle ?? "");
  if (custom) return custom;
  return `${squash(title) || "Untitled listing"}${TITLE_SUFFIX}`;
}

/** Shortens text to at most `max` characters, ending on a whole word. */
export function truncateAtWord(text: string, max: number): string {
  const clean = squash(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** The meta description a listing page will get. A custom one is used as
 *  written; otherwise the start of the listing description. */
export function effectiveDescription(
  seoDescription: string | null | undefined,
  description: string | null | undefined,
): string {
  const custom = squash(seoDescription ?? "");
  if (custom) return custom;
  return truncateAtWord(description ?? "", DESCRIPTION_MAX);
}

export type LengthStatus = "empty" | "short" | "good" | "long";

export function lengthStatus(length: number, min: number, max: number): LengthStatus {
  if (length === 0) return "empty";
  if (length < min) return "short";
  if (length <= max) return "good";
  return "long";
}

function normalizeForMatch(text: string): string {
  return ` ${text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** Whole-phrase, case- and punctuation-insensitive match ("Bak Kut Teh"
 *  matches "bak-kut-teh" and "BAK KUT TEH!", but "tea" doesn't match "team"). */
export function containsKeyword(text: string | null | undefined, keyword: string): boolean {
  const k = normalizeForMatch(keyword);
  if (k.trim() === "") return false;
  return normalizeForMatch(text ?? "").includes(k);
}

/** How many times the keyword appears in the text (whole-phrase matches). */
export function countKeyword(text: string | null | undefined, keyword: string): number {
  const k = normalizeForMatch(keyword).trim();
  if (!k) return 0;
  const hay = normalizeForMatch(text ?? "");
  let count = 0;
  let from = 0;
  for (;;) {
    const at = hay.indexOf(` ${k} `, from);
    if (at === -1) return count;
    count += 1;
    from = at + k.length + 1;
  }
}

export type SeoCheck = { id: string; ok: boolean; warn?: boolean; message: string };

/** Yoast-style checklist for the admin SEO panel. */
export function runSeoChecks(input: {
  focusKeyword: string;
  title: string;
  description: string;
  slug: string;
  content: string;
}): SeoCheck[] {
  const keyword = squash(input.focusKeyword);
  const checks: SeoCheck[] = [];

  const titleLen = input.title.length;
  const titleStatus = lengthStatus(titleLen, TITLE_MIN, TITLE_MAX);
  checks.push({
    id: "title-length",
    ok: titleStatus === "good",
    warn: titleStatus === "short",
    message:
      titleStatus === "good"
        ? `SEO title length is good (${titleLen}/${TITLE_MAX}).`
        : titleStatus === "long"
          ? `SEO title is too long (${titleLen}/${TITLE_MAX}) — Google will cut it off.`
          : `SEO title is short (${titleLen}/${TITLE_MAX}) — there's room to add more detail.`,
  });

  const descLen = input.description.length;
  const descStatus = lengthStatus(descLen, DESCRIPTION_MIN, DESCRIPTION_MAX);
  checks.push({
    id: "description-length",
    ok: descStatus === "good",
    warn: descStatus === "short",
    message:
      descStatus === "empty"
        ? "No meta description — add one, or write a listing description to use instead."
        : descStatus === "good"
          ? `Meta description length is good (${descLen}/${DESCRIPTION_MAX}).`
          : descStatus === "long"
            ? `Meta description is too long (${descLen}/${DESCRIPTION_MAX}) — Google will cut it off.`
            : `Meta description is short (${descLen}/${DESCRIPTION_MAX}) — aim for ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}.`,
  });

  if (!keyword) {
    checks.push({
      id: "keyword-set",
      ok: false,
      warn: true,
      message: "No focus keyword set — add the phrase people would search for to find this listing.",
    });
    return checks;
  }

  const inTitle = containsKeyword(input.title, keyword);
  checks.push({
    id: "keyword-title",
    ok: inTitle,
    message: inTitle
      ? "Focus keyword appears in the SEO title."
      : "Focus keyword is missing from the SEO title.",
  });
  if (inTitle) {
    const atStart = normalizeForMatch(input.title).trimStart().startsWith(normalizeForMatch(keyword).trim());
    checks.push({
      id: "keyword-title-start",
      ok: atStart,
      warn: !atStart,
      message: atStart
        ? "Focus keyword is at the start of the SEO title."
        : "Tip: put the focus keyword near the start of the SEO title.",
    });
  }

  const inDescription = containsKeyword(input.description, keyword);
  checks.push({
    id: "keyword-description",
    ok: inDescription,
    message: inDescription
      ? "Focus keyword appears in the meta description."
      : "Focus keyword is missing from the meta description.",
  });

  const inSlug = containsKeyword(input.slug.replace(/-/g, " "), keyword);
  checks.push({
    id: "keyword-slug",
    ok: inSlug,
    warn: !inSlug,
    message: inSlug
      ? "Focus keyword appears in the page URL."
      : "Focus keyword isn't in the page URL (slug) — consider adding it.",
  });

  const inContent = countKeyword(input.content, keyword);
  checks.push({
    id: "keyword-content",
    ok: inContent > 0,
    message:
      inContent > 0
        ? `Focus keyword appears ${inContent} time${inContent === 1 ? "" : "s"} in the listing description.`
        : "Focus keyword doesn't appear in the listing description.",
  });

  return checks;
}
