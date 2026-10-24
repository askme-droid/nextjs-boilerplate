"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/require-staff";
import { db } from "@/lib/db/client";
import { heroSlides } from "@/lib/db/schema";
import { normalizeHttpUrl } from "@/lib/listings/contact-fields";
import { deleteFileByUrl, isStoredFileUrl, makeKey, putFile } from "@/lib/storage/r2";

// Every action re-checks requireStaff(): a Server Action is reachable directly.

const PATH = "/admin/hero";
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function done(message: string, error = false): never {
  revalidatePath("/");
  revalidatePath(PATH);
  redirect(`${PATH}?${error ? "error" : "msg"}=${encodeURIComponent(message)}`);
}

/** A link: a path on this site ("/listings/…") or an http(s) address. */
function readLink(formData: FormData): string | null | undefined {
  const raw = String(formData.get("linkUrl") ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return normalizeHttpUrl(raw) ?? undefined;
}

/** Adds a slide from an uploaded file or an image address, at the end. */
export async function addHeroSlide(formData: FormData) {
  await requireStaff();
  const file = formData.get("file");
  const imageAddress = String(formData.get("imageUrl") ?? "").trim();
  const altText = String(formData.get("altText") ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const linkUrl = readLink(formData);
  if (linkUrl === undefined) done("The link isn't a valid web address.", true);

  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES.has(file.type)) done("The image must be JPG, PNG, WebP or GIF.", true);
    if (file.size > MAX_BYTES) done("The image must be under 10MB.", true);
    try {
      imageUrl = await putFile(makeKey("hero", file.name), await file.arrayBuffer(), file.type);
    } catch (e) {
      done(e instanceof Error ? e.message : "Could not upload the image.", true);
    }
  } else if (imageAddress) {
    imageUrl = normalizeHttpUrl(imageAddress);
    if (!imageUrl) done("The image address isn't valid.", true);
  } else {
    done("Choose an image file, or paste an image address.", true);
  }

  await db.insert(heroSlides).values({
    imageUrl: imageUrl!,
    altText,
    linkUrl,
    position: sql`(select coalesce(max(position), 0) + 1 from hero_slides)`,
  });
  done("Slide added at the end.");
}

export async function updateHeroSlide(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const altText = String(formData.get("altText") ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const linkUrl = readLink(formData);
  if (linkUrl === undefined) done("The link isn't a valid web address.", true);
  await db.update(heroSlides).set({ altText, linkUrl }).where(eq(heroSlides.id, id));
  done("Slide saved.");
}

export async function toggleHeroSlide(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  await db
    .update(heroSlides)
    .set({ active: sql`not ${heroSlides.active}` })
    .where(eq(heroSlides.id, id));
  done("Slide updated.");
}

export async function deleteHeroSlide(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const [row] = await db.delete(heroSlides).where(eq(heroSlides.id, id)).returning({ imageUrl: heroSlides.imageUrl });
  // Uploaded files are removed from storage too; built-in /public images and
  // outside addresses are left alone.
  if (row && isStoredFileUrl(row.imageUrl)) await deleteFileByUrl(row.imageUrl);
  done("Slide deleted.");
}

/** Moves a slide one place up or down, then renumbers 1, 2, 3… */
export async function moveHeroSlide(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const rows = await db
    .select({ id: heroSlides.id })
    .from(heroSlides)
    .orderBy(asc(heroSlides.position), asc(heroSlides.createdAt));
  const ids = rows.map((r) => r.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) done("Nothing to move.");
  [ids[from], ids[to]] = [ids[to], ids[from]];
  for (let i = 0; i < ids.length; i++) {
    await db.update(heroSlides).set({ position: i + 1 }).where(eq(heroSlides.id, ids[i]));
  }
  done("Order updated.");
}
