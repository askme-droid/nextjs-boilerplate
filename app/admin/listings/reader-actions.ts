"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/require-staff";
import type { CorpusItem } from "@/lib/flyer-reader/text";

/**
 * The words of every published, categorised listing, so the free flyer reader
 * (app/admin/listings/[id]/flyer-reader.tsx) can suggest which category a
 * flyer resembles. Staff-only for the same reason as every other action
 * here: a Server Action is its own reachable endpoint.
 */
export async function getCategoryCorpus(): Promise<CorpusItem[]> {
  await requireStaff();
  const rows = await db
    .select({ title: listings.title, description: listings.description, categoryId: listings.categoryId })
    .from(listings)
    .where(and(eq(listings.status, "published"), isNotNull(listings.categoryId)));
  return rows.map((row) => ({
    categoryId: row.categoryId as string,
    text: `${row.title} ${row.description ?? ""}`.slice(0, 700),
  }));
}
