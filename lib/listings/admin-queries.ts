import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, experienceTags, listingExperienceTags, listingImages, listings } from "@/lib/db/schema";
import { isStaff } from "@/lib/auth/roles";
import type { ListingCategory, ListingImage, ListingTag } from "./queries";

/**
 * Reads in this file are staff-only and intentionally don't filter by
 * `status` the way the public queries in queries.ts do — an admin needs to
 * see drafts and rejected listings too. Railway's plain Postgres has no RLS,
 * so the `role` parameter each function takes is the sole enforcement: it
 * throws if the caller isn't admin/editor, rather than trusting every call
 * site to have already checked `requireStaff()`.
 */

export type AdminListingRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  location: string | null;
  keywords: string[] | null;
  status: string;
  featured_image_url: string | null;
  external_url: string | null;
  redirect_url: string | null;
  homepage_featured: boolean;
  view_count: number;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
  /** When it was (first) published; null if it never has been. Editable. */
  published_at: string | null;
  updated_at: string;
  categories: ListingCategory | null;
};

function requireStaffRole(role: string | null | undefined) {
  if (!isStaff(role)) throw new Error("Not authorized.");
}

/** Shared select/map for both admin listing lists below — only the WHERE
 *  (locally-owned vs. syndicated) differs between them. */
async function selectAdminListings(extra: ReturnType<typeof isNull> | ReturnType<typeof isNotNull>): Promise<AdminListingRow[]> {
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
      external_url: listings.externalUrl,
      redirect_url: listings.redirectUrl,
      homepage_featured: listings.homepageFeatured,
      view_count: listings.viewCount,
      created_by: listings.createdBy,
      expires_at: listings.expiresAt,
      created_at: listings.createdAt,
      published_at: listings.publishedAt,
      updated_at: listings.updatedAt,
      category_row_id: categories.id,
      category_name: categories.name,
      category_slug: categories.slug,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(extra)
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
    external_url: r.external_url,
    redirect_url: r.redirect_url,
    homepage_featured: r.homepage_featured,
    view_count: r.view_count,
    created_by: r.created_by,
    expires_at: r.expires_at,
    created_at: r.created_at.toISOString(),
    published_at: r.published_at?.toISOString() ?? null,
    updated_at: r.updated_at.toISOString(),
    categories: r.category_row_id
      ? { id: r.category_row_id, name: r.category_name!, slug: r.category_slug! }
      : null,
  }));
}

/** Every locally-owned listing (not synced from elsewhere) regardless of
 *  status, most recently updated first. Syndicated listings (fd.sg etc.)
 *  live on their own page — see getSyndicatedListings — since editing them
 *  here only changes how their card looks, not their actual content. */
export async function getAdminListings(role: string | null | undefined): Promise<AdminListingRow[]> {
  requireStaffRole(role);
  return selectAdminListings(isNull(listings.externalUrl));
}

/** Every listing synced from an external source (fd.sg etc.) — shown here
 *  instead of the main list so staff don't mistake them for locally-owned
 *  content. Their card and detail route both send visitors to external_url,
 *  never a local page. */
export async function getSyndicatedListings(role: string | null | undefined): Promise<AdminListingRow[]> {
  requireStaffRole(role);
  return selectAdminListings(isNotNull(listings.externalUrl));
}

export type AdminListingDetail = AdminListingRow & {
  company_name: string | null;
  company_uen: string | null;
  social_links: string[];
  cta_label: string | null;
  cta_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  focus_keyword: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  uen_verification: UenVerification | null;
  quick_answer: string | null;
  faqs: { q: string; a: string }[];
  offer_price: string | null;
  offer_discount: string | null;
  redemption_info: string | null;
  listing_images: ListingImage[];
  tagIds: string[];
};

/** Last ACRA check of the listing's UEN (see lib/business/acra.ts). */
export type UenVerification = {
  uen: string;
  name: string | null;
  status: string;
  verified_at: string;
};

