"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { verifyListingBusinessIfChanged } from "@/lib/business/verify-listing";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { listingExperienceTags, listingImages, listings } from "@/lib/db/schema";
import { requireStaff } from "@/lib/auth/require-staff";
import { isStoredFileUrl, makeKey, putFile } from "@/lib/storage/r2";
import { normalizeHttpUrl, parseContactFields } from "@/lib/listings/contact-fields";
import { todayInSingapore } from "@/lib/listings/expiry-dates";
import {
  OFFER_DISCOUNT_MAX,
  QUICK_ANSWER_MAX,
  REDEMPTION_MAX,
  normalizePrice,
  parseFaqs,
} from "@/lib/seo/aeo";
import { LISTING_STATUSES } from "@/lib/listings/constants";
import { embedImage, embedImageUrl } from "@/lib/listings/embeddings";
import { isPlaceholderSlug, slugify } from "@/lib/listings/slug";
import { FOCUS_KEYWORD_LIMIT, SEO_DESCRIPTION_LIMIT, SEO_TITLE_LIMIT } from "@/lib/seo/listing-seo";

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
  /** Client's own landing page; when set, visitors to this listing go there. */
  redirect_url: string;
  /** SEO panel (see app/admin/listings/seo-panel.tsx). Empty = use fallbacks. */
  seo_title: string;
  seo_description: string;
  focus_keyword: string;
  /** Social share overrides. Empty = use the SEO title/description and the
   *  featured photo. og_image_url is a listing photo URL or an uploaded one. */
  og_title: string;
  og_description: string;
  og_image_url: string;
  /** "Answer engines" panel (AEO/GEO, see lib/seo/aeo.ts). faqs_json is the
   *  panel's hidden JSON list of {q, a}. */
  quick_answer: string;
  faqs_json: string;
  offer_price: string;
  offer_discount: string;
  redemption_info: string;
  keywords: string;
  description: string;
  status: string;
  expires_at: string;
  /** Editable view count (string from the number input). */
  view_count: string;
  /** Published date (YYYY-MM-DD, Singapore) = created_at; "" on create. */
  published_date: string;
  /** Checkbox: "1" when ticked, "" when not (an unticked box isn't sent at all). */
  homepage_featured: string;
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
    redirect_url: get("redirect_url"),
    seo_title: get("seo_title"),
    seo_description: get("seo_description"),
    focus_keyword: get("focus_keyword"),
    og_title: get("og_title"),
    og_description: get("og_description"),
    og_image_url: get("og_image_url"),
    quick_answer: get("quick_answer"),
    faqs_json: get("faqs_json"),
    offer_price: get("offer_price"),
    offer_discount: get("offer_discount"),
    redemption_info: get("redemption_info"),
    keywords: get("keywords"),
    description: get("description"),
    status: get("status"),
    expires_at: get("expires_at"),
    view_count: get("view_count") || "0",
    published_date: get("published_date"),
    homepage_featured: formData.has("homepage_featured") ? "1" : "",
  };
}

const OWN_HOSTS = new Set(["directories.fd.sg", "www.directories.fd.sg", "directory.fd.sg"]);

