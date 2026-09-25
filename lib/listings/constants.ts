// Matches the `listings_status_check` CHECK constraint on the Railway
// database (lib/db/schema/listings.ts / drizzle/0000_fresh_hedge_knight.sql).
export const LISTING_STATUSES = ["draft", "pending", "published", "rejected"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

// What a plain (non-staff) user is allowed to set their own listing to —
// enforced in app/my-listings/actions.ts (there is no RLS backstop anymore):
// never 'published' or 'rejected' by their own hand, only staff can make
// that transition via app/admin/listings/actions.ts.
export const USER_SUBMITTABLE_STATUSES = ["draft", "pending"] as const;
export type UserSubmittableStatus = (typeof USER_SUBMITTABLE_STATUSES)[number];
