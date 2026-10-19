/**
 * Pure date helpers for listing expiry — safe for client components. See
 * lib/listings/expiry.ts for the rules and the SQL filter.
 */

/** Today's date in Singapore as YYYY-MM-DD. */
export function todayInSingapore(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
}

/** Whether a listing's expiry date has passed (in Singapore time). */
export function isExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  return !!expiresAt && expiresAt < todayInSingapore(now);
}

/** A date `days` from today in Singapore, as YYYY-MM-DD (for quick presets). */
export function singaporeDatePlusDays(days: number, now = new Date()): string {
  const [y, m, d] = todayInSingapore(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