/** One listing by id (any status), with its images and linked tag ids. */
export async function getAdminListingById(
  id: string,
  role: string | null | undefined,
): Promise<AdminListingDetail | null> {
  requireStaffRole(role);

  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      description: listings.description,
      category_id: listings.categoryId,
      location: listings.location,
      company_name: listings.companyName,
      company_uen: listings.companyUen,
      social_links: listings.socialLinks,
      cta_label: listings.ctaLabel,
      cta_url: listings.ctaUrl,
      seo_title: listings.seoTitle,
      seo_description: listings.seoDescription,
      focus_keyword: listings.focusKeyword,
      og_title: listings.ogTitle,
      og_description: listings.ogDescription,
      og_image_url: listings.ogImageUrl,
      quick_answer: listings.quickAnswer,
      faqs: listings.faqs,
      offer_price: listings.offerPrice,
      offer_discount: listings.offerDiscount,
      redemption_info: listings.redemptionInfo,
      uen_verified_uen: listings.uenVerifiedUen,
      uen_verified_name: listings.uenVerifiedName,
      uen_verified_status: listings.uenVerifiedStatus,
      uen_verified_at: listings.uenVerifiedAt,
      keywords: listings.keywords,
      status: listings.status,
      featured_image_url: listings.featuredImageUrl,
      external_url: listings.externalUrl,
      redirect_url: listings.redirectUrl,
      homepage_featured: listings.homepageFeatured,
      view_count: listings.viewCount,
      created_by: listings.createdBy,
      expires_at: listings.expiresAt,
      created_at: listings.createdAt,
      published_at: listings.publishedAt,
      updated_at: listings.updatedAt,
      category_row_id: categories.id,
      category_name: categories.name,
      category_slug: categories.slug,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(eq(listings.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [images, tagRows] = await Promise.all([
    db
      .select({
        id: listingImages.id,
        url: listingImages.url,
        alt_text: listingImages.altText,
        is_featured: listingImages.isFeatured,
        position: listingImages.position,
      })
      .from(listingImages)
      .where(eq(listingImages.listingId, id))
      .orderBy(asc(listingImages.position)),
    db
      .select({ tagId: listingExperienceTags.tagId })
      .from(listingExperienceTags)
      .where(eq(listingExperienceTags.listingId, id)),
  ]);

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    category_id: row.category_id,
    location: row.location,
    company_name: row.company_name,
    company_uen: row.company_uen,
    social_links: row.social_links ?? [],
    cta_label: row.cta_label,
    cta_url: row.cta_url,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
    focus_keyword: row.focus_keyword,
    og_title: row.og_title,
    og_description: row.og_description,
    og_image_url: row.og_image_url,
    quick_answer: row.quick_answer,
    faqs: row.faqs ?? [],
    offer_price: row.offer_price,
    offer_discount: row.offer_discount,
    redemption_info: row.redemption_info,
    uen_verification:
      row.uen_verified_uen && row.uen_verified_status && row.uen_verified_at
        ? {
            uen: row.uen_verified_uen,
            name: row.uen_verified_name,
            status: row.uen_verified_status,
            verified_at: row.uen_verified_at.toISOString(),
          }
        : null,
    keywords: row.keywords,
    status: row.status,
    featured_image_url: row.featured_image_url,
    external_url: row.external_url,
    redirect_url: row.redirect_url,
    homepage_featured: row.homepage_featured,
    view_count: row.view_count,
    created_by: row.created_by,
    expires_at: row.expires_at,
    created_at: row.created_at.toISOString(),
    published_at: row.published_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
    categories: row.category_row_id
      ? { id: row.category_row_id, name: row.category_name!, slug: row.category_slug! }
      : null,
    listing_images: images,
    tagIds: tagRows.map((r) => r.tagId),
  };
}

/** All experience tags, for the edit form's tag checkboxes. */
export async function getExperienceTags(): Promise<ListingTag[]> {
  return db
    .select({ id: experienceTags.id, name: experienceTags.name, slug: experienceTags.slug })
    .from(experienceTags)
    .orderBy(asc(experienceTags.name));
}

export type FeaturedAdminRow = {
  id: string;
  title: string;
  status: string;
  categoryName: string | null;
  imageUrl: string | null;
  /** The slider clip, or… */
  videoUrl: string | null;
  /** …an image/GIF slide instead. The homepage skips a picked listing with neither. */
  slideImageUrl: string | null;
  /** Syndicated from elsewhere (fd.sg etc.) rather than owned here. */
  synced: boolean;
};

const featuredAdminSelect = {
  id: listings.id,
  title: listings.title,
  status: listings.status,
  categoryName: categories.name,
  // Same choice as pickListingImage: the flagged photo, else the first by
  // position, else the listing's own featured_image_url.
  imageUrl: sql<string | null>`coalesce(
    (select ${listingImages.url} from ${listingImages}
      where ${listingImages.listingId} = ${listings.id}
      order by ${listingImages.isFeatured} desc, ${listingImages.position} asc
      limit 1),
    ${listings.featuredImageUrl}
  )`,
  externalUrl: listings.externalUrl,
  videoUrl: listings.featuredVideoUrl,
  slideImageUrl: listings.featuredSlideImageUrl,
};

function toFeaturedAdminRow(r: {
  id: string;
  title: string;
  status: string;
  categoryName: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  videoUrl: string | null;
  slideImageUrl: string | null;
}): FeaturedAdminRow {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    categoryName: r.categoryName,
    imageUrl: r.imageUrl,
    videoUrl: r.videoUrl,
    slideImageUrl: r.slideImageUrl,
    synced: r.externalUrl !== null,
  };
}

/** Listings staff have picked for the homepage, in display order. Includes
 *  ones that currently can't show (unpublished / no photo) so staff can see
 *  and fix or remove them rather than wonder where they went. */
export async function getFeaturedAdminListings(
  role: string | null | undefined,
): Promise<FeaturedAdminRow[]> {
  requireStaffRole(role);
  const rows = await db
    .select(featuredAdminSelect)
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(eq(listings.homepageFeatured, true))
    .orderBy(asc(listings.homepageFeaturedOrder), desc(listings.createdAt));
  return rows.map(toFeaturedAdminRow);
}

/** Published, not-yet-picked listings to choose from; `q` narrows by title. */
export async function searchFeaturableListings(
  role: string | null | undefined,
  q: string,
  limit = 20,
): Promise<FeaturedAdminRow[]> {
  requireStaffRole(role);
  const term = q.trim();
  const rows = await db
    .select(featuredAdminSelect)
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(
      and(
        eq(listings.status, "published"),
        eq(listings.homepageFeatured, false),
        term
          ? or(ilike(listings.title, `%${term}%`), ilike(listings.location, `%${term}%`))
          : undefined,
      ),
    )
    .orderBy(desc(listings.createdAt))
    .limit(limit);
  return rows.map(toFeaturedAdminRow);
}
