import { sql } from "drizzle-orm";
import { listings } from "@/lib/db/schema";

export { isExpired, singaporeDatePlusDays, todayInSingapore } from "./expiry-dates";

/**
 * Listing expiry, ACADP-style: a listing either never expires
 * (`expires_at` is null) or is shown through the end of its expiry date in
 * Singapore time, then drops out of the public site (grid, search,
 * categories, homepage slider, sitemap). Its own page stays reachable but
 * says the offer has ended and asks search engines not to index it.
 *
 * Staff still see expired listings in admin, marked "Expired".
 */

/** SQL condition: the listing hasn't expired (no date, or today or later in Singapore). */
export const notExpired = sql`(${listings.expiresAt} is null or ${listings.expiresAt} >= (now() at time zone 'Asia/Singapore')::date)`;
