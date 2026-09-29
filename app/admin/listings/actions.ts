"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingExperienceTags, listingImages, listings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/require-staff";
import { parseContactFields } from "@/lib/listings/contact-fields";
import { LISTING_STATUSES } from "@/lib/listings/constants";
import { isPlaceholderSlug, slugify } from "@/lib/listings/slug";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// Every action here re-checks requireStaff() itself rather than trusting the
// /admin layout's gate: a Server Action is its own callable endpoint, reachable
// directly (not just through the page that renders its form), so the page-level
// check alone wouldn't stop a forged request. This is the sole enforcement now
// that there's no RLS backstop underneath it.

export type ListingFormValues = {
  title: string;
  slug: string;
  category_id: string;
  location: string;
  company_name: string;
  company_uen: string;
  social_links: string;
  cta_label: string;
  cta_url: string;
  keywords: string;
  description: string;
  status: string;
  expires_at: string;
};

export type ListingFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof ListingFormValues, string>>;
  values: ListingFormValues;
};

function readValues(formData: FormData): ListingFormValues {
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  return {
    title: get("title"),
    slug: get("slug"),
    category_id: get("category_id"),
    location: get("location"),
    company_name: get("company_name"),
    company_uen: get("company_uen"),
    social_links: get("social_links"),
    cta_label: get("cta_label"),
    cta_url: get("cta_url"),
    keywords: get("keywords"),
    description: get("description"),
    status: get("status"),
    expires_at: get("expires_at"),
  };
}

