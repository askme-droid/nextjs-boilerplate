"use server";

import { pgErrorCode } from "@/lib/db/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-staff";
import { slugify } from "@/lib/listings/slug";

// Same reasoning as app/admin/listings/actions.ts: each action re-checks
// requireAdmin() itself, since a Server Action is its own reachable endpoint,
// not just something the page's UI calls. Categories are admin-only (unlike
// listings, which also allow editor) — this is the sole enforcement now that
// there's no RLS backstop underneath it.

export type CategoryFormValues = {
  name: string;
  slug: string;
  description: string;
};

export type CategoryFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof CategoryFormValues, string>>;
  values: CategoryFormValues;
};

function readValues(formData: FormData): CategoryFormValues {
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  return { name: get("name"), slug: get("slug"), description: get("description") };
}


/** Creates a category (no `id` field in formData) or updates one (with `id`). */
export async function saveCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim() || null;
  const values = readValues(formData);
  const fieldErrors: CategoryFormState["fieldErrors"] = {};

  if (!values.name) fieldErrors.name = "Name is required.";

  const slug = slugify(values.slug || values.name);
  if (!slug) {
    fieldErrors.slug = "Could not generate a slug from this name — enter one manually.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const row = { name: values.name, slug, description: values.description || null };

  try {
    if (id) {
      await db.update(categories).set(row).where(eq(categories.id, id));
    } else {
      await db.insert(categories).values(row);
    }
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return {
        fieldErrors: { ...fieldErrors, slug: "This slug is already in use." },
        values: { ...values, slug },
      };
    }
    return { error: e instanceof Error ? e.message : "Could not save category.", values };
  }

  // Category names/badges appear across the public grid (and every listing
  // detail page, via its category link) — "/" covers the shared dropdown and
  // card badges; individual detail pages pick up the change on their own next
  // request regardless, since they're dynamically rendered per visit.
  revalidatePath("/");
  redirect("/admin/categories?saved=1");
}

export async function deleteCategory(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");

  try {
    // No RESTRICT to worry about: listings.category_id is ON DELETE SET NULL
    // (see lib/db/schema/listings.ts), so this can't fail because listings
    // still reference the category — it just un-categorizes them.
    await db.delete(categories).where(eq(categories.id, id));
  } catch (e) {
    redirect(`/admin/categories?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete category.")}`);
  }

  revalidatePath("/");
  redirect("/admin/categories?deleted=1");
}
