// Matches the `listings_status_check` CHECK constraint (confirmed by
// probing — see the comment on `status` in types/database.ts).
export const LISTING_STATUSES = ["draft", "published", "archived"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];
