import "server-only";
import { and, asc, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings, trashedListings, TRASHED } from "@/lib/db/schema";
import { deleteUnusedFiles, listingFileUrls, rememberDeletedSource } from "./cleanup";

/**
 * The listings Trash. "Delete" moves a listing here instead of removing it:
 * its status becomes "trashed", which hides it from every public page (they
 * all show published listings only) and from the admin and My listings
 * lists. Its previous status is kept in `trashed_listings` so Restore can put
 * it back exactly. After 30 days it's deleted for good, files included.
 */
export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Created on demand (no migration to run): one row per listing in the Trash.
async function ensureTable() {
  await db.run(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS `trashed_listings` (`listing_id` text PRIMARY KEY NOT NULL, `previous_status` text NOT NULL, `trashed_at` integer NOT NULL, `trashed_by` text)",
    ),
  );
}

/** Condition for "not in the Trash", for admin and user lists. */
export const notTrashed = ne(listings.status, TRASHED);

export async function trashListing(id: string, userId: string | null) {
  await ensureTable();
  const [row] = await db.select({ status: listings.status }).from(listings).where(eq(listings.id, id));
  if (!row || row.status === TRASHED) return;
  const now = new Date();
  await db.batch([
    db
      .insert(trashedListings)
      .values({ listingId: id, previousStatus: row.status, trashedAt: now, trashedBy: userId })
      .onConflictDoUpdate({
        target: trashedListings.listingId,
        set: { previousStatus: row.status, trashedAt: now, trashedBy: userId },
      }),
    // Off the homepage slider too; Restore doesn't put it back there.
    db.update(listings).set({ status: TRASHED, homepageFeatured: false }).where(eq(listings.id, id)),
  ]);
}

/** Puts a listing back with the status it had. Returns its slug. */
export async function restoreListing(id: string): Promise<string | null> {
  await ensureTable();
  const [found] = await db
    .select({ previousStatus: trashedListings.previousStatus })
    .from(trashedListings)
    .where(eq(trashedListings.listingId, id));
  const previous = found?.previousStatus;
  const status = (["draft", "pending", "published", "rejected"] as const).find((s) => s === previous) ?? "draft";
  const [row] = await db
    .update(listings)
    .set({ status })
    .where(and(eq(listings.id, id), eq(listings.status, TRASHED)))
    .returning({ slug: listings.slug });
  await db.delete(trashedListings).where(eq(trashedListings.listingId, id));
  return row?.slug ?? null;
}

/** Deletes a trashed listing for good: the listing, its photos' records and
 *  files, and (for an fd.sg listing) a note so the sync doesn't re-import it. */
export async function deleteForever(id: string) {
  await ensureTable();
  const [row] = await db
    .select({ externalUrl: listings.externalUrl, title: listings.title })
    .from(listings)
    .where(and(eq(listings.id, id), eq(listings.status, TRASHED)));
  if (!row) return;
  const files = await listingFileUrls(id);
  await db.delete(listings).where(eq(listings.id, id));
  await db.delete(trashedListings).where(eq(trashedListings.listingId, id));
  await deleteUnusedFiles(files);
  if (row.externalUrl) await rememberDeletedSource(row.externalUrl, row.title);
}

export type TrashedListing = {
  id: string;
  title: string;
  slug: string;
  synced: boolean;
  previousStatus: string;
  trashedAt: Date;
  /** When it will be deleted for good, and how many days that is away. */
  purgeAt: Date;
  daysLeft: number;
};

export async function listTrash(): Promise<TrashedListing[]> {
  await ensureTable();
  const rows = await db
    .select({ id: listings.id, title: listings.title, slug: listings.slug, externalUrl: listings.externalUrl })
    .from(listings)
    .where(eq(listings.status, TRASHED))
    .orderBy(asc(listings.title));
  if (rows.length === 0) return [];
  const meta = await db.select().from(trashedListings);
  const byId = new Map(meta.map((m) => [m.listingId, m]));
  return rows
    .map((r) => {
      const m = byId.get(r.id);
      const trashedAt = m?.trashedAt ?? new Date();
      return {
        id: r.id,
        title: r.title,
        slug: r.slug,
        synced: !!r.externalUrl,
        previousStatus: m?.previousStatus ?? "draft",
        trashedAt,
        purgeAt: new Date(trashedAt.getTime() + TRASH_DAYS * DAY_MS),
        daysLeft: Math.max(0, Math.ceil((trashedAt.getTime() + TRASH_DAYS * DAY_MS - Date.now()) / DAY_MS)),
      };
    })
    .sort((a, b) => b.trashedAt.getTime() - a.trashedAt.getTime());
}

export async function countTrash(): Promise<number> {
  return db.$count(listings, eq(listings.status, TRASHED));
}

/** Deletes for good everything that has been in the Trash for 30 days.
 *  Run by the 6-hourly cron and whenever the Trash page is opened. */
export async function purgeExpiredTrash(): Promise<number> {
  await ensureTable();
  const cutoff = new Date(Date.now() - TRASH_DAYS * DAY_MS);
  const expired = await db
    .select({ listingId: trashedListings.listingId })
    .from(trashedListings)
    .where(lt(trashedListings.trashedAt, cutoff));
  for (const { listingId } of expired) await deleteForever(listingId);
  return expired.length;
}
