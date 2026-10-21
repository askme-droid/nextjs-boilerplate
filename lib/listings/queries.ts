import { cache } from "react";
import { isVerifiedBusiness } from "@/lib/business/verify-listing";
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { POPULAR_MIN_VIEWS, TRENDING_MIN_VIEWS, type ShowFilter } from "./badges";
import { notExpired } from "./expiry";
import { db } from "@/lib/db/client";
import { categories, experienceTags, listingExperienceTags, listingImages, listings } from "@/lib/db/schema";

export const PAGE_SIZE = 12;

// The date visitors see and the newest-first order (see the schema comment).
const publishedAtSql = sql<Date>`coalesce(${listings.publishedAt}, ${listings.createdAt})`;

// Same rule as isVerifiedBusiness (lib/business/verify-listing.ts), in SQL
// for the listing grids: the saved UEN is the one checked against ACRA, and
// ACRA lists the business as live ("Live", "Live Company", "Registered").
const verifiedBusinessSql = sql<boolean>`coalesce(${listings.companyUen} = ${listings.uenVerifiedUen} and (lower(${listings.uenVerifiedStatus}) like 'live%' or lower(${listings.uenVerifiedStatus}) = 'registered'), false)`;

export type ListingCategory = { id: string; name: string; slug: string };

export type ListingImage = {
  id: string;
  url: string;
  alt_text: string | null;
  is_featured: boolean;
  position: number;
};

export type ListingWithRelations = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category_id: string | null;
  location: string | null;
  keywords: string[] | null;
  status: string;
  featured_image_url: string | null;
  // Set only for listings syndicated from elsewhere (e.g. fd.sg) — the card
  // and the detail route both send visitors there instead of showing a
  // local copy. Null for every listing that's ours.
  external_url: string | null;
  // Set when a client asked for their listing to go to their own landing
  // page. Like external_url the card and detail route send visitors there,
  // but the listing is ours (see the schema comment on redirectUrl).
  redirect_url: string | null;
  view_count: number;
  homepage_featured: boolean;
  /** UEN checked against ACRA and the business is live (Verified badge). */
  verified_business: boolean;
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
  /** Date shown to visitors ("Posted …", New badge): published_at, or
   *  created_at for a listing that was never published. */
  published_at: string;
  updated_at: string;
  categories: ListingCategory | null;
  listing_images: Pick<ListingImage, "id" | "url" | "is_featured" | "position">[];
};

export type ListingTag = { id: string; name: string; slug: string };

export type ListingDetail = Omit<ListingWithRelations, "listing_images"> & {
  listing_images: ListingImage[];
  experience_tags: ListingTag[];
  company_name: string | null;
  company_uen: string | null;
  social_links: string[];
  cta_label: string | null;
  cta_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  view_count: number;
  /** The listing's UEN was checked against ACRA and the business is live
   *  (lib/business/verify-listing.ts) — shows the "Verified business" badge. */
  verified_business: boolean;
  /** ACRA's registered name for the UEN, when verified. */
  verified_business_name: string | null;
  /** AEO/GEO fields (lib/seo/aeo.ts). offer_price is a "25.90" string. */
  quick_answer: string | null;
  faqs: { q: string; a: string }[];
  offer_price: string | null;
  offer_discount: string | null;
  redemption_info: string | null;
  audience: string | null;
  key_points: string[];
};

export type ListingsResult = {
  listings: ListingWithRelations[];
  totalCount: number;
  page: number;
  totalPages: number;
};

export type ListingsFilter = {
  /** Free-text search over title/description. */
  q?: string;
  /** Category slug, as it appears in the URL. */
  category?: string;
  /** Free-text match against a listing's location — there's no location
   *  taxonomy, just a free-text field per listing, so this is a substring
   *  search rather than an exact/dropdown match. */
  location?: string;
  /** Experience tag slug, as it appears in the URL. */
  experience?: string;
  /** Badge filter ("Show" dropdown): featured / trending / popular / verified. */
  show?: ShowFilter | "";
  /** 1-based page number. */
  page?: number;
};

/** All categories, for the filter dropdown. Public data, small table. */
export async function getCategories(): Promise<ListingCategory[]> {
  return db
    .select({ id: categories.id, name: categories.name, slug: categories.slug })
    .from(categories)
    .orderBy(asc(categories.name));
}

/**
 * Escapes a search term for safe use inside a Postgres LIKE/ILIKE pattern:
 * a literal backslash, `%` or `_` would otherwise act as a wildcard or
 * escape character.
 */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Shared status/search/category filter for the count and data queries below.
 * Joining `categories` and filtering on its slug acts as an inner join in
 * effect (a non-matching row's `categories` comes back null, which then
 * fails the slug equality) — callers are expected to have already validated
 * `category` against a real slug (see app/page.tsx), since an unknown slug
 * would otherwise read as "no listings" rather than "filter ignored".
 */
