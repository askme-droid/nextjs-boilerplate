const DAY_MS = 86_400_000;

/** How long after posting a listing still counts as "New". */
export const NEW_WITHIN_DAYS = 14;
/** How close to its expiry date a listing starts showing "Ends in …". */
export const ENDS_SOON_WITHIN_DAYS = 14;

/** Views at which a listing earns the "Popular" badge (like fd.sg). */
export const POPULAR_MIN_VIEWS = 1000;

/** Views at which a listing shows "Trending" (until it reaches Popular). */
export const TRENDING_MIN_VIEWS = 500;

export function isPopularListing(viewCount: number): boolean {
  return viewCount >= POPULAR_MIN_VIEWS;
}

/** 500–999 views. A listing shows one view badge: Popular replaces Trending. */
export function isTrendingListing(viewCount: number): boolean {
  return viewCount >= TRENDING_MIN_VIEWS && viewCount < POPULAR_MIN_VIEWS;
}

/** `publishedAt` = the listing's published date (published_at). */
export function isNewListing(publishedAt: string): boolean {
  return Date.now() - new Date(publishedAt).getTime() < NEW_WITHIN_DAYS * DAY_MS;
}

/**
 * "Ends today" / "Ends tomorrow" / "Ends in 5 days" for a listing whose
 * expiry date is near, else null (no expiry, far off, or already past — an
 * expired badge would only advertise something visitors can't use).
 *
 * `expires_at` is a plain date, valid through the end of that day in
 * Singapore, which is where this site's visitors are.
 */
export function endsSoonLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const endsAt = Date.parse(`${expiresAt}T23:59:59+08:00`);
  if (Number.isNaN(endsAt)) return null;

  const remaining = endsAt - Date.now();
  if (remaining < 0) return null;

  const days = Math.floor(remaining / DAY_MS);
  if (days > ENDS_SOON_WITHIN_DAYS) return null;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}

/** The homepage "Show" filter (search box): listings carrying a given badge.
 *  Value = the `show` URL parameter. */
// Order = order of the homepage "Browse" pills. `short` is the pill text.
export const SHOW_FILTERS = [
  { value: "trending", label: `Trending (${TRENDING_MIN_VIEWS}+ views)`, short: "Trending" },
  { value: "popular", label: `Popular (${POPULAR_MIN_VIEWS.toLocaleString("en-SG")}+ views)`, short: "Popular" },
  { value: "new", label: `New (last ${NEW_WITHIN_DAYS} days)`, short: "New" },
  { value: "ending", label: `Ending soon (${ENDS_SOON_WITHIN_DAYS} days)`, short: "Ending soon" },
  { value: "verified", label: "Verified business", short: "Verified" },
  { value: "featured", label: "Featured", short: "Featured" },
] as const;

export type ShowFilter = (typeof SHOW_FILTERS)[number]["value"];

export function parseShowFilter(value: string): ShowFilter | "" {
  return SHOW_FILTERS.some((f) => f.value === value) ? (value as ShowFilter) : "";
}
