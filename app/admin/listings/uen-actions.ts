"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/require-staff";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { isLiveStatus, nameMatches, type AcraEntity } from "@/lib/business/acra";
import { verifyListingBusiness } from "@/lib/business/verify-listing";
import { parseContactFields } from "@/lib/listings/contact-fields";

export type UenCheckResult =
  | { ok: false; message: string }
  | {
      ok: true;
      uen: string;
      found: false;
    }
  | {
      ok: true;
      uen: string;
      found: true;
      entity: AcraEntity;
      live: boolean;
      /** null when no company name was entered to compare with. */
      nameMatches: boolean | null;
    };

/** The editor's "Verify with ACRA" button. Checks the UEN currently typed in
 *  the form (not necessarily saved yet) and records the result on the
 *  listing; the badge only shows once the same UEN is also saved. */
export async function checkListingUen(listingId: string, rawUen: string, companyName: string): Promise<UenCheckResult> {
  await requireStaff();

  const { parsed, errors } = parseContactFields({
    company_name: companyName,
    company_uen: rawUen,
    social_links: "",
    cta_label: "",
    cta_url: "",
  });
  if (errors.company_uen) return { ok: false, message: errors.company_uen };
  const uen = parsed.companyUen;
  if (!uen) return { ok: false, message: "Enter the company's UEN first." };

  const result = await verifyListingBusiness(listingId, uen);
  if ("error" in result) return { ok: false, message: result.error };

  const [row] = await db.select({ slug: listings.slug }).from(listings).where(eq(listings.id, listingId)).limit(1);
  if (row) revalidatePath(`/listings/${row.slug}`);
  revalidatePath("/");

  if (!result.found) return { ok: true, uen, found: false };
  return {
    ok: true,
    uen,
    found: true,
    entity: result.entity,
    live: isLiveStatus(result.entity.status),
    nameMatches: parsed.companyName ? nameMatches(parsed.companyName, result.entity) : null,
  };
}
