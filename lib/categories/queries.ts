import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, listings } from "@/lib/db/schema";

// getCategories() already lived in lib/listings/queries.ts before this
// module existed, and plenty of code imports it from there — re-exported
// here rather than moved, so this file has a categories-specific home
// without a broad, riskier rename of existing import sites.
export { getCategories, type ListingCategory } from "@/lib/listings/queries";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
};

/** One category by id (any category — there's no draft/published concept here). */
export async function getCategoryById(id: string): Promise<CategoryRow | null> {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * How many listings currently reference a category — shown as a warning
 * before deleting one. Deleting sets those listings' category_id to null
 * (ON DELETE SET NULL — see lib/db/schema/listings.ts); it doesn't block the
 * delete or touch the listings otherwise.
 */
export async function getListingCountForCategory(categoryId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(listings)
    .where(eq(listings.categoryId, categoryId));
  return row?.value ?? 0;
}
