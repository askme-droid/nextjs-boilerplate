"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/require-staff";

// Same rule as every other action in this app: re-check requireStaff() here,
// since a Server Action is reachable directly, not only through its page.

const FEATURED_PATH = "/admin/listings/featured";

function done(message: string): never {
  redirect(`${FEATURED_PATH}?msg=${encodeURIComponent(message)}`);
}

function refresh() {
  revalidatePath("/");
  revalidatePath(FEATURED_PATH);
}

/** Pick a listing for the homepage; it goes to the end of the picked list. */
export async function addFeatured(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) done("No listing selected.");

  await db
    .update(listings)
    .set({
      homepageFeatured: true,
      homepageFeaturedOrder: sql`(select coalesce(max(homepage_featured_order), 0) + 1 from listings where homepage_featured)`,
    })
    .where(eq(listings.id, id));

  refresh();
  done("Added to the homepage.");
}

export async function removeFeatured(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) done("No listing selected.");

  await db
    .update(listings)
    .set({ homepageFeatured: false, homepageFeaturedOrder: 0 })
    .where(eq(listings.id, id));

  refresh();
  done("Removed from the homepage.");
}

/** Swap a picked listing with its neighbour. Renumbers the whole picked list
 *  0..n-1 in one transaction so the order stays gap-free and unambiguous. */
export async function moveFeatured(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;

  await db.transaction(async (tx) => {
    const picked = await tx
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.homepageFeatured, true))
      .orderBy(asc(listings.homepageFeaturedOrder), desc(listings.createdAt));

    const from = picked.findIndex((p) => p.id === id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= picked.length) return;

    [picked[from], picked[to]] = [picked[to], picked[from]];
    for (const [position, row] of picked.entries()) {
      await tx
        .update(listings)
        .set({ homepageFeaturedOrder: position })
        .where(eq(listings.id, row.id));
    }
  });

  refresh();
  redirect(FEATURED_PATH);
}
