const DAY_MS = 86_400_000;

/** How long after posting a listing still counts as "New". */
export const NEW_WITHIN_DAYS = 14;
/** How close to its expiry date a listing starts showing "Ends in …". */
export const ENDS_SOON_WITHIN_DAYS = 14;

export function isNewListing(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < NEW_WITHIN_DAYS * DAY_MS;
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
