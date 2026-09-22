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