function buildListingsWhere(filter: ListingsFilter): SQL {
  // Expired listings drop out of browse/search (see lib/listings/expiry.ts).
  const conditions: SQL[] = [eq(listings.status, "published"), notExpired];

  const q = filter.q?.trim();
  if (q) {
    // A comma or parenthesis has no special meaning here (unlike the old
    // PostgREST `or=` filter grammar), but stripped anyway to keep this a
    // plain keyword search.
    const term = escapeLikeTerm(q.replace(/[,()]/g, " ").trim());
    if (term) {
      const pattern = `%${term}%`;
      conditions.push(or(ilike(listings.title, pattern), ilike(listings.description, pattern))!);
    }
  }

  if (filter.category) {
    conditions.push(eq(categories.slug, filter.category));
  }

  const location = filter.location?.trim();
  if (location) {
    conditions.push(ilike(listings.location, `%${escapeLikeTerm(location)}%`));
  }

  if (filter.experience) {
    // A subquery rather than a join: this function only returns a WHERE
    // clause, not a FROM/JOIN change, so the count query and the data query
    // below don't both need to know about the experience-tags join too.
    conditions.push(
      inArray(
        listings.id,
        db
          .select({ id: listingExperienceTags.listingId })
          .from(listingExperienceTags)
          .innerJoin(experienceTags, eq(listingExperienceTags.tagId, experienceTags.id))
          .where(eq(experienceTags.slug, filter.experience)),
      ),
    );
  }

  // Same thresholds as the card badges (lib/listings/badges.ts).
  if (filter.show === "featured") conditions.push(eq(listings.homepageFeatured, true));
  if (filter.show === "trending")
    conditions.push(and(gte(listings.viewCount, TRENDING_MIN_VIEWS), lt(listings.viewCount, POPULAR_MIN_VIEWS))!);
  if (filter.show === "popular") conditions.push(gte(listings.viewCount, POPULAR_MIN_VIEWS));
  if (filter.show === "verified") conditions.push(sql`${verifiedBusinessSql}`);

  return and(...conditions)!;
}

type ImageRow = { listingId: string; id: string; url: string; is_featured: boolean; position: number };

async function attachImages(
  listingIds: string[],
): Promise<Map<string, Pick<ListingImage, "id" | "url" | "is_featured" | "position">[]>> {
  const byListing = new Map<string, Pick<ListingImage, "id" | "url" | "is_featured" | "position">[]>();
  if (listingIds.length === 0) return byListing;

  const rows: ImageRow[] = await db
    .select({
      listingId: listingImages.listingId,
      id: listingImages.id,
      url: listingImages.url,
      is_featured: listingImages.isFeatured,
      position: listingImages.position,
    })
    .from(listingImages)
    .where(inArray(listingImages.listingId, listingIds))
    .orderBy(asc(listingImages.position));

  for (const { listingId, ...image } of rows) {
    const list = byListing.get(listingId) ?? [];
    list.push(image);
    byListing.set(listingId, list);
  }
  return byListing;
}

/**
 * Published listings matching the given search/category/page, newest first.
 */
