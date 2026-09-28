/**
 * Normalizes text into a URL-safe slug: lowercased, diacritics stripped,
 * anything that isn't a-z/0-9 collapsed to a single hyphen, and trimmed of
 * leading/trailing hyphens. Applied to admin-entered slugs too (not just
 * auto-generated ones) so a stray space or uppercase letter can't produce a
 * slug that doesn't round-trip through the /listings/[slug] route.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diacritics (é -> e, etc.)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * The throwaway slug given to an auto-created draft ("untitled-1a2b3c4d").
 * While a slug is still this placeholder, saving derives a real one from the
 * title instead of keeping it, so people don't end up with untitled- URLs.
 */
export function isPlaceholderSlug(slug: string): boolean {
  return /^untitled-[0-9a-f]{8}$/.test(slug);
}
