"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/require-staff";
import { deleteFileByUrl, isStoredFileUrl } from "@/lib/storage/r2";

// Same rule as every other action in this app: re-check requireStaff() here,
// since a Server Action is reachable directly, not only through its page.

const FEATURED_PATH = "/admin/listings/featured";

function done(message: string): never {
  redirect(`${FEATURED_PATH}?msg=${encodeURIComponent(message)}`);
}

function refresh() {
  revalidatePath("/");
  revalidatePath(FEATURED_PATH);
}

/** Delete an uploaded clip from R2 storage. Best-effort: a failure (or an old
 *  Vercel Blob URL, which can't be deleted from here any more) leaves an
 *  orphaned file, which is not worth failing the staff member's action over. */
async function deleteVideoFile(url: string | null | undefined) {
  await deleteFileByUrl(url);
}

function readVideoUrl(formData: FormData): string {
  const videoUrl = String(formData.get("videoUrl") ?? "");
  if (!isStoredFileUrl(videoUrl)) done("That video upload wasn't recognised — try again.");
  return videoUrl;
}

/** Pick a listing for the homepage slider; it goes to the end of the picked
 *  list. Its video is uploaded afterwards (see setFeaturedVideo) — until then
 *  the homepage simply skips it. */
export async function addFeatured(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) done("No listing selected.");

  await db
    .update(listings)
    .set({
      homepageFeatured: true,
      homepageFeaturedOrder: sql`(select coalesce(max(homepage_featured_order), 0) + 1 from listings where homepage_featured)`,
    })
    .where(eq(listings.id, id));

  refresh();
  done("Picked. Now upload its video so it shows in the slider.");
}

function readImageUrl(formData: FormData): string {
  const imageUrl = String(formData.get("imageUrl") ?? "");
  if (!isStoredFileUrl(imageUrl)) done("That image upload wasn't recognised — try again.");
  return imageUrl;
}

/** Save an image or animated GIF as a picked listing's slide. Replaces any
 *  video (a slide shows one or the other) and deletes the old files. */
export async function setFeaturedImage(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) done("No listing selected.");
  const imageUrl = readImageUrl(formData);

  const [previous] = await db
    .select({ videoUrl: listings.featuredVideoUrl, imageUrl: listings.featuredSlideImageUrl })
    .from(listings)
    .where(eq(listings.id, id));

  await db
    .update(listings)
    .set({ featuredSlideImageUrl: imageUrl, featuredVideoUrl: null })
    .where(and(eq(listings.id, id), eq(listings.homepageFeatured, true)));

  await deleteVideoFile(previous?.videoUrl);
  if (previous?.imageUrl !== imageUrl) await deleteFileByUrl(previous?.imageUrl);
  refresh();
  done("Image saved.");
}

/** Save the clip for a picked listing (first upload or a replacement). The
 *  video goes browser -> R2 first (see featured/media-upload.tsx); its URL arrives
 *  here. */
export async function setFeaturedVideo(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) done("No listing selected.");
  const videoUrl = readVideoUrl(formData);

  const [previous] = await db
    .select({ videoUrl: listings.featuredVideoUrl, imageUrl: listings.featuredSlideImageUrl })
    .from(listings)
    .where(eq(listings.id, id));

  // A slide shows a video or an image, not both: the new video replaces any image.
  await db
    .update(listings)
    .set({ featuredVideoUrl: videoUrl, featuredSlideImageUrl: null })
    .where(and(eq(listings.id, id), eq(listings.homepageFeatured, true)));

  if (previous?.videoUrl !== videoUrl) await deleteVideoFile(previous?.videoUrl);
  await deleteFileByUrl(previous?.imageUrl);
  refresh();
  done("Video saved.");
}

export async function removeFeatured(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  if (!id) done("No listing selected.");

  const [previous] = await db
    .select({ videoUrl: listings.featuredVideoUrl, imageUrl: listings.featuredSlideImageUrl })
    .from(listings)
    .where(eq(listings.id, id));

  await db
    .update(listings)
    .set({ homepageFeatured: false, homepageFeaturedOrder: 0, featuredVideoUrl: null, featuredSlideImageUrl: null })
    .where(eq(listings.id, id));

  await deleteVideoFile(previous?.videoUrl);
  await deleteFileByUrl(previous?.imageUrl);
  refresh();
  done("Removed from the homepage slider.");
}

/** Swap a picked listing with its neighbour. Renumbers the whole picked list
 *  0..n-1 in one batch so the order stays gap-free and unambiguous. */
export async function moveFeatured(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;

  const picked = await db
    .select({ id: listings.id })
    .from(listings)
    .where(eq(listings.homepageFeatured, true))
    .orderBy(asc(listings.homepageFeaturedOrder), desc(listings.createdAt));

  const from = picked.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from !== -1 && to >= 0 && to < picked.length) {
    [picked[from], picked[to]] = [picked[to], picked[from]];
    // One batch = all-or-nothing on D1 (it has no BEGIN/COMMIT transactions).
    const [first, ...rest] = picked.map((row, position) =>
      db.update(listings).set({ homepageFeaturedOrder: position }).where(eq(listings.id, row.id)),
    );
    await db.batch([first, ...rest]);
  }

  refresh();
  redirect(FEATURED_PATH);
}
