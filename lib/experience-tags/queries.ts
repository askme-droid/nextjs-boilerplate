import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { experienceTags, listingExperienceTags } from "@/lib/db/schema";

// getExperienceTags() already lived in lib/listings/admin-queries.ts before
// this module existed (it's used there to populate the listing form's tag
// checkboxes) — re-exported here rather than moved, so this file has an
// experience-tags-specific home without a broader, riskier rename.
export { getExperienceTags } from "@/lib/listings/admin-queries";
export type { ListingTag } from "@/lib/listings/queries";

export type ExperienceTagRow = { id: string; name: string; slug: string; created_at: string };

/** One experience tag by id. */
export async function getExperienceTagById(id: string): Promise<ExperienceTagRow | null> {
  const rows = await db.select().from(experienceTags).where(eq(experienceTags.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return { id: row.id, name: row.name, slug: row.slug, created_at: row.createdAt.toISOString() };
}

/**
 * How many listings currently carry a given experience tag — shown as a
 * warning before deleting one. Deleting cascades the join rows
 * (listing_experience_tags.tag_id is ON DELETE CASCADE — see
 * lib/db/schema/listings.ts); it doesn't touch the listings themselves,
 * just untags them.
 */
export async function getListingCountForExperienceTag(tagId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(listingExperienceTags)
    .where(eq(listingExperienceTags.tagId, tagId));
  return row?.value ?? 0;
}
