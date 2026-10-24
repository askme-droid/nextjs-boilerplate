"use client";

import { useActionState, useState } from "react";
import { LISTING_STATUSES } from "@/lib/listings/constants";
import type { ListingCategory, ListingTag } from "@/lib/listings/queries";
import { publishListing, saveListing, type ListingFormState, type ListingFormValues } from "./actions";
import { SeoPanel } from "./seo-panel";
import { ExpiryField } from "@/app/components/expiry-field";
import { todayInSingapore } from "@/lib/listings/expiry-dates";
import type { UenVerification } from "@/lib/listings/admin-queries";
import { UenCheck } from "./uen-check";
import { AeoPanel } from "./aeo-panel";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const labelClass = "text-sm font-medium";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

const emptyValues: ListingFormValues = {
  title: "",
  slug: "",
  category_id: "",
  location: "",
  company_name: "",
  company_uen: "",
  social_links: "",
  cta_label: "",
  cta_url: "",
  redirect_url: "",
  seo_title: "",
  seo_description: "",
  focus_keyword: "",
  og_title: "",
  og_description: "",
  og_image_url: "",
  quick_answer: "",
  faqs_json: "",
  offer_price: "",
  offer_discount: "",
  redemption_info: "",
  audience: "",
  key_points_json: "",
  keywords: "",
  description: "",
  status: "draft",
  expires_at: "",
  view_count: "0",
  published_date: "",
  homepage_featured: "",
};

