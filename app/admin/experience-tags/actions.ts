"use server";

import { pgErrorCode } from "@/lib/db/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { experienceTags } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/require-staff";
import { slugify } from "@/lib/listings/slug";

// Same reasoning as app/admin/categories/actions.ts: each action re-checks
// requireAdmin() itself, since a Server Action is its own reachable endpoint,
// not just something the page's UI calls. Experience tags are admin-only
// (same as categories), unlike listings, which also allow editor.

export type ExperienceTagFormValues = {
  name: string;
  slug: string;
};

export type ExperienceTagFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof ExperienceTagFormValues, string>>;
  values: ExperienceTagFormValues;
};

function readValues(formData: FormData): ExperienceTagFormValues {
  const get = (name: string) => String(formData.get(name) ?? "").trim();
  return { name: get("name"), slug: get("slug") };
}


/** Creates an experience tag (no `id` field in formData) or updates one (with `id`). */
export async function saveExperienceTag(
  _prev: ExperienceTagFormState,
  formData: FormData,
): Promise<ExperienceTagFormState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "").trim() || null;
  const values = readValues(formData);
  const fieldErrors: ExperienceTagFormState["fieldErrors"] = {};

  if (!values.name) fieldErrors.name = "Name is required.";

  const slug = slugify(values.slug || values.name);
  if (!slug) {
    fieldErrors.slug = "Could not generate a slug from this name — enter one manually.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values };
  }

  const row = { name: values.name, slug };

  try {
    if (id) {
      await db.update(experienceTags).set(row).where(eq(experienceTags.id, id));
    } else {
      await db.insert(experienceTags).values(row);
    }
  } catch (e) {
    if (pgErrorCode(e) === "23505") {
      return {
        fieldErrors: { ...fieldErrors, slug: "This slug is already in use." },
        values: { ...values, slug },
      };
    }
    return { error: e instanceof Error ? e.message : "Could not save experience tag.", values };
  }

  // Experience tags appear on every listing detail page that carries one.
  revalidatePath("/");
  redirect("/admin/experience-tags?saved=1");
}

export async function deleteExperienceTag(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");

  try {
    // No RESTRICT to worry about: listing_experience_tags.tag_id is ON
    // DELETE CASCADE (see lib/db/schema/listings.ts), so this can't fail
    // because listings still carry the tag — it just untags them.
    await db.delete(experienceTags).where(eq(experienceTags.id, id));
  } catch (e) {
    redirect(`/admin/experience-tags?error=${encodeURIComponent(e instanceof Error ? e.message : "Could not delete experience tag.")}`);
  }

  revalidatePath("/");
  redirect("/admin/experience-tags?deleted=1");
}
