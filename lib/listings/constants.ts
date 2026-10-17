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

// Slides in the homepage "Featured listings" video slider.
export const FEATURED_SLOTS = 6;

// Slider videos go browser -> R2 directly (server uploads are capped at 4.5MB
// on Vercel), so these limits are enforced in the upload-URL route
// (app/api/featured-video/upload) as well as in the upload form.
export const FEATURED_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const FEATURED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