// postgres.js throws a PostgresError whose `code` is the Postgres SQLSTATE —
// 23505 (unique_violation) / 23503 (foreign_key_violation) — surfaced as-is,
// not wrapped, so this narrow check is enough to distinguish them.
function pgErrorCode(e: unknown): string | undefined {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

/** Creates a listing (no `id` field in formData) or updates one (with `id`). */
export async function saveListing(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  await requireStaff();

  const id = String(formData.get("id") ?? "").trim() || null;
  const values = readValues(formData);
  const fieldErrors: ListingFormState["fieldErrors"] = {};

  if (!values.title) fieldErrors.title = "Title is required.";
  if (!values.category_id) fieldErrors.category_id = "Choose a category.";

  const status = values.status || "draft";
  if (!LISTING_STATUSES.includes(status as (typeof LISTING_STATUSES)[number])) {
    fieldErrors.status = "Choose a valid status.";
  }

  const slug = slugify((isPlaceholderSlug(values.slug) ? "" : values.slug) || values.title);
  if (!slug) {
    fieldErrors.slug =
      "Could not generate a slug from this title — enter one manually.";
  }

  const contact = parseContactFields(values);
  Object.assign(fieldErrors, contact.errors);

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const keywords = values.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const row = {
    title: values.title,
    slug,
    categoryId: values.category_id,
    location: values.location || null,
    companyName: contact.parsed.companyName,
    companyUen: contact.parsed.companyUen,
    socialLinks: contact.parsed.socialLinks,
    ctaLabel: contact.parsed.ctaLabel,
    ctaUrl: contact.parsed.ctaUrl,
    keywords,
    description: values.description || null,
    status: status as (typeof LISTING_STATUSES)[number],
    expiresAt: values.expires_at || null,
  };

  let listingId: string;
  try {
    const [saved] = id
      ? await db.update(listings).set(row).where(eq(listings.id, id)).returning({ id: listings.id })
      : await db.insert(listings).values(row).returning({ id: listings.id });
    listingId = saved.id;
  } catch (e) {
    const code = pgErrorCode(e);
    if (code === "23505") {
      return {
        fieldErrors: { ...fieldErrors, slug: "This slug is already in use." },
        values: { ...values, slug },
      };
    }
    if (code === "23503") {
      return {
        fieldErrors: { ...fieldErrors, category_id: "Invalid category selected." },
        values,
      };
    }
    return { error: e instanceof Error ? e.message : "Could not save listing.", values };
  }

  // Tag checkboxes only exist (and only send this marker) once the listing
  // exists to attach them to — i.e. on the edit form, never on create. Without
  // this marker there'd be no way to tell "no tags checked" (edit) apart from
  // "no tags field at all" (create) from formData.getAll() alone.
  if (formData.has("tagsIncluded")) {
    const tagError = await applyTagChanges(listingId, formData.getAll("tagIds").map(String));
    if (tagError) {
      return {
        error: `Listing saved, but tags failed to save: ${tagError}`,
        values: { ...values, slug },
      };
    }
  }

  revalidatePath("/");
  revalidatePath(`/listings/${slug}`);
  redirect(`/admin/listings/${listingId}/edit?saved=1`);
}

/**
 * Creates an empty draft and sends staff straight to its edit page, so image
 * upload (which needs a real listing id) and the AI-generation helper are
 * both available immediately instead of only after a first manual save.
 * Only ever reached via a real form submission (the "New listing" button),
 * never a plain link — a prefetched/GET request must never have this side
 * effect.
 */
export async function createListing() {
  await requireStaff();

  const slug = `untitled-${crypto.randomUUID().slice(0, 8)}`;
  const [created] = await db
    .insert(listings)
    .values({ title: "Untitled listing", slug, status: "draft" })
    .returning({ id: listings.id });

  redirect(`/admin/listings/${created.id}/edit`);
}

/** Diffs and applies a listing's tag selection in one call — shared by the
 *  single save action above (previously its own separate saveTags action). */
async function applyTagChanges(
  listingId: string,
  selectedTagIds: string[],
): Promise<string | null> {
  const selected = new Set(selectedTagIds);

  try {
    const current = await db
      .select({ tagId: listingExperienceTags.tagId })
      .from(listingExperienceTags)
      .where(eq(listingExperienceTags.listingId, listingId));

    const currentIds = new Set(current.map((row) => row.tagId));
    const toAdd = [...selected].filter((tagId) => !currentIds.has(tagId));
    const toRemove = [...currentIds].filter((tagId) => !selected.has(tagId));

    if (toRemove.length > 0) {
      await db
        .delete(listingExperienceTags)
        .where(
          and(
            eq(listingExperienceTags.listingId, listingId),
            inArray(listingExperienceTags.tagId, toRemove),
          ),
        );
    }

    if (toAdd.length > 0) {
      await db
        .insert(listingExperienceTags)
        .values(toAdd.map((tagId) => ({ listingId, tagId })));
    }

    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Could not save tags.";
  }
}

/** Looks up a listing's slug, for revalidating its public page after an edit. */
async function getListingSlug(listingId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: listings.slug })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  return row?.slug ?? null;
}

/** One-click status change, separate from the main save flow — for
 *  approving a pending/draft listing without opening the status dropdown
 *  and re-submitting the whole form. Only touches `status`, nothing else
 *  the form has unsaved. */
export async function publishListing(formData: FormData) {
  await requireStaff();

  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/listings");

  try {
    await db.update(listings).set({ status: "published" }).where(eq(listings.id, id));
  } catch (e) {
    redirect(editUrl(id, e instanceof Error ? e.message : "Could not publish listing."));
  }

  const slug = await getListingSlug(id);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(`/admin/listings/${id}/edit?saved=1`);
}

export async function deleteListing(formData: FormData) {
  await requireStaff();

  const id = String(formData.get("id") ?? "");

  // Looked up before deleting (not after — there'd be nothing left to find)
  // so a published listing's public page gets revalidated too.
  const slug = await getListingSlug(id);

  try {
    // No RESTRICT to worry about: listing_images.listing_id and
    // listing_experience_tags.listing_id are both ON DELETE CASCADE (see
    // lib/db/schema/listings.ts), so this also removes the listing's own
    // images and tag links — it doesn't touch any other listing.
    await db.delete(listings).where(eq(listings.id, id));
  } catch (e) {
    redirect(editUrl(id, e instanceof Error ? e.message : "Could not delete listing."));
  }

  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect("/admin/listings?deleted=1");
}

