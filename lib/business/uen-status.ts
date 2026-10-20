// Client-safe (no server-only imports): used by the admin editor too.

/** ACRA's wording for an active entity: "Live" (businesses, LLPs) or
 *  "Live Company"; "Registered" for some other entity types. */
export function isLiveStatus(status: string | null | undefined): boolean {
  return !!status && /^(live\b|registered$)/i.test(status.trim());
}