export async function getListings(
  filter: ListingsFilter = {},
): Promise<ListingsResult> {
  const requestedPage = Math.max(1, filter.page ?? 1);
  const where = buildListingsWhere(filter);

  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(where);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

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
      view_count: listings.viewCount,
      homepage_featured: listings.homepageFeatured,
      verified_business: verifiedBusinessSql,
      created_by: listings.createdBy,
      expires_at: listings.expiresAt,
      created_at: listings.createdAt,
      published_at: publishedAtSql,
      updated_at: listings.updatedAt,
      category_row_id: categories.id,
      category_name: categories.name,
      category_slug: categories.slug,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(where)
    .orderBy(desc(publishedAtSql), desc(listings.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const imagesByListing = await attachImages(rows.map((r) => r.id));

  const result: ListingWithRelations[] = rows.map((r) => ({
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
    view_count: r.view_count,
    homepage_featured: r.homepage_featured,
    verified_business: r.verified_business,
    created_by: r.created_by,
    expires_at: r.expires_at,
    created_at: r.created_at.toISOString(),
    published_at: new Date(r.published_at).toISOString(),
    updated_at: r.updated_at.toISOString(),
    categories: r.category_row_id
      ? { id: r.category_row_id, name: r.category_name!, slug: r.category_slug! }
      : null,
    listing_images: imagesByListing.get(r.id) ?? [],
  }));

  return { listings: result, totalCount, page, totalPages };
}

/**
 * Published listings for a fixed, already-ranked set of ids — "search by
 * image" results (see app/api/search-by-image/route.ts), which come back
 * from the vector-similarity query in best-match-first order that a normal
 * `WHERE id IN (...)` can't preserve. Re-sorted in JS instead of a SQL
 * ordinal trick since the id list is always small (a few dozen at most).
 */
export async function getListingsByIds(ids: string[]): Promise<ListingWithRelations[]> {
  if (ids.length === 0) return [];

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
      view_count: listings.viewCount,
      homepage_featured: listings.homepageFeatured,
      verified_business: verifiedBusinessSql,
      created_by: listings.createdBy,
      expires_at: listings.expiresAt,
      created_at: listings.createdAt,
      published_at: publishedAtSql,
      updated_at: listings.updatedAt,
      category_row_id: categories.id,
      category_name: categories.name,
      category_slug: categories.slug,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(and(inArray(listings.id, ids), eq(listings.status, "published"), notExpired));

  const imagesByListing = await attachImages(rows.map((r) => r.id));
  const rank = new Map(ids.map((id, i) => [id, i]));

  return rows
    .map((r) => ({
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
      view_count: r.view_count,
      homepage_featured: r.homepage_featured,
      verified_business: r.verified_business,
      created_by: r.created_by,
      expires_at: r.expires_at,
      created_at: r.created_at.toISOString(),
      published_at: new Date(r.published_at).toISOString(),
      updated_at: r.updated_at.toISOString(),
      categories: r.category_row_id
        ? { id: r.category_row_id, name: r.category_name!, slug: r.category_slug! }
        : null,
      listing_images: imagesByListing.get(r.id) ?? [],
    }))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

export type FeaturedVideoSlide = {
  id: string;
  title: string;
  slug: string;
  /** Set for syndicated listings — the slide opens there instead of locally. */
  externalUrl: string | null;
  /** Set when the client asked for a redirect to their own page. */
  redirectUrl: string | null;
  categoryName: string | null;
  /** "video" plays the clip; "image" shows an image or animated GIF. */
  kind: "video" | "image";
  /** The clip (kind "video") or the slide image/GIF (kind "image"). */
  mediaUrl: string;
  /** The listing's photo, shown until a video has loaded; may be absent. */
  posterUrl: string | null;
};

/**
 * Slides for the homepage "Featured listings" slider: published listings
 * that staff picked (homepage_featured) *and* gave a video or a slide image
 * (still or animated GIF), in the order set on /admin/listings/featured.
 * There is deliberately no top-up with other listings — a picked listing
 * without either has nothing to show.
 */
export async function getFeaturedVideos(limit = 6): Promise<FeaturedVideoSlide[]> {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      slug: listings.slug,
      externalUrl: listings.externalUrl,
      redirectUrl: listings.redirectUrl,
      categoryName: categories.name,
      videoUrl: listings.featuredVideoUrl,
      slideImageUrl: listings.featuredSlideImageUrl,
      // Same photo choice as pickListingImage: the flagged one, else the first
      // by position, else the listing's own featured_image_url.
      posterUrl: sql<string | null>`coalesce(
        (select ${listingImages.url} from ${listingImages}
          where ${listingImages.listingId} = ${listings.id}
          order by ${listingImages.isFeatured} desc, ${listingImages.position} asc
          limit 1),
        ${listings.featuredImageUrl}
      )`,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(
      and(
        eq(listings.status, "published"),
        notExpired,
        eq(listings.homepageFeatured, true),
        or(isNotNull(listings.featuredVideoUrl), isNotNull(listings.featuredSlideImageUrl)),
      ),
    )
    .orderBy(asc(listings.homepageFeaturedOrder), desc(listings.createdAt))
    .limit(limit);

  return rows.flatMap(({ videoUrl, slideImageUrl, ...r }): FeaturedVideoSlide[] =>
    videoUrl
      ? [{ ...r, kind: "video", mediaUrl: videoUrl }]
      : slideImageUrl
        ? [{ ...r, kind: "image", mediaUrl: slideImageUrl }]
        : [],
  );
}

/**
 * Every published, unexpired listing, for the sitemap — including synced
 * fd.sg listings and client-redirected ones (staff asked for all listings to
 * be listed), even though those pages forward visitors elsewhere.
 */
export async function getSitemapListings(): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: listings.slug, updatedAt: listings.updatedAt })
    .from(listings)
    .where(
      and(
        eq(listings.status, "published"),
        notExpired,
      ),
    )
    .orderBy(desc(listings.updatedAt));
}

