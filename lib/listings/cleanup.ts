import "server-only";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deletedSources, heroSlides, listingImages, listings } from "@/lib/db/schema";
import { deleteFileByUrl, isStoredFileUrl } from "@/lib/storage/r2";
import { normalizeSourceUrl } from "./source-url";

/**
 * Tidying up after a listing or photo is deleted:
 *  - its photos and videos are removed from R2 (only our own files, and only
 *    when nothing else still uses the same file);
 *  - a deleted fd.sg listing is remembered, so the 6-hourly sync doesn't
 *    import it again.
 */

/** Every file a listing points at: its photos, the homepage slide video or
 *  image, and the social-share image. */
export async function listingFileUrls(listingId: string): Promise<string[]> {
  const [row] = await db
    .select({
      featuredImageUrl: listings.featuredImageUrl,
      featuredVideoUrl: listings.featuredVideoUrl,
      featuredSlideImageUrl: listings.featuredSlideImageUrl,
      ogImageUrl: listings.ogImageUrl,
    })
    .from(listings)
    .where(eq(listings.id, listingId));
  const images = await db
    .select({ url: listingImages.url })
    .from(listingImages)
    .where(eq(listingImages.listingId, listingId));
  return [
    ...images.map((i) => i.url),
    row?.featuredImageUrl,
    row?.featuredVideoUrl,
    row?.featuredSlideImageUrl,
    row?.ogImageUrl,
  ].filter((u): u is string => !!u);
}

/** Deletes from R2 those of `urls` that are our files and no longer used by
 *  any listing, photo or header slide. Best-effort: never throws. */
export async function deleteUnusedFiles(urls: string[]): Promise<number> {
  const ours = [...new Set(urls)].filter(isStoredFileUrl);
  let deleted = 0;
  for (const url of ours) {
    try {
      const [inImages, inListings, inSlides] = await Promise.all([
        db.$count(listingImages, eq(listingImages.url, url)),
        db.$count(
          listings,
          or(
            eq(listings.featuredImageUrl, url),
            eq(listings.featuredVideoUrl, url),
            eq(listings.featuredSlideImageUrl, url),
            eq(listings.ogImageUrl, url),
          ),
        ),
        db.$count(heroSlides, eq(heroSlides.imageUrl, url)),
      ]);
      if (inImages + inListings + inSlides > 0) continue;
      await deleteFileByUrl(url);
      deleted += 1;
    } catch (e) {
      console.error("file cleanup failed:", e instanceof Error ? e.message : e);
    }
  }
  return deleted;
}

// Created here as well as by migrations/0001, so the site works even before
// that migration has been applied to a database.
async function ensureDeletedSourcesTable() {
  await db.run(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS `deleted_sources` (`source_url` text PRIMARY KEY NOT NULL, `title` text, `deleted_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL)",
    ),
  );
}

/** Remembers a deleted fd.sg listing so the sync skips it from now on. */
export async function rememberDeletedSource(sourceUrl: string, title: string | null) {
  try {
    await ensureDeletedSourcesTable();
    await db
      .insert(deletedSources)
      .values({ sourceUrl: normalizeSourceUrl(sourceUrl), title })
      .onConflictDoNothing();
  } catch (e) {
    console.error("could not remember deleted fd.sg listing:", e instanceof Error ? e.message : e);
  }
}

/** fd.sg addresses (normalised) that staff deleted here. */
export async function deletedSourceUrls(): Promise<Set<string>> {
  try {
    await ensureDeletedSourcesTable();
    const rows = await db.select({ sourceUrl: deletedSources.sourceUrl }).from(deletedSources);
    return new Set(rows.map((r) => r.sourceUrl));
  } catch {
    return new Set();
  }
}

export type DeletedSource = { sourceUrl: string; title: string | null; deletedAt: Date };

/** The fd.sg listings the sync is skipping, newest deletion first. */
export async function listDeletedSources(): Promise<DeletedSource[]> {
  try {
    await ensureDeletedSourcesTable();
    return await db
      .select({ sourceUrl: deletedSources.sourceUrl, title: deletedSources.title, deletedAt: deletedSources.deletedAt })
      .from(deletedSources)
      .orderBy(desc(deletedSources.deletedAt));
  } catch {
    return [];
  }
}

/** Lets the sync import these fd.sg listings again. */
export async function forgetDeletedSources(sourceUrls: string[]) {
  if (sourceUrls.length === 0) return;
  await ensureDeletedSourcesTable();
  await db.delete(deletedSources).where(inArray(deletedSources.sourceUrl, sourceUrls));
}
