import { cache } from "react";
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, experienceTags, listingExperienceTags, listingImages, listings } from "@/lib/db/schema";

export const PAGE_SIZE = 12;

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
  created_by: string | null;
  expires_at: string | null;
  created_at: string;
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
  const conditions: SQL[] = [eq(listings.status, "published")];

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
    .where(where)
    .orderBy(desc(listings.createdAt))
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
    created_by: r.created_by,
    expires_at: r.expires_at,
    created_at: r.created_at.toISOString(),
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
    .where(and(inArray(listings.id, ids), eq(listings.status, "published")));

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
      created_by: r.created_by,
      expires_at: r.expires_at,
      created_at: r.created_at.toISOString(),
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
  videoUrl: string;
  /** The listing's photo, shown until the video has loaded; may be absent. */
  posterUrl: string | null;
};

/**
 * Slides for the homepage "Featured listings" video slider: published
 * listings that staff picked (homepage_featured) *and* uploaded a video for,
 * in the order set on /admin/listings/featured. There is deliberately no
 * top-up with other listings — the slider is video-only, so a listing without
 * one has nothing to show.
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
        eq(listings.homepageFeatured, true),
        isNotNull(listings.featuredVideoUrl),
      ),
    )
    .orderBy(asc(listings.homepageFeaturedOrder), desc(listings.createdAt))
    .limit(limit);

  return rows.flatMap((r) => (r.videoUrl ? [{ ...r, videoUrl: r.videoUrl }] : []));
}

/**
 * Every published listing that has its own page, for the sitemap. Syndicated
 * listings (with an external_url) and listings a client asked to redirect
 * (redirect_url) are left out: their page just redirects.
 */
export async function getSitemapListings(): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: listings.slug, updatedAt: listings.updatedAt })
    .from(listings)
    .where(
      and(
        eq(listings.status, "published"),
        isNull(listings.externalUrl),
        isNull(listings.redirectUrl),
      ),
    )
    .orderBy(desc(listings.updatedAt));
}

/**
 * A single published listing by slug, with all its images and experience
 * tags, or `null` if it doesn't exist or isn't published.
 *
 * Wrapped in React's `cache()` so the detail page's `generateMetadata` and
 * its page component — both of which need this same row — share one query
 * per request instead of fetching it twice.
 */
export const getListingBySlug = cache(async (
  slug: string,
): Promise<ListingDetail | null> => {
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
      keywords: listings.keywords,
      status: listings.status,
      featured_image_url: listings.featuredImageUrl,
      external_url: listings.externalUrl,
      redirect_url: listings.redirectUrl,
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
    .where(and(eq(listings.slug, slug), eq(listings.status, "published")))
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
    keywords: row.keywords,
    status: row.status,
    featured_image_url: row.featured_image_url,
    external_url: row.external_url,
    redirect_url: row.redirect_url,
    created_by: row.created_by,
    expires_at: row.expires_at,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    categories: row.category_row_id
      ? { id: row.category_row_id, name: row.category_name!, slug: row.category_slug! }
      : null,
    listing_images: images,
    experience_tags: tags,
  };
});
