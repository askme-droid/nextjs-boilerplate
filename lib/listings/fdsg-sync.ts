import * as cheerio from "cheerio";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories, listingImages, listings } from "@/lib/db/schema";
import { embedImageUrl } from "./embeddings";
import { slugify } from "./slug";

/**
 * On-demand sync from the real www.fd.sg's public listing archive (its own
 * ACADP-plugin directory — the homepage itself, paginated). There's no API
 * for their listings (checked: only categories/locations taxonomies are
 * exposed), so this scrapes their public pages.
 *
 * IMPORTANT: this originally (wrongly) pointed at digital.fd.sg, a separate
 * staging/demo site with mostly different content — of the 22 listings that
 * first import pulled in, only 3 titles actually existed on the real fd.sg.
 * Those 19 were deleted and the 3 real matches corrected to their real
 * fd.sg URL; this module now points at the real site so every future sync
 * pulls from the actual source instead.
 *
 * Only ever ADDS new listings (matched by external_url, never re-scraped or
 * updated once imported) — safe to click repeatedly, never creates
 * duplicates or touches a listing after it's been imported once.
 */

// fd.sg isn't consistent about category labels across its own listings —
// the first full sync created "Food & Beverage", "Food & Beverages", and
// "Food & Drink" as three separate categories (18/1/4 listings), and
// "Softwares" alongside "IT & Software" (3/1). Map known variants to the
// one that already has the most listings, so future syncs reuse it instead
// of fragmenting further. Keyed lowercase; extend this if fd.sg introduces
// another variant.
const CATEGORY_ALIASES: Record<string, string> = {
  "food & beverage": "Food & Beverages",
  "food & drink": "Food & Beverages",
  softwares: "IT & Software",
};

// The real fd.sg's own listing archive is its homepage, paginated
// (/page/2/, /page/3/, ...) — not a separate landing page the way
// digital.fd.sg had one.
const ARCHIVE_BASE = "https://www.fd.sg/";
const MAX_ARCHIVE_PAGES = 20; // safety cap against an infinite loop, not a real expected limit

// Each new listing now costs a scrape plus a CLIP embedding per image, not
// just an HTTP fetch — expensive enough that importing a large batch of new
// listings in one run risks the function's duration limit (see maxDuration
// on app/admin/listings/synced/page.tsx). Capping per run keeps each
// "Refresh" click bounded; the button is already designed to be clicked
// repeatedly, so whatever's left over is picked up next click.
const MAX_NEW_PER_RUN = 20;

export type SyncResult = {
  added: number;
  skipped: number;
  total: number;
  remaining: number;
  /** Existing synced listings whose created date was corrected to fd.sg's. */
  datesUpdated: number;
};

/** Normalised form of an fd.sg listing URL for matching (scheme, www,
 *  case and trailing slash ignored). */
