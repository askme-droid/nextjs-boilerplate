"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingExperienceTags, listingImages, listings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/require-staff";
import { LISTING_STATUSES } from "@/lib/listings/constants";
import { slugify } from "@/lib/listings/slug";

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

  const slug = slugify(values.slug || values.title);
  if (!slug) {
    fieldErrors.slug =
      "Could not generate a slug from this title — enter one manually.";
  }

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
