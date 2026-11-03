import "server-only";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { heroSlides, listingImages, listings } from "@/lib/db/schema";
import { deleteFileByKey, keyFromPublicUrl, listFiles, type StoredFile } from "./r2";

/**
 * Finds files in R2 that nothing uses any more — left behind by listings and
 * photos deleted before the automatic clean-up existed (lib/listings/cleanup.ts).
 *
 * Only the folders this site uploads into are looked at, so anything else in
 * the bucket is never touched. Files from the last day are skipped too: a
 * slider video is uploaded a moment before its listing is saved.
 */
const APP_FOLDERS = ["listings/", "social/", "featured-images/", "featured-videos/", "hero/"];
const RECENT_MS = 24 * 60 * 60 * 1000;

export type UnusedScan = { scanned: number; unused: StoredFile[]; unusedBytes: number };

async function referencedKeys(): Promise<Set<string>> {
  const [images, rows, slides] = await Promise.all([
    db.select({ url: listingImages.url }).from(listingImages),
    db
      .select({
        a: listings.featuredImageUrl,
        b: listings.featuredVideoUrl,
        c: listings.featuredSlideImageUrl,
        d: listings.ogImageUrl,
      })
      .from(listings),
    db.select({ url: heroSlides.imageUrl }).from(heroSlides).where(isNotNull(heroSlides.imageUrl)),
  ]);
  const urls = [
    ...images.map((r) => r.url),
    ...rows.flatMap((r) => [r.a, r.b, r.c, r.d]),
    ...slides.map((r) => r.url),
  ];
  const keys = new Set<string>();
  for (const url of urls) {
    const key = url ? keyFromPublicUrl(url) : null;
    if (key) keys.add(key);
  }
  return keys;
}

export async function findUnusedFiles(): Promise<UnusedScan> {
  const files = (await Promise.all(APP_FOLDERS.map((folder) => listFiles(folder)))).flat();
  const used = await referencedKeys();
  const cutoff = Date.now() - RECENT_MS;
  const unused = files.filter((f) => !used.has(f.key) && f.lastModified.getTime() < cutoff);
  return { scanned: files.length, unused, unusedBytes: unused.reduce((sum, f) => sum + f.size, 0) };
}

/** Deletes what findUnusedFiles finds right now (checked again, not trusted
 *  from an earlier scan). */
export async function deleteUnusedFiles(): Promise<{ deleted: number; bytes: number; failed: number }> {
  const { unused } = await findUnusedFiles();
  let deleted = 0;
  let bytes = 0;
  let failed = 0;
  for (const file of unused) {
    try {
      await deleteFileByKey(file.key);
      deleted += 1;
      bytes += file.size;
    } catch {
      failed += 1;
    }
  }
  return { deleted, bytes, failed };
}