export function normalizeSourceUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${decodeURIComponent(u.pathname).replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

const FEED_BASE = "https://www.fd.sg/feed/?post_type=acadp_listings";
const MAX_FEED_PAGES = 50;

/**
 * When each fd.sg listing was originally published, keyed by normalised URL.
 * The listing pages themselves only say "Posted 7 years ago", but
 * WordPress's RSS feed for the listings post type carries the exact
 * <pubDate>; it's paginated with &paged=N (10 per page by default) and
 * returns 404 past the last page.
 */
export async function fetchSourceDates(): Promise<Map<string, Date>> {
  const dates = new Map<string, Date>();
  for (let page = 1; page <= MAX_FEED_PAGES; page++) {
    const res = await fetch(page === 1 ? FEED_BASE : `${FEED_BASE}&paged=${page}`);
    if (!res.ok) break;
    const $ = cheerio.load(await res.text(), { xml: true });
    const items = $("item");
    if (items.length === 0) break;
    const before = dates.size;
    items.each((_, item) => {
      const link = $(item).find("link").first().text().trim();
      const published = new Date($(item).find("pubDate").first().text().trim());
      if (link && !Number.isNaN(published.getTime())) dates.set(normalizeSourceUrl(link), published);
    });
    if (dates.size === before) break; // same page served again
  }
  return dates;
}

/** Sets created_at on already-imported synced listings to fd.sg's original
 *  publish date where it differs. Returns how many were changed. */
async function backfillSourceDates(dates: Map<string, Date>): Promise<number> {
  if (dates.size === 0) return 0;
  const synced = await db
    .select({ id: listings.id, externalUrl: listings.externalUrl, createdAt: listings.createdAt })
    .from(listings)
    .where(isNotNull(listings.externalUrl));
  let changed = 0;
  for (const row of synced) {
    const source = row.externalUrl ? dates.get(normalizeSourceUrl(row.externalUrl)) : undefined;
    if (!source || source.getTime() === row.createdAt.getTime()) continue;
    await db
      .update(listings)
      .set({ createdAt: source })
      .where(and(eq(listings.id, row.id), ne(listings.createdAt, source)));
    changed += 1;
  }
  return changed;
}

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
  // Not just the first <h1>: the theme also renders an empty
  // <h1 class="entry-title"> before the real one — ACADP's own listing
  // title is always .acadp-no-margin, and picking the literal first <h1>
  // silently grabbed the empty one on every fd.sg page tested.
  const title = $("h1.acadp-no-margin").first().text().trim();
  if (!title) return null;

  // The theme wraps every lazy-loaded <img> in a <noscript> fallback, and
  // cheerio parses <noscript> content as a raw text node rather than markup
  // — so left in place, $("body").text() returns literal `<img src="...">`
  // source for every image on the page. Strip it (and <script>) before
  // reading any text out of the page.
  $("script, noscript, style").remove();

  // Scope to the actual post body instead of the whole page: the full body
  // text also carries the sidebar search widget's location dropdown (100+
  // options), which "Posted...Listing ID:" splitting can't tell apart from
  // real content once <noscript> stops masking it.
  const contentText = ($(".entry-content").first().text() || $("body").text()).trim();

  // Some listings show a "Popular Featured" badge inline before the actual
  // category, separated by a run of spaces rather than a line break — take
  // only the segment closest to "/ Posted" so the badge doesn't get pulled
  // in as part of the category name.
  const metaLineMatch = contentText.match(/\n[^\n]*\/\s*Posted[^\n]*/);
  let category: string | null = null;
  if (metaLineMatch) {
    const beforeSlash = metaLineMatch[0].split("/")[0];
    const parts = beforeSlash.split(/\s{2,}/).filter(Boolean);
    category = (parts[parts.length - 1] || "").trim() || null;
  }

  // ACADP always renders "Check all listings by this user / Add to
  // favourites / Report abuse" right after the real content (or immediately
  // after the meta line when a listing is flyer-image-only with no body
  // text) — cut there so those action labels never end up in the description.
  const withoutActions = contentText.split(/Check all listings by this user/)[0];
  const afterMeta = withoutActions.split(/Posted[^\n]*\n/)[1] ?? "";
  const cleaned = afterMeta.replace(/\n{2,}/g, "\n").replace(/[ \t]+/g, " ").trim();
  const description = cleaned.length > 40 ? cleaned.slice(0, 600) : null;

  // fd.sg lazy-loads every image — <img src> is a placeholder data: URI
  // until it scrolls into view, so the real URL is in data-src. Not an
  // issue on digital.fd.sg (no lazy-loading there), which is why this was
  // missed until switching the sync target.
  const rawImgs = $("img")
    .map((_, el) => $(el).attr("data-src") || $(el).attr("src"))
    .get()
    .filter(
      (src): src is string =>
        !!src &&
        src.includes("/wp-content/uploads/") &&
        !/fdsg-logo|social-media|\/ultimatemember\//i.test(src),
    );

  return { title, sourceUrl: url, category, description, imgs: dedupeImages([...new Set(rawImgs)]) };
}

/** Fetches fd.sg's current listing URLs, imports whichever ones we don't
 *  already have (matched by external_url), and leaves everything else
 *  untouched. Safe to call as often as wanted. */
export async function syncFdsgListings(): Promise<SyncResult> {
  const urls = await fetchListingUrls();
  // Original publish dates from fd.sg's feed. Best-effort: if the feed can't
  // be read, new imports just get today's date as before.
  const sourceDates = await fetchSourceDates().catch(() => new Map<string, Date>());
  const datesUpdated = await backfillSourceDates(sourceDates);

  const existingExternal = await db
    .select({ externalUrl: listings.externalUrl })
    .from(listings)
    .where(isNotNull(listings.externalUrl));
  const existingUrls = new Set(existingExternal.map((r) => r.externalUrl).filter((u): u is string => !!u));

  const allNewUrls = urls.filter((u) => !existingUrls.has(u));
  if (allNewUrls.length === 0) {
    return { added: 0, skipped: urls.length, total: urls.length, remaining: 0, datesUpdated };
  }

  const newUrls = allNewUrls.slice(0, MAX_NEW_PER_RUN);
  const remaining = allNewUrls.length - newUrls.length;

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
      const categoryName = CATEGORY_ALIASES[scraped.category.toLowerCase()] ?? scraped.category;
      const key = categoryName.toLowerCase();
      categoryId = catByName.get(key) ?? null;
      if (!categoryId) {
        const catSlug = slugify(categoryName);
        const [catRow] = await db
          .insert(categories)
          .values({ name: categoryName, slug: catSlug })
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
        // Keep fd.sg's original posting date rather than the import time.
        ...(sourceDates.get(normalizeSourceUrl(scraped.sourceUrl))
          ? { createdAt: sourceDates.get(normalizeSourceUrl(scraped.sourceUrl)) }
          : {}),
      })
      .returning({ id: listings.id });

    for (let i = 0; i < scraped.imgs.length; i++) {
      // Best-effort: a failed embedding (model cold start, a corrupt/odd
      // image) just leaves this image out of "search by image" results —
      // never worth failing the whole sync over.
      const embedding = await embedImageUrl(scraped.imgs[i]);
      await db.insert(listingImages).values({
        listingId: row.id,
        url: scraped.imgs[i],
        position: i,
        isFeatured: i === 0,
        embedding,
      });
    }
    added += 1;
  }

  return { added, skipped: urls.length - allNewUrls.length, total: urls.length, remaining, datesUpdated };
}