function editUrl(listingId: string, error?: string) {
  return error
    ? `/admin/listings/${listingId}/edit?error=${encodeURIComponent(error)}`
    : `/admin/listings/${listingId}/edit`;
}

export async function addImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const altText = String(formData.get("altText") ?? "").trim();

  if (!listingId) redirect(editUrl(listingId, "Missing listing."));
  if (!url) redirect(editUrl(listingId, "Image URL is required."));

  try {
    const existingCount = await db.$count(listingImages, eq(listingImages.listingId, listingId));

    await db.insert(listingImages).values({
      listingId,
      url,
      altText: altText || null,
      position: existingCount,
      // Auto-feature the first image a listing gets, so it isn't imageless on
      // the grid/detail hero until someone remembers to flag one.
      isFeatured: existingCount === 0,
    });
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not add image."));
  }

  const slug = await getListingSlug(listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

/** Uploads one or more image files to Vercel Blob storage and attaches them
 *  to the listing, in the order they were selected. */
export async function uploadImages(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  if (!listingId) redirect(editUrl(listingId, "Missing listing."));

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(editUrl(listingId, "Choose at least one image to upload."));

  const invalidType = files.find((f) => !ALLOWED_IMAGE_TYPES.has(f.type));
  if (invalidType) redirect(editUrl(listingId, `${invalidType.name}: must be PNG, JPEG, WebP, or GIF.`));

  const tooLarge = files.find((f) => f.size > MAX_IMAGE_BYTES);
  if (tooLarge) redirect(editUrl(listingId, `${tooLarge.name}: must be under 5MB.`));

  try {
    let position = await db.$count(listingImages, eq(listingImages.listingId, listingId));
    for (const file of files) {
      const blob = await put(`listings/${listingId}/${file.name}`, file, {
        access: "public",
        addRandomSuffix: true,
      });
      await db.insert(listingImages).values({
        listingId,
        url: blob.url,
        altText: null,
        position,
        // Auto-feature the first image a listing gets, so it isn't imageless
        // on the grid/detail hero until someone remembers to flag one.
        isFeatured: position === 0,
      });
      position += 1;
    }
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not upload images."));
  }

  const slug = await getListingSlug(listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function deleteImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");

  try {
    await db.delete(listingImages).where(eq(listingImages.id, imageId));
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not delete image."));
  }

  const slug = await getListingSlug(listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function setFeaturedImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");

  try {
    await db.update(listingImages).set({ isFeatured: false }).where(eq(listingImages.listingId, listingId));
    await db.update(listingImages).set({ isFeatured: true }).where(eq(listingImages.id, imageId));
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not set featured image."));
  }

  const slug = await getListingSlug(listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function updateImageAltText(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const altText = String(formData.get("altText") ?? "").trim();

  try {
    await db.update(listingImages).set({ altText: altText || null }).where(eq(listingImages.id, imageId));
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not update alt text."));
  }

  const slug = await getListingSlug(listingId);
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function moveImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const images = await db
    .select({ id: listingImages.id, position: listingImages.position })
    .from(listingImages)
    .where(eq(listingImages.listingId, listingId))
    .orderBy(listingImages.position);

  const index = images.findIndex((image) => image.id === imageId);
  const swapWith = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || swapWith < 0 || swapWith >= images.length) {
    redirect(editUrl(listingId));
  }

  const a = images[index];
  const b = images[swapWith];

  try {
    await db.update(listingImages).set({ position: b.position }).where(eq(listingImages.id, a.id));
    await db.update(listingImages).set({ position: a.position }).where(eq(listingImages.id, b.id));
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not reorder images."));
  }

  const slug = await getListingSlug(listingId);
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}