function isOwnListingUrl(url: string, slug: string): boolean {
  const parsed = new URL(url);
  return OWN_HOSTS.has(parsed.hostname) && parsed.pathname.replace(/\/+$/, "") === `/listings/${slug}`;
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

  // Only http(s), same rule as the CTA link. Pointing it back at this
  // listing's own page would redirect in a loop, so that's refused too.
  let redirectUrl: string | null = null;
  if (values.redirect_url) {
    redirectUrl = normalizeHttpUrl(values.redirect_url);
    if (!redirectUrl) {
      fieldErrors.redirect_url = "Enter a valid web address, e.g. https://client-site.com/offer";
    } else if (slug && isOwnListingUrl(redirectUrl, slug)) {
      fieldErrors.redirect_url = "This points back to the listing itself — use the client's own page.";
    }
  }

  // Only write the view count if staff actually changed it, so saving the
  // form doesn't wipe out views counted while it was open.
  const viewCountChanged = values.view_count !== String(formData.get("view_count_original") ?? values.view_count);
  const viewCount = Number(values.view_count);
  if (viewCountChanged && (!Number.isInteger(viewCount) || viewCount < 0 || viewCount > 2_000_000_000)) {
    fieldErrors.view_count = "Views must be a whole number, 0 or more.";
  }
  // Published date: only written when staff changed it (like the view count),
  // so saving never shifts it. Today = now; another day = midday that day.
  const publishedDateChanged =
    !!values.published_date &&
    values.published_date !== String(formData.get("published_date_original") ?? values.published_date);
  let publishedAt: Date | null = null;
  if (publishedDateChanged) {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(values.published_date);
    publishedAt = !valid
      ? null
      : values.published_date === todayInSingapore()
        ? new Date()
        : new Date(`${values.published_date}T12:00:00+08:00`);
    if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
      fieldErrors.published_date = "Enter a valid published date.";
    } else if (values.published_date > todayInSingapore()) {
      fieldErrors.published_date = "The published date can't be in the future.";
    }
  }
  if (values.expires_at && !/^\d{4}-\d{2}-\d{2}$/.test(values.expires_at)) {
    fieldErrors.expires_at = "Enter a valid expiry date.";
  }

  // Lengths past the recommended 60/160 are only warned about in the panel;
  // these hard caps just stop accidental pastes of whole documents.
  if (values.seo_title.length > SEO_TITLE_LIMIT) fieldErrors.seo_title = `Keep the SEO title under ${SEO_TITLE_LIMIT} characters.`;
  if (values.seo_description.length > SEO_DESCRIPTION_LIMIT)
    fieldErrors.seo_description = `Keep the meta description under ${SEO_DESCRIPTION_LIMIT} characters.`;
  if (values.focus_keyword.length > FOCUS_KEYWORD_LIMIT)
    fieldErrors.focus_keyword = `Keep the focus keyword under ${FOCUS_KEYWORD_LIMIT} characters.`;
  if (values.og_title.length > SEO_TITLE_LIMIT) fieldErrors.og_title = `Keep the social title under ${SEO_TITLE_LIMIT} characters.`;
  if (values.og_description.length > SEO_DESCRIPTION_LIMIT)
    fieldErrors.og_description = `Keep the social description under ${SEO_DESCRIPTION_LIMIT} characters.`;
  // Either a file in our own storage (an uploaded social image) or any valid
  // http(s) image address (a listing photo, which may be hotlinked).
  const ogImageUrl = values.og_image_url
    ? isStoredFileUrl(values.og_image_url)
      ? values.og_image_url
      : normalizeHttpUrl(values.og_image_url)
    : null;
  if (values.og_image_url && !ogImageUrl) fieldErrors.og_image_url = "That social image address isn't valid — pick or upload the image again.";

  // Answer engines panel. Hard caps only; the panel's checks give the advice.
  const quickAnswer = values.quick_answer.replace(/\s+/g, " ").trim();
  if (quickAnswer.length > QUICK_ANSWER_MAX + 100)
    fieldErrors.quick_answer = `Keep the quick answer under ${QUICK_ANSWER_MAX} characters.`;
  const faqResult = parseFaqs(values.faqs_json);
  if (faqResult.error) fieldErrors.faqs_json = faqResult.error;
  const offerPrice = normalizePrice(values.offer_price);
  if (offerPrice === undefined) fieldErrors.offer_price = "Enter the price as a number, e.g. 25.90";
  if (values.offer_discount.length > OFFER_DISCOUNT_MAX)
    fieldErrors.offer_discount = `Keep the discount under ${OFFER_DISCOUNT_MAX} characters.`;
  if (values.redemption_info.length > REDEMPTION_MAX)
    fieldErrors.redemption_info = `Keep "how to redeem" under ${REDEMPTION_MAX} characters.`;

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
    redirectUrl,
    seoTitle: values.seo_title.replace(/\s+/g, " ").trim() || null,
    seoDescription: values.seo_description.replace(/\s+/g, " ").trim() || null,
    focusKeyword: values.focus_keyword.replace(/\s+/g, " ").trim() || null,
    ogTitle: values.og_title.replace(/\s+/g, " ").trim() || null,
    ogDescription: values.og_description.replace(/\s+/g, " ").trim() || null,
    ogImageUrl,
    quickAnswer: quickAnswer || null,
    faqs: faqResult.faqs.length > 0 ? faqResult.faqs : null,
    offerPrice: offerPrice ?? null,
    offerDiscount: values.offer_discount.replace(/\s+/g, " ").trim() || null,
    redemptionInfo: values.redemption_info || null,
    keywords,
    description: values.description || null,
    status: status as (typeof LISTING_STATUSES)[number],
    expiresAt: values.expires_at || null,
    // Set here rather than on every UPDATE: view counting also updates the
    // row, and that shouldn't count as the listing changing (the sitemap's
    // lastModified tells search engines when to re-read the page).
    updatedAt: new Date(),
    ...(viewCountChanged ? { viewCount } : {}),
    ...(publishedDateChanged && publishedAt ? { createdAt: publishedAt, publishedDateLocked: true } : {}),
    homepageFeatured: values.homepage_featured === "1",
    // Unticking drops the listing out of the manual order too; ticking leaves
    // the stored position alone (the Featured page owns ordering).
    ...(values.homepage_featured === "1" ? {} : { homepageFeaturedOrder: 0 }),
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

  // A UEN that hasn't been checked yet is looked up in ACRA's register once
  // the response is sent (lib/business/verify-listing.ts).
  const uenToCheck = contact.parsed.companyUen;
  if (uenToCheck) {
    const savedId = listingId;
    after(() => verifyListingBusinessIfChanged(savedId, uenToCheck));
  }

  revalidatePath("/");
  revalidatePath(`/listings/${slug}`);
  // "Save & preview" button: same save, then the preview page.
  redirect(
    formData.get("intent") === "preview"
      ? `/admin/listings/${listingId}/preview`
      : `/admin/listings/${listingId}/edit?saved=1`,
  );
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

  // The edit form's Publish button wants to land back on the edit page (so
  // "Saved." shows there); each list page's inline Publish button wants to
  // stay on that list instead of jumping into an edit view nobody asked for.
  const returnTo = formData.get("returnTo");
  redirect(
    returnTo === "list"
      ? "/admin/listings?published=1"
      : returnTo === "synced"
        ? "/admin/listings/synced?published=1"
        : `/admin/listings/${id}/edit?saved=1`,
  );
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
  redirect(
    formData.get("returnTo") === "synced"
      ? "/admin/listings/synced?deleted=1"
      : "/admin/listings?deleted=1",
  );
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
    // Best-effort — a failed embedding just leaves this image out of
    // "search by image" results, never worth failing the add over.
    const embedding = await embedImageUrl(url);

    await db.insert(listingImages).values({
      listingId,
      url,
      altText: altText || null,
      position: existingCount,
      // Auto-feature the first image a listing gets, so it isn't imageless on
      // the grid/detail hero until someone remembers to flag one.
      isFeatured: existingCount === 0,
      embedding,
    });
  } catch (e) {
    redirect(editUrl(listingId, e instanceof Error ? e.message : "Could not add image."));
  }

  const slug = await getListingSlug(listingId);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  redirect(editUrl(listingId));
}

