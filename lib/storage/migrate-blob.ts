import "server-only";
import { eq, like, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingImages, listings } from "@/lib/db/schema";
import { putFile } from "./r2";

/**
 * One-off move of files from the old Vercel Blob store to R2: copies every
 * file a listing still points at on *.public.blob.vercel-storage.com into R2
 * under the same path, then switches the database row to the new URL.
 *
 * Safe to run more than once: only rows still on a Blob URL are touched, so
 * files that failed (e.g. while the Blob store is suspended) are simply
 * picked up again on the next run.
 */

const BLOB_HOST_PATTERN = "%.public.blob.vercel-storage.com/%";

export function isVercelBlobUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export type BlobFileCounts = { images: number; featuredImages: number; videos: number; total: number };

export async function countBlobFiles(): Promise<BlobFileCounts> {
  const [images, featuredImages, videos] = await Promise.all([
    db.$count(listingImages, like(listingImages.url, `https://${BLOB_HOST_PATTERN}`)),
    db.$count(listings, like(listings.featuredImageUrl, `https://${BLOB_HOST_PATTERN}`)),
    db.$count(listings, like(listings.featuredVideoUrl, `https://${BLOB_HOST_PATTERN}`)),
  ]);
  return { images, featuredImages, videos, total: images + featuredImages + videos };
}

export type MigrationResult = { moved: number; failed: { url: string; reason: string }[] };

/** Copies one Blob file into R2 (same path) and returns its new URL. Files
 *  shared by several rows are only copied once per run. */
async function copyOne(url: string, cache: Map<string, string>): Promise<string> {
  const done = cache.get(url);
  if (done) return done;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Vercel Blob returned ${res.status}`);
  const key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const newUrl = await putFile(key, await res.arrayBuffer(), contentType);
  cache.set(url, newUrl);
  return newUrl;
}

export async function migrateBlobFilesToR2(): Promise<MigrationResult> {
  const result: MigrationResult = { moved: 0, failed: [] };
  const cache = new Map<string, string>();

  async function attempt(url: string, save: (newUrl: string) => Promise<unknown>) {
    try {
      await save(await copyOne(url, cache));
      result.moved += 1;
    } catch (e) {
      result.failed.push({ url, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const images = await db
    .select({ id: listingImages.id, url: listingImages.url })
    .from(listingImages)
    .where(like(listingImages.url, `https://${BLOB_HOST_PATTERN}`));
  for (const row of images) {
    await attempt(row.url, (newUrl) =>
      db.update(listingImages).set({ url: newUrl }).where(eq(listingImages.id, row.id)),
    );
  }

  const listingRows = await db
    .select({ id: listings.id, featuredImageUrl: listings.featuredImageUrl, featuredVideoUrl: listings.featuredVideoUrl })
    .from(listings)
    .where(
      or(
        like(listings.featuredImageUrl, `https://${BLOB_HOST_PATTERN}`),
        like(listings.featuredVideoUrl, `https://${BLOB_HOST_PATTERN}`),
      ),
    );
  for (const row of listingRows) {
    if (isVercelBlobUrl(row.featuredImageUrl)) {
      await attempt(row.featuredImageUrl, (newUrl) =>
        db.update(listings).set({ featuredImageUrl: newUrl }).where(eq(listings.id, row.id)),
      );
    }
    if (isVercelBlobUrl(row.featuredVideoUrl)) {
      await attempt(row.featuredVideoUrl, (newUrl) =>
        db.update(listings).set({ featuredVideoUrl: newUrl }).where(eq(listings.id, row.id)),
      );
    }
  }

  return result;
}
