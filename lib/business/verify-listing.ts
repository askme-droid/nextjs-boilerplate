import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { lookupUen, type AcraLookup } from "./acra";
import { isLiveStatus } from "./uen-status";

export const NOT_FOUND_STATUS = "Not found";

/** Looks the UEN up in ACRA's register and records the outcome on the
 *  listing. A lookup that couldn't reach data.gov.sg isn't recorded, so an
 *  earlier result is kept rather than replaced by an error. */
export async function verifyListingBusiness(listingId: string, uen: string): Promise<AcraLookup> {
  const result = await lookupUen(uen);
  if ("error" in result) return result;

  await db
    .update(listings)
    .set({
      uenVerifiedUen: uen.trim().toUpperCase(),
      uenVerifiedName: result.found ? result.entity.name : null,
      uenVerifiedStatus: result.found ? result.entity.status : NOT_FOUND_STATUS,
      uenVerifiedAt: new Date(),
    })
    .where(eq(listings.id, listingId));
  return result;
}

/** Best-effort check after a save, only when the UEN isn't the one last
 *  verified (so re-saving a listing doesn't hit data.gov.sg every time). */
export async function verifyListingBusinessIfChanged(listingId: string, uen: string | null): Promise<void> {
  if (!uen) return;
  try {
    const [row] = await db
      .select({ verifiedUen: listings.uenVerifiedUen })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1);
    if (!row || row.verifiedUen === uen) return;
    await verifyListingBusiness(listingId, uen);
  } catch (e) {
    console.error("UEN check failed:", e instanceof Error ? e.message : e);
  }
}

/** Whether a listing shows the public "Verified business" badge: its current
 *  UEN is the one checked, and ACRA lists that business as live. */
export function isVerifiedBusiness(row: {
  company_uen: string | null;
  uen_verified_uen: string | null;
  uen_verified_status: string | null;
}): boolean {
  return !!row.company_uen && row.company_uen === row.uen_verified_uen && isLiveStatus(row.uen_verified_status);
}