/** Published, unexpired listings with the short facts an AI tool needs, for
 *  /llms.txt (app/llms.txt/route.ts). Most recently updated first. */
export async function getLlmsListings(): Promise<
  {
    title: string;
    slug: string;
    quickAnswer: string | null;
    audience: string | null;
    description: string | null;
    location: string | null;
    category: string | null;
    expiresAt: string | null;
  }[]
> {
  return db
    .select({
      title: listings.title,
      slug: listings.slug,
      quickAnswer: listings.quickAnswer,
      audience: listings.audience,
      description: listings.description,
      location: listings.location,
      category: categories.name,
      expiresAt: listings.expiresAt,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(and(eq(listings.status, "published"), notExpired))
    .orderBy(desc(listings.updatedAt))
    .limit(500);
}

/**
 * A single published listing by slug, with all its images and experience
 * tags, or `null` if it doesn't exist or isn't published.
 *
 * Wrapped in React's `cache()` so the detail page's `generateMetadata` and
 * its page component — both of which need this same row — share one query
 * per request instead of fetching it twice.
 */
export const getListingBySlug = cache(
  (slug: string): Promise<ListingDetail | null> =>
    loadListingDetail(and(eq(listings.slug, slug), eq(listings.status, "published"))!),
);

/** Any listing by id, whatever its status — for the staff preview
 *  (app/admin/listings/[id]/preview). Callers must check staff access. */
export function getListingForPreview(id: string): Promise<ListingDetail | null> {
  return loadListingDetail(eq(listings.id, id));
}

async function loadListingDetail(where: SQL): Promise<ListingDetail | null> {
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
      og_title: listings.ogTitle,
      og_description: listings.ogDescription,
      og_image_url: listings.ogImageUrl,
      quick_answer: listings.quickAnswer,
      faqs: listings.faqs,
      offer_price: listings.offerPrice,
      offer_discount: listings.offerDiscount,
      redemption_info: listings.redemptionInfo,
      audience: listings.audience,
      key_points: listings.keyPoints,
      uen_verified_uen: listings.uenVerifiedUen,
      uen_verified_name: listings.uenVerifiedName,
      uen_verified_status: listings.uenVerifiedStatus,
      keywords: listings.keywords,
      status: listings.status,
      featured_image_url: listings.featuredImageUrl,
      external_url: listings.externalUrl,
      redirect_url: listings.redirectUrl,
      view_count: listings.viewCount,
      homepage_featured: listings.homepageFeatured,
      created_by: listings.createdBy,
      expires_at: listings.expiresAt,
      created_at: listings.createdAt,
      published_at: publishedAtSql,
      updated_at: listings.updatedAt,
      category_row_id: categories.id,
      category_name: categories.name,
      category_slug: categories.slug,
    })
    .from(listings)
    .leftJoin(categories, eq(listings.categoryId, categories.id))
    .where(where)
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [images, tags] = await Promise.all([
    db
      .select({
        id: listingImages.id,
        url: listingImages.url,
        alt_text: listingImages.altText,
        is_featured: listingImages.isFeatured,
        position: listingImages.position,
      })
      .from(listingImages)
      .where(eq(listingImages.listingId, row.id))
      .orderBy(asc(listingImages.position)),
    db
      .select({ id: experienceTags.id, name: experienceTags.name, slug: experienceTags.slug })
      .from(listingExperienceTags)
      .innerJoin(experienceTags, eq(listingExperienceTags.tagId, experienceTags.id))
      .where(eq(listingExperienceTags.listingId, row.id)),
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
    og_title: row.og_title,
    og_description: row.og_description,
    og_image_url: row.og_image_url,
    view_count: row.view_count,
    verified_business: isVerifiedBusiness(row),
    verified_business_name: isVerifiedBusiness(row) ? row.uen_verified_name : null,
    quick_answer: row.quick_answer,
    faqs: row.faqs ?? [],
    offer_price: row.offer_price,
    offer_discount: row.offer_discount,
    redemption_info: row.redemption_info,
    audience: row.audience,
    key_points: row.key_points ?? [],
    keywords: row.keywords,
    status: row.status,
    featured_image_url: row.featured_image_url,
    external_url: row.external_url,
    redirect_url: row.redirect_url,
    homepage_featured: row.homepage_featured,
    created_by: row.created_by,
    expires_at: row.expires_at,
    created_at: row.created_at.toISOString(),
    published_at: new Date(row.published_at).toISOString(),
    updated_at: row.updated_at.toISOString(),
    categories: row.category_row_id
      ? { id: row.category_row_id, name: row.category_name!, slug: row.category_slug! }
      : null,
    listing_images: images,
    experience_tags: tags,
  };
}
