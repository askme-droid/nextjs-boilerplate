"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/require-staff";
import { LISTING_STATUSES } from "@/lib/listings/constants";
import { slugify } from "@/lib/listings/slug";
import { createClient } from "@/lib/supabase/server";

// Every action here re-checks requireStaff() itself rather than trusting the
// /admin layout's gate: a Server Action is its own callable endpoint, reachable
// directly (not just through the page that renders its form), so the page-level
// check alone wouldn't stop a forged request. Postgres RLS ("staff manage
// listings"/"…tags"/"…images") is the layer under that; this is the app-level
// one, checked first so a rejection is a redirect/404, not a bare RLS error.

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
    category_id: values.category_id,
    location: values.location || null,
    keywords,
    description: values.description || null,
    status,
    expires_at: values.expires_at || null,
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("listings").update(row).eq("id", id).select("id").single()
    : await supabase.from("listings").insert(row).select("id").single();

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { ...fieldErrors, slug: "This slug is already in use." },
        values: { ...values, slug },
      };
    }
    if (error.code === "23503") {
      return {
        fieldErrors: { ...fieldErrors, category_id: "Invalid category selected." },
        values,
      };
    }
    return { error: error.message, values };
  }

  // Tag checkboxes only exist (and only send this marker) once the listing
  // exists to attach them to — i.e. on the edit form, never on create. Without
  // this marker there'd be no way to tell "no tags checked" (edit) apart from
  // "no tags field at all" (create) from formData.getAll() alone.
  if (formData.has("tagsIncluded")) {
    const tagError = await applyTagChanges(
      supabase,
      data.id,
      formData.getAll("tagIds").map(String),
    );
    if (tagError) {
      return {
        error: `Listing saved, but tags failed to save: ${tagError}`,
        values: { ...values, slug },
      };
    }
  }

  revalidatePath("/");
  revalidatePath(`/listings/${slug}`);
  redirect(`/admin/listings/${data.id}/edit?saved=1`);
}

/** Diffs and applies a listing's tag selection in one call — shared by the
 *  single save action below (previously its own separate saveTags action). */
async function applyTagChanges(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  selectedTagIds: string[],
): Promise<string | null> {
  const selected = new Set(selectedTagIds);
  const { data: current, error: currentError } = await supabase
    .from("listing_experience_tags")
    .select("tag_id")
    .eq("listing_id", listingId);
  if (currentError) return currentError.message;

  const currentIds = new Set(current.map((row) => row.tag_id));
  const toAdd = [...selected].filter((tagId) => !currentIds.has(tagId));
  const toRemove = [...currentIds].filter((tagId) => !selected.has(tagId));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("listing_experience_tags")
      .delete()
      .eq("listing_id", listingId)
      .in("tag_id", toRemove);
    if (error) return error.message;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("listing_experience_tags")
      .insert(toAdd.map((tag_id) => ({ listing_id: listingId, tag_id })));
    if (error) return error.message;
  }

  return null;
}

/** Looks up a listing's slug, for revalidating its public page after an edit. */
async function getListingSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("listings")
    .select("slug")
    .eq("id", listingId)
    .maybeSingle();
  return data?.slug ?? null;
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

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("listing_images")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", listingId);

  if (countError) redirect(editUrl(listingId, countError.message));

  const { error } = await supabase.from("listing_images").insert({
    listing_id: listingId,
    url,
    alt_text: altText || null,
    position: count ?? 0,
    // Auto-feature the first image a listing gets, so it isn't imageless on
    // the grid/detail hero until someone remembers to flag one.
    is_featured: (count ?? 0) === 0,
  });

  if (error) redirect(editUrl(listingId, error.message));

  const slug = await getListingSlug(supabase, listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function deleteImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("listing_images").delete().eq("id", imageId);
  if (error) redirect(editUrl(listingId, error.message));

  const slug = await getListingSlug(supabase, listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function setFeaturedImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");

  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from("listing_images")
    .update({ is_featured: false })
    .eq("listing_id", listingId);
  if (clearError) redirect(editUrl(listingId, clearError.message));

  const { error } = await supabase
    .from("listing_images")
    .update({ is_featured: true })
    .eq("id", imageId);
  if (error) redirect(editUrl(listingId, error.message));

  const slug = await getListingSlug(supabase, listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

export async function moveImage(formData: FormData) {
  await requireStaff();

  const listingId = String(formData.get("listingId") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const supabase = await createClient();
  const { data: images, error: listError } = await supabase
    .from("listing_images")
    .select("id, position")
    .eq("listing_id", listingId)
    .order("position");

  if (listError) redirect(editUrl(listingId, listError.message));

  const index = images.findIndex((image) => image.id === imageId);
  const swapWith = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || swapWith < 0 || swapWith >= images.length) {
    redirect(editUrl(listingId));
  }

  const a = images[index];
  const b = images[swapWith];

  const [{ error: errorA }, { error: errorB }] = await Promise.all([
    supabase.from("listing_images").update({ position: b.position }).eq("id", a.id),
    supabase.from("listing_images").update({ position: a.position }).eq("id", b.id),
  ]);
  if (errorA || errorB) redirect(editUrl(listingId, (errorA ?? errorB)?.message));

  const slug = await getListingSlug(supabase, listingId);
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

