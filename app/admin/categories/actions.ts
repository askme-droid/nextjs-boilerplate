"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-staff";
import { slugify } from "@/lib/listings/slug";
import { createClient } from "@/lib/supabase/server";

// Same reasoning as app/admin/listings/actions.ts: each action re-checks
// requireAdmin() itself, since a Server Action is its own reachable endpoint,
// not just something the page's UI calls. Categories are admin-only (unlike
// listings, which also allow editor) — this matches the "staff manage
// categories" RLS policy, which only accepts is_admin().

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

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("categories").update(row).eq("id", id)
    : await supabase.from("categories").insert(row);

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: { ...fieldErrors, slug: "This slug is already in use." },
        values: { ...values, slug },
      };
    }
    return { error: error.message, values };
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
  const supabase = await createClient();

  // No RESTRICT to worry about: listings_category_id_fkey is ON DELETE SET
  // NULL (confirmed by probing the live schema), so this can't fail because
  // listings still reference the category — it just un-categorizes them.
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    redirect(`/admin/categories?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/admin/categories?deleted=1");
}
