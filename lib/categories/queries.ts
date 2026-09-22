import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

// getCategories() already lived in lib/listings/queries.ts before this
// module existed, and plenty of code imports it from there — re-exported
// here rather than moved, so this file has a categories-specific home
// without a broad, riskier rename of existing import sites.
export { getCategories, type ListingCategory } from "@/lib/listings/queries";

export type CategoryRow = Tables<"categories">;

/** One category by id (any category — there's no draft/published concept here). */
export async function getCategoryById(id: string): Promise<CategoryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Could not load category: ${error.message}`);
  return data;
}

/**
 * How many listings currently reference a category — shown as a warning
 * before deleting one. Deleting sets those listings' category_id to null
 * (ON DELETE SET NULL on listings_category_id_fkey, confirmed by probing the
 * live schema); it doesn't block the delete or touch the listings otherwise.
 */
export async function getListingCountForCategory(categoryId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (error) throw new Error(`Could not count listings: ${error.message}`);
  return count ?? 0;
}
