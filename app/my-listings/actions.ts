"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/require-user";
import { LISTING_STATUSES, USER_SUBMITTABLE_STATUSES } from "@/lib/listings/constants";
import { getMyListingById } from "@/lib/listings/user-queries";
import { slugify } from "@/lib/listings/slug";

// requireUser() here too, not just relied on via the page: a Server Action is
// its own reachable endpoint. This — plus the explicit ownership check below
// — is the sole enforcement now that there's no RLS backstop underneath it.

export type MyListingFormValues = {
  title: string;
  slug: string;
  category_id: string;
  location: string;
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

  const slug = slugify(values.slug || values.title);
  if (!slug) {
    fieldErrors.slug = "Could not generate a slug from this title — enter one manually.";
  }

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
