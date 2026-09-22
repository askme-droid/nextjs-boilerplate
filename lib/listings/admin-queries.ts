import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import type { ListingCategory, ListingImage, ListingTag } from "./queries";

/**
 * Reads in this file are staff-only and intentionally don't filter by
 * `status` the way the public queries in queries.ts do — an admin needs to
 * see drafts and archived listings too. They use the signed-in staff user's
 * own session (not the service-role key), so Postgres RLS's "staff manage
 * listings" policy is what actually enforces that only admin/editor can read
 * these; requireStaff() in the page/layout is the second, app-level check.
 */

export type AdminListingRow = Tables<"listings"> & {
  categories: ListingCategory | null;
};

/** Every listing regardless of status, most recently updated first. */
export async function getAdminListings(): Promise<AdminListingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select("*, categories(id, name, slug)")
    .order("updated_at", { ascending: false })
    .returns<AdminListingRow[]>();

  if (error) throw new Error(`Could not load listings: ${error.message}`);
  return data;
}

export type AdminListingDetail = Tables<"listings"> & {
  categories: ListingCategory | null;
  listing_images: ListingImage[];
  tagIds: string[];
};

/** One listing by id (any status), with its images and linked tag ids. */
export async function getAdminListingById(
  id: string,
): Promise<AdminListingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      `*, categories(id, name, slug),
       listing_images(id, url, alt_text, is_featured, position),
       listing_experience_tags(tag_id)`,
    )
    .eq("id", id)
    .order("position", { referencedTable: "listing_images" })
    .maybeSingle()
    .returns<
      Tables<"listings"> & {
        categories: ListingCategory | null;
        listing_images: ListingImage[];
        listing_experience_tags: { tag_id: string }[];
      }
    >();

  if (error) throw new Error(`Could not load listing: ${error.message}`);
  if (!data) return null;

  const { listing_experience_tags, ...listing } = data;
  return { ...listing, tagIds: listing_experience_tags.map((row) => row.tag_id) };
}

/** All experience tags, for the edit form's tag checkboxes. */
export async function getExperienceTags(): Promise<ListingTag[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experience_tags")
    .select("id, name, slug")
    .order("name");

  if (error) throw new Error(`Could not load experience tags: ${error.message}`);
  return data;
}
