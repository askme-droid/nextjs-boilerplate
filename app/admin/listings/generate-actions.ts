"use server";

import { requireStaff } from "@/lib/auth/require-staff";
import { generateListingDraft } from "@/lib/ai/generate-listing";
import { getCategories } from "@/lib/listings/queries";
import type { ListingFormValues } from "./actions";

export type GenerateState = {
  error?: string;
  values?: ListingFormValues;
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Same defense-in-depth reasoning as app/admin/listings/actions.ts: this is
// its own reachable endpoint, not just something the page's UI calls.
export async function generateListing(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  await requireStaff();

  const description = String(formData.get("description") ?? "").trim();
  const image = formData.get("image");
  const hasImage = image instanceof File && image.size > 0;

  if (!description && !hasImage) {
    return { error: "Enter a description or upload a flyer image." };
  }

  let imagePart: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" } | undefined;
  if (hasImage) {
    const file = image as File;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { error: "Image must be PNG, JPEG, or WebP." };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: "Image must be under 5MB." };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    imagePart = {
      base64: buffer.toString("base64"),
      mediaType: file.type as "image/png" | "image/jpeg" | "image/webp",
    };
  }

  const categories = await getCategories();
  if (categories.length === 0) {
    return { error: "Create a category first — there's nothing to assign this listing to." };
  }

  try {
    const values = await generateListingDraft({ description, image: imagePart, categories });
    return { values };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not generate a draft." };
  }
}