export function ListingForm({
  listingId,
  initialValues,
  categories,
  submitLabel,
  allTags,
  selectedTagIds,
  images,
  children,
  footer,
  uenVerification,
  verifiedBusiness = false,
}: {
  /** Present when editing; omitted when creating. */
  listingId?: string;
  initialValues?: ListingFormValues;
  categories: ListingCategory[];
  submitLabel: string;
  /**
   * Tags can only attach to a listing that already exists, so this (and the
   * checkboxes below) is only passed on the edit form, never on create.
   * Passing it is also what tells saveListing to touch tags at all — see the
   * `tagsIncluded` marker below.
   */
  allTags?: ListingTag[];
  selectedTagIds?: string[];
  /** The listing's photos, for picking a social share image (edit form only). */
  images?: { url: string; is_featured: boolean; position: number }[];
  /** Rendered between the fields and the submit button — the image
   *  manager, on the edit page. It's its own set of <form>s and can't nest
   *  inside this one, so it's slotted in here and the button below
   *  references this form by id instead of living inside it. */
  children?: React.ReactNode;
  /** Rendered after the SEO panel, just above the Save button — the delete
   *  box on the edit page. */
  footer?: React.ReactNode;
  /** Last ACRA check of the UEN (edit form only). */
  uenVerification?: UenVerification | null;
  /** Saved UEN is ACRA-verified and live (for the answer-engine checks). */
  verifiedBusiness?: boolean;
}) {
  const initialState: ListingFormState = { values: initialValues ?? emptyValues };
  const [state, formAction, pending] = useActionState(saveListing, initialState);
  const values = state.values;
  const selected = new Set(selectedTagIds ?? []);

  return (
    <>
    <form id="listing-form" action={formAction} className="flex flex-col gap-4">
      {listingId && <input type="hidden" name="id" value={listingId} />}

      {state.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}

      <label className={labelClass}>
        Title
        <input
          type="text"
          name="title"
          required
          defaultValue={values.title}
          className={inputClass}
        />
        {state.fieldErrors?.title && <p className={errorClass}>{state.fieldErrors.title}</p>}
      </label>

      <label className={labelClass}>
        Slug
        <input
          type="text"
          name="slug"
          placeholder="Leave blank to generate from the title"
          defaultValue={values.slug}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          Used in the URL: /listings/your-slug. Must be unique.
        </span>
        {state.fieldErrors?.slug && <p className={errorClass}>{state.fieldErrors.slug}</p>}
      </label>

      <label className={labelClass}>
        Category
        <select name="category_id" defaultValue={values.category_id} className={inputClass}>
          <option value="">Select a category…</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.category_id && (
          <p className={errorClass}>{state.fieldErrors.category_id}</p>
        )}
      </label>

      <label className={labelClass}>
        Status
        <select name="status" defaultValue={values.status} className={inputClass}>
          {LISTING_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          Only &quot;Published&quot; listings are visible to the public.
        </span>
        {state.fieldErrors?.status && <p className={errorClass}>{state.fieldErrors.status}</p>}
      </label>

      <label className={labelClass}>
        Location
        <input
          type="text"
          name="location"
          defaultValue={values.location}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Company name
        <input
          type="text"
          name="company_name"
          defaultValue={values.company_name}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Company UEN
        <input
          type="text"
          name="company_uen"
          placeholder="e.g. 201912345K"
          defaultValue={values.company_uen}
          className={inputClass}
        />
        {state.fieldErrors?.company_uen && (
          <p className={errorClass}>{state.fieldErrors.company_uen}</p>
        )}
      </label>
      {listingId && <UenCheck listingId={listingId} saved={uenVerification ?? null} />}

      <label className={labelClass}>
        Social links
        <textarea
          name="social_links"
          rows={3}
          placeholder={"One link per line\nhttps://www.facebook.com/yourpage\nhttps://www.instagram.com/yourpage"}
          defaultValue={values.social_links}
          className={inputClass}
        />
        {state.fieldErrors?.social_links && (
          <p className={errorClass}>{state.fieldErrors.social_links}</p>
        )}
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <label className={`${labelClass} sm:w-56`}>
          Button label (CTA)
          <input
            type="text"
            name="cta_label"
            placeholder="Learn more"
            defaultValue={values.cta_label}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Button link (CTA)
          <input
            type="text"
            name="cta_url"
            placeholder="https://"
            defaultValue={values.cta_url}
            className={inputClass}
          />
          {state.fieldErrors?.cta_url && (
            <p className={errorClass}>{state.fieldErrors.cta_url}</p>
          )}
        </label>
      </div>

      <label className={labelClass}>
        Redirect visitors to (optional)
        <input
          type="text"
          name="redirect_url"
          placeholder="https://client-website.com/landing-page"
          defaultValue={values.redirect_url}
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          For clients who want their listing to go to their own page or domain. The listing
          stays in search and categories here, but clicking it opens this address instead of
          the listing page. Leave empty to show the normal listing page.
        </span>
        {state.fieldErrors?.redirect_url && (
          <p className={errorClass}>{state.fieldErrors.redirect_url}</p>
        )}
      </label>

      <label className={labelClass}>
        Description
        <textarea
          name="description"
          rows={5}
          defaultValue={values.description}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Keywords
        <input
          type="text"
          name="keywords"
          placeholder="comma, separated, keywords"
          defaultValue={values.keywords}
          className={inputClass}
        />
      </label>

      {listingId && (
        <PublishedDateField
          defaultValue={values.published_date}
          original={initialValues?.published_date ?? values.published_date}
          error={state.fieldErrors?.published_date}
        />
      )}

      <ExpiryField defaultValue={values.expires_at} inputClass={inputClass} labelClass={labelClass} />
      {state.fieldErrors?.expires_at && <p className={errorClass}>{state.fieldErrors.expires_at}</p>}

      <label className={labelClass}>
        Views
        <input
          type="number"
          name="view_count"
          min={0}
          step={1}
          defaultValue={values.view_count}
          className={`${inputClass} max-w-40`}
        />
        <input type="hidden" name="view_count_original" value={values.view_count} />
        <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          Counted automatically each time a visitor opens the listing. Change it only to correct it
          (e.g. to carry over views from the old site) — leaving it as is keeps counting normally.
        </span>
        {state.fieldErrors?.view_count && <p className={errorClass}>{state.fieldErrors.view_count}</p>}
      </label>

      {allTags && (
        <div className="flex flex-col gap-2">
          <input type="hidden" name="tagsIncluded" value="1" />
          <span className={labelClass}>Experience tags</span>
          {allTags.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No experience tags exist yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {allTags.map((tag) => (
                <label
                  key={tag.id}
                  className="flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                >
                  <input
                    type="checkbox"
                    name="tagIds"
                    value={tag.id}
                    defaultChecked={selected.has(tag.id)}
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </form>

    {/* Listing extras (images) first, then SEO, then the danger zone. The SEO
        panel sits outside the <form> for layout, so its inputs join the form
        through form="listing-form" (see seo-panel.tsx). */}
    {children}

      <SeoPanel
      initial={{
        seo_title: values.seo_title,
        seo_description: values.seo_description,
        focus_keyword: values.focus_keyword,
        og_title: values.og_title,
        og_description: values.og_description,
        og_image_url: values.og_image_url,
      }}
      listingId={listingId}
      images={images}
      errors={{
        seo_title: state.fieldErrors?.seo_title,
        seo_description: state.fieldErrors?.seo_description,
        focus_keyword: state.fieldErrors?.focus_keyword,
        og_title: state.fieldErrors?.og_title,
        og_description: state.fieldErrors?.og_description,
        og_image_url: state.fieldErrors?.og_image_url,
      }}
    />

    <AeoPanel
      initial={{
        quick_answer: values.quick_answer,
        faqs_json: values.faqs_json,
        offer_price: values.offer_price,
        offer_discount: values.offer_discount,
        redemption_info: values.redemption_info,
        audience: values.audience,
        key_points_json: values.key_points_json,
      }}
      errors={{
        quick_answer: state.fieldErrors?.quick_answer,
        faqs_json: state.fieldErrors?.faqs_json,
        offer_price: state.fieldErrors?.offer_price,
        offer_discount: state.fieldErrors?.offer_discount,
        redemption_info: state.fieldErrors?.redemption_info,
        audience: state.fieldErrors?.audience,
        key_points_json: state.fieldErrors?.key_points_json,
      }}
      verified={verifiedBusiness}
    />

    {footer}

    {/* The form is long, so a failed save would otherwise only show its error
        next to a field far above the Save button (e.g. a missing category),
        and it looks as if nothing happened. Repeat every problem here. */}
    {(state.error || (state.fieldErrors && Object.values(state.fieldErrors).some(Boolean))) && (
      <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
        <p className="font-medium">Not saved yet — please fix:</p>
        <ul className="mt-1 list-disc pl-5">
          {state.error && <li>{state.error}</li>}
          {Object.values(state.fieldErrors ?? {})
            .filter(Boolean)
            .map((msg) => (
              <li key={String(msg)}>{msg}</li>
            ))}
        </ul>
      </div>
    )}

    <div className="flex flex-wrap gap-3">
      <button
        type="submit"
        form="listing-form"
        disabled={pending}
        className="w-fit rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>

      {/* Saves like the button above, then opens the listing page as
          visitors will see it — works for drafts too (nothing is published). */}
      {listingId && (
        <button
          type="submit"
          form="listing-form"
          name="intent"
          value="preview"
          disabled={pending}
          className="w-fit rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Save &amp; preview
        </button>
      )}

      {/* Quick one-click approve — bypasses the dropdown + full save below,
          for the common case of just approving a pending/draft listing.
          formAction overrides the form's own action for this button only,
          so it hits publishListing instead of saveListing; only shown once
          the listing exists (create has no id yet) and isn't already
          published. */}
      {listingId && values.status !== "published" && (
        <button
          type="submit"
          form="listing-form"
          formAction={publishListing}
          disabled={pending}
          className="w-fit rounded-md bg-emerald-600 px-4 py-2 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60 dark:bg-emerald-700"
        >
          Publish
        </button>
      )}
    </div>
    </>
  );
}

/** "Published date" — the listing's published_at, shown as "Posted 3 days
 *  ago" on its card and used for the newest-first order. Separate from the
 *  created date (when the entry was made), which never changes. */
function PublishedDateField({
  defaultValue,
  original,
  error,
}: {
  defaultValue: string;
  /** Saved value, so the save action only writes the date if it changed. */
  original: string;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const today = todayInSingapore();
  return (
    <div className={labelClass}>
      <label htmlFor="published_date">Published date</label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          id="published_date"
          type="date"
          name="published_date"
          value={value}
          max={today}
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} mt-0 max-w-48`}
        />
        <button
          type="button"
          onClick={() => setValue(today)}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Today
        </button>
        {value !== original && (
          <button
            type="button"
            onClick={() => setValue(original)}
            className="text-sm text-zinc-500 underline-offset-4 hover:underline"
          >
            Undo
          </button>
        )}
      </div>
      <input type="hidden" name="published_date_original" value={original} />
      <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
        {original
          ? "Shown as “Posted …” on the listing card; listings are ordered newest first, so setting it to today moves the listing to the top. For listings synced from fd.sg, a date set here is kept on the next refresh."
          : "Not published yet — it's set automatically when the listing is first published, or pick a date now."}
      </span>
      {error && <p className={errorClass}>{error}</p>}
    </div>
  );
}