/** Uploads one or more image files to R2 storage (lib/storage/r2.ts) and attaches them
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
      // Embedded from the uploaded bytes directly (not re-fetched from the
      // stored URL afterwards) — best-effort, same as every other embedding
      // call site.
      const bytes = await file.arrayBuffer();
      const [url, embedding] = await Promise.all([
        putFile(makeKey(`listings/${listingId}`, file.name), bytes, file.type),
        embedImage(Buffer.from(bytes)),
      ]);
      await db.insert(listingImages).values({
        listingId,
        url,
        altText: null,
        position,
        // Auto-feature the first image a listing gets, so it isn't imageless
        // on the grid/detail hero until someone remembers to flag one.
        isFeatured: position === 0,
        embedding,
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

/**
 * Uploads a dedicated social share image (not added to the listing's photo
 * gallery) and returns its URL; the SEO panel puts it in og_image_url, which
 * is saved with the rest of the form. Called directly from the panel, not as
 * a form action, since it lives inside the main listing form.
 */
export async function uploadSocialImage(formData: FormData): Promise<{ url?: string; error?: string }> {
  await requireStaff();
  const listingId = String(formData.get("listingId") ?? "");
  const file = formData.get("file");
  if (!/^[0-9a-f-]{36}$/i.test(listingId)) return { error: "Save the listing first, then add a social image." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return { error: "The image must be PNG, JPEG, WebP or GIF." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "The image must be under 5MB." };
  try {
    const url = await putFile(makeKey(`social/${listingId}`, file.name), await file.arrayBuffer(), file.type);
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not upload the image." };
  }
}
