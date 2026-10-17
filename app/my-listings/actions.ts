"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { makeKey, putFile } from "@/lib/storage/r2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingImages, listings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/require-user";
import { LISTING_STATUSES, USER_SUBMITTABLE_STATUSES } from "@/lib/listings/constants";
import { parseContactFields } from "@/lib/listings/contact-fields";
import { getMyListingById } from "@/lib/listings/user-queries";
import { isPlaceholderSlug, slugify } from "@/lib/listings/slug";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// requireUser() here too, not just relied on via the page: a Server Action is
// its own reachable endpoint. This — plus the explicit ownership check below
// — is the sole enforcement now that there's no RLS backstop underneath it.

export type MyListingFormValues = {
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
  expires_at: string;
};

export type MyListingFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof MyListingFormValues, string>>;
  values: MyListingFormValues;
};

function readValues(formData: FormData): MyListingFormValues {
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
    expires_at: get("expires_at"),
  };
}

function pgErrorCode(e: unknown): string | undefined {
  return e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

/** Creates (no `id`) or updates (`id` present) a listing the user owns. The
 *  clicked submit button sets `intent` to "draft" or "pending" — see the form. */
export async function saveMyListing(
  _prev: MyListingFormState,
  formData: FormData,
): Promise<MyListingFormState> {
  const { user } = await requireUser();

  const id = String(formData.get("id") ?? "").trim() || null;
  const values = readValues(formData);
  const fieldErrors: MyListingFormState["fieldErrors"] = {};

  if (!values.title) fieldErrors.title = "Title is required.";
  if (!values.category_id) fieldErrors.category_id = "Choose a category.";

  const slug = slugify((isPlaceholderSlug(values.slug) ? "" : values.slug) || values.title);
  if (!slug) {
    fieldErrors.slug = "Could not generate a slug from this title — enter one manually.";
  }

  const contact = parseContactFields(values);
  Object.assign(fieldErrors, contact.errors);

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  // Only two intents exist as real buttons in the form; anything else (a
  // forged request) falls back to the private option rather than the one
  // that puts it in front of an admin.
  const intent = String(formData.get("intent") ?? "");
  const status = USER_SUBMITTABLE_STATUSES.includes(
    intent as (typeof USER_SUBMITTABLE_STATUSES)[number],
  )
    ? intent
    : "draft";

  if (id) {
    // Fetch-then-check rather than trusting the id alone: this way editing
    // someone else's (or a nonexistent) listing gets a clean message instead
    // of silently succeeding or failing deep in the update.
    const existing = await getMyListingById(id, user.id);
    if (!existing) {
      return { error: "Listing not found.", values };
    }
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

  try {
    if (id) {
      await db.update(listings).set(row).where(eq(listings.id, id));
    } else {
      await db.insert(listings).values({ ...row, createdBy: user.id });
    }
  } catch (e) {
    const code = pgErrorCode(e);
    if (code === "23505") {
      return {
        fieldErrors: { slug: "This slug is already in use." },
        values: { ...values, slug },
      };
    }
    if (code === "23503") {
      return { fieldErrors: { category_id: "Invalid category selected." }, values };
    }
    return { error: e instanceof Error ? e.message : "Could not save listing.", values };
  }

  revalidatePath("/my-listings");
  redirect("/my-listings?saved=1");
}

/**
 * Creates an empty draft and sends the user straight to its edit page, so
 * image upload (which needs a real listing id to attach to) is available
 * immediately instead of only after a first manual save. Only ever reached
 * via a real form submission (see the "New listing" button), never a plain
 * link — a prefetched/GET request must never have this side effect.
 */
export async function createMyListing() {
  const { user } = await requireUser();

  const slug = `untitled-${crypto.randomUUID().slice(0, 8)}`;
  const [created] = await db
    .insert(listings)
    .values({
      title: "Untitled listing",
      slug,
      status: "draft",
      createdBy: user.id,
    })
    .returning({ id: listings.id });

  redirect(`/my-listings/${created.id}/edit`);
}

export async function deleteMyListing(formData: FormData) {
  const { user } = await requireUser();

  const id = String(formData.get("id") ?? "");
  const existing = await getMyListingById(id, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");

  try {
    await db.delete(listings).where(eq(listings.id, id));
  } catch (e) {
    redirect(`/my-listings?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete listing.")}`);
  }

  revalidatePath("/my-listings");
  redirect("/my-listings?deleted=1");
}

function editImagesUrl(listingId: string, error?: string) {
  return error
    ? `/my-listings/${listingId}/edit?error=${encodeURIComponent(error)}`
    : `/my-listings/${listingId}/edit`;
}

/** Revalidates the listing's own public page too, in case it's already
 *  published — a no-op if it isn't found (nothing to revalidate). */
async function revalidateMyListing(listingId: string, userId: string) {
  const existing = await getMyListingById(listingId, userId);
  revalidatePath("/");
  if (existing) revalidatePath(`/listings/${existing.slug}`);
}

export async function addMyListingImage(formData: FormData) {
  const { user } = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const altText = String(formData.get("altText") ?? "").trim();

  const existing = await getMyListingById(listingId, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");
  if (!url) redirect(editImagesUrl(listingId, "Image URL is required."));

  try {
    const existingCount = await db.$count(listingImages, eq(listingImages.listingId, listingId));
    await db.insert(listingImages).values({
      listingId,
      url,
      altText: altText || null,
      position: existingCount,
      isFeatured: existingCount === 0,
    });
  } catch (e) {
    redirect(editImagesUrl(listingId, e instanceof Error ? e.message : "Could not add image."));
  }

  await revalidateMyListing(listingId, user.id);
  redirect(editImagesUrl(listingId));
}

export async function uploadMyListingImages(formData: FormData) {
  const { user } = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const existing = await getMyListingById(listingId, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(editImagesUrl(listingId, "Choose at least one image to upload."));

  const invalidType = files.find((f) => !ALLOWED_IMAGE_TYPES.has(f.type));
  if (invalidType) redirect(editImagesUrl(listingId, `${invalidType.name}: must be PNG, JPEG, WebP, or GIF.`));

  const tooLarge = files.find((f) => f.size > MAX_IMAGE_BYTES);
  if (tooLarge) redirect(editImagesUrl(listingId, `${tooLarge.name}: must be under 5MB.`));

  try {
    let position = await db.$count(listingImages, eq(listingImages.listingId, listingId));
    for (const file of files) {
      const url = await putFile(makeKey(`listings/${listingId}`, file.name), await file.arrayBuffer(), file.type);
      await db.insert(listingImages).values({
        listingId,
        url,
        altText: null,
        position,
        isFeatured: position === 0,
      });
      position += 1;
    }
  } catch (e) {
    redirect(editImagesUrl(listingId, e instanceof Error ? e.message : "Could not upload images."));
  }

  await revalidateMyListing(listingId, user.id);
  redirect(editImagesUrl(listingId));
}

export async function deleteMyListingImage(formData: FormData) {
  const { user } = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");

  const existing = await getMyListingById(listingId, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");

  try {
    await db.delete(listingImages).where(eq(listingImages.id, imageId));
  } catch (e) {
    redirect(editImagesUrl(listingId, e instanceof Error ? e.message : "Could not delete image."));
  }

  await revalidateMyListing(listingId, user.id);
  redirect(editImagesUrl(listingId));
}

export async function setMyListingFeaturedImage(formData: FormData) {
  const { user } = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");

  const existing = await getMyListingById(listingId, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");

  try {
    await db.update(listingImages).set({ isFeatured: false }).where(eq(listingImages.listingId, listingId));
    await db.update(listingImages).set({ isFeatured: true }).where(eq(listingImages.id, imageId));
  } catch (e) {
    redirect(editImagesUrl(listingId, e instanceof Error ? e.message : "Could not set featured image."));
  }

  await revalidateMyListing(listingId, user.id);
  redirect(editImagesUrl(listingId));
}

export async function moveMyListingImage(formData: FormData) {
  const { user } = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const existing = await getMyListingById(listingId, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");

  const images = await db
    .select({ id: listingImages.id, position: listingImages.position })
    .from(listingImages)
    .where(eq(listingImages.listingId, listingId))
    .orderBy(listingImages.position);

  const index = images.findIndex((image) => image.id === imageId);
  const swapWith = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || swapWith < 0 || swapWith >= images.length) {
    redirect(editImagesUrl(listingId));
  }

  const a = images[index];
  const b = images[swapWith];

  try {
    await db.update(listingImages).set({ position: b.position }).where(eq(listingImages.id, a.id));
    await db.update(listingImages).set({ position: a.position }).where(eq(listingImages.id, b.id));
  } catch (e) {
    redirect(editImagesUrl(listingId, e instanceof Error ? e.message : "Could not reorder images."));
  }

  await revalidateMyListing(listingId, user.id);
  redirect(editImagesUrl(listingId));
}

export async function updateMyListingImageAltText(formData: FormData) {
  const { user } = await requireUser();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const altText = String(formData.get("altText") ?? "").trim();

  const existing = await getMyListingById(listingId, user.id);
  if (!existing) redirect("/my-listings?error=Listing%20not%20found.");

  try {
    await db.update(listingImages).set({ altText: altText || null }).where(eq(listingImages.id, imageId));
  } catch (e) {
    redirect(editImagesUrl(listingId, e instanceof Error ? e.message : "Could not update alt text."));
  }

  await revalidateMyListing(listingId, user.id);
  redirect(editImagesUrl(listingId));
}
