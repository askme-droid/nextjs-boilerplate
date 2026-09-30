import * as cheerio from "cheerio";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, listingImages, listings } from "@/lib/db/schema";
import { slugify } from "./slug";

/**
 * On-demand sync from fd.sg's public listing archive (digital.fd.sg's own
 * ACADP-plugin directory — see the Railway/Drizzle migration history for
 * background). There's no API for their listings (checked: only categories/
 * locations taxonomies are exposed), so this scrapes their public pages —
 * the same approach used for the original one-off import, now made
 * re-runnable via an admin button instead of a throwaway script.
 *
 * Only ever ADDS new listings (matched by external_url, never re-scraped or
 * updated once imported) — safe to click repeatedly, never creates
 * duplicates or touches a listing after it's been imported once.
 */

const ARCHIVE_BASE = "https://www.digital.fd.sg/fdsg-digital-flyer-deals-e-vouchers/";
const MAX_ARCHIVE_PAGES = 10; // safety cap against an infinite loop, not a real expected limit

export type SyncResult = { added: number; skipped: number; total: number };

/** All listing detail URLs currently on fd.sg's archive, across every page.
 *  Stops once a page adds no URLs we haven't already seen (handles both an
 *  empty last page and a theme that just re-serves the last valid page for
 *  an out-of-range page number). */
async function fetchListingUrls(): Promise<string[]> {
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_ARCHIVE_PAGES; page++) {
    const pageUrl = page === 1 ? ARCHIVE_BASE : `${ARCHIVE_BASE}page/${page}/`;
    const res = await fetch(pageUrl);
    if (!res.ok) break;

    const html = await res.text();
    const $ = cheerio.load(html);
    const links = $(".acadp-listings-title-block a")
      .map((_, el) => $(el).attr("href"))
      .get()
      .filter((href): href is string => !!href);

    const before = seen.size;
    for (const link of links) seen.add(link);
    if (seen.size === before) break;
  }

  return [...seen];
}

/** Strips WP's auto-generated resize suffix (e.g. "-1024x477") so the same
 *  source image isn't attached twice at different sizes. */
function dedupeImages(imgs: string[]): string[] {
  const seen = new Map<string, string>();
  for (const src of imgs) {
    const base = src.replace(/(-\d+x\d+)+(?=\.\w+$)/, "");
    if (!seen.has(base)) seen.set(base, src);
  }
  return [...seen.values()];
}

type ScrapedListing = {
  title: string;
  sourceUrl: string;
  category: string | null;
  description: string | null;
  imgs: string[];
};

/** Same extraction as the one-off import: title, category (from the
 *  "Category / Posted..." meta line, absent for some listings), a
 *  description only when one genuinely exists (most fd.sg listings are
 *  flyer-image-only, no body text), and every non-logo uploaded image. */
async function scrapeListing(url: string): Promise<ScrapedListing | null> {
  const res = await fetch(url);
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim();
  if (!title) return null;

  const bodyText = $("body").text();
  const catMatch = bodyText.match(/\n\s*([A-Za-z & ]+?)\s*\/\s*Posted/);
  const category = catMatch ? catMatch[1].trim() : null;

  const afterMeta = bodyText.split(/Posted[^\n]*\n/)[1] ?? "";
  const beforeListingId = afterMeta.split(/Listing ID:/)[0].trim();
  const description = beforeListingId.length > 40 ? beforeListingId : null;

  const rawImgs = $("img")
    .map((_, el) => $(el).attr("src"))
    .get()
    .filter((src): src is string => !!src && src.includes("/wp-content/uploads/") && !src.includes("FDSG.png"));

  return { title, sourceUrl: url, category, description, imgs: dedupeImages([...new Set(rawImgs)]) };
}

/** Fetches fd.sg's current listing URLs, imports whichever ones we don't
 *  already have (matched by external_url), and leaves everything else
 *  untouched. Safe to call as often as wanted. */
export async function syncFdsgListings(): Promise<SyncResult> {
  const urls = await fetchListingUrls();

  const existingExternal = await db
    .select({ externalUrl: listings.externalUrl })
    .from(listings)
    .where(isNotNull(listings.externalUrl));
  const existingUrls = new Set(existingExternal.map((r) => r.externalUrl).filter((u): u is string => !!u));

  const newUrls = urls.filter((u) => !existingUrls.has(u));
  if (newUrls.length === 0) {
    return { added: 0, skipped: urls.length, total: urls.length };
  }

  const existingCats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c.id]));

  const existingSlugRows = await db.select({ slug: listings.slug }).from(listings);
  const takenSlugs = new Set(existingSlugRows.map((r) => r.slug));

  function uniqueSlug(title: string): string {
    const base = slugify(title) || "listing";
    let slug = base;
    let n = 2;
    while (takenSlugs.has(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
    takenSlugs.add(slug);
    return slug;
  }

  let added = 0;
  for (const url of newUrls) {
    const scraped = await scrapeListing(url);
    if (!scraped) continue;

    let categoryId: string | null = null;
    if (scraped.category) {
      const key = scraped.category.toLowerCase();
      categoryId = catByName.get(key) ?? null;
      if (!categoryId) {
        const catSlug = slugify(scraped.category);
        const [catRow] = await db
          .insert(categories)
          .values({ name: scraped.category, slug: catSlug })
          .returning({ id: categories.id });
        categoryId = catRow.id;
        catByName.set(key, categoryId);
      }
    }

    const slug = uniqueSlug(scraped.title);
    const [row] = await db
      .insert(listings)
      .values({
        title: scraped.title,
        slug,
        description: scraped.description,
        categoryId,
        status: "published",
        externalUrl: scraped.sourceUrl,
      })
      .returning({ id: listings.id });

    for (let i = 0; i < scraped.imgs.length; i++) {
      await db.insert(listingImages).values({
        listingId: row.id,
        url: scraped.imgs[i],
        position: i,
        isFeatured: i === 0,
      });
    }
    added += 1;
  }

  return { added, skipped: urls.length - newUrls.length, total: urls.length };
}
