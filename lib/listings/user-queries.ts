import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, listingImages, listings } from "@/lib/db/schema";
import type { ListingCategory } from "./queries";

/**
 * Reads here are scoped to "listings the caller owns" via an explicit
 * `created_by` filter — Railway's plain Postgres has no RLS, so this filter
 * is the sole enforcement (previously defense-in-depth alongside "users read
 * own listings").
 */

export type MyListingRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  location: string | null;
  keywords: string[] | null;
  status: string;
  featured_image_url: string | null;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  categories: ListingCategory | null;
};

/** The signed-in user's own listings, any status, most recently updated first. */
export async function getMyListings(userId: string): Promise<MyListingRow[]> {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      description: listings.description,
      category_id: listings.categoryId,
      location: listings.location,
      keywords: listings.keywords,
      status: listings.status,
      featured_image_url: listings.featuredImageUrl,
      created_by: listings.createdBy,
      expires_at: listings.expiresAt,
      created_at: listings.createdAt,
      updated_at: listings.updatedAt,
      category_row_id: categories.id,
      category_name: categories.name,
      category_slug: categories.slug,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(eq(listings.createdBy, userId))
    .orderBy(desc(listings.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    category_id: r.category_id,
    location: r.location,
    keywords: r.keywords,
    status: r.status,
    featured_image_url: r.featured_image_url,
    created_by: r.created_by,
    expires_at: r.expires_at,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
    categories: r.category_row_id
      ? { id: r.category_row_id, name: r.category_name!, slug: r.category_slug! }
      : null,
  }));
}

export type MyListing = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  location: string | null;
  keywords: string[] | null;
  status: string;
  featured_image_url: string | null;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

/** One of the signed-in user's own listings by id, or null if it isn't theirs. */
export async function getMyListingById(
  id: string,
  userId: string,
): Promise<MyListing | null> {
  const rows = await db
    .select()
    .from(listings)
    .where(eq(listings.id, id))
    .limit(1);

  const row = rows[0];
  if (!row || row.createdBy !== userId) return null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    category_id: row.categoryId,
    location: row.location,
    keywords: row.keywords,
    status: row.status,
    featured_image_url: row.featuredImageUrl,
    created_by: row.createdBy,
    expires_at: row.expiresAt,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export type MyListingImage = {
  id: string;
  url: string;
  alt_text: string | null;
  is_featured: boolean;
  position: number;
};

/**
 * Images for one of the signed-in user's own listings, in position order —
 * empty (not an error) if the listing doesn't exist or isn't theirs, so a
 * forged listingId just reads as "no images" rather than leaking another
 * user's photos.
 */
export async function getMyListingImages(listingId: string, userId: string): Promise<MyListingImage[]> {
  const rows = await db
    .select({
      id: listingImages.id,
      url: listingImages.url,
      alt_text: listingImages.altText,
      is_featured: listingImages.isFeatured,
      position: listingImages.position,
      ownerId: listings.createdBy,
    })
    .from(listingImages)
    .innerJoin(listings, eq(listings.id, listingImages.listingId))
    .where(eq(listingImages.listingId, listingId))
    .orderBy(asc(listingImages.position));

  if (rows.length === 0 || rows[0].ownerId !== userId) return [];
  return rows.map(({ id, url, alt_text, is_featured, position }) => ({ id, url, alt_text, is_featured, position }));
}
