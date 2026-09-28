"use client";

import { useActionState } from "react";
import { LISTING_STATUSES } from "@/lib/listings/constants";
import type { ListingCategory, ListingTag } from "@/lib/listings/queries";
import { saveListing, type ListingFormState, type ListingFormValues } from "./actions";

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
  keywords: "",
  description: "",
  status: "draft",
  expires_at: "",
};

export function ListingForm({
  listingId,
  initialValues,
  categories,
  submitLabel,
  allTags,
  selectedTagIds,
  children,
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
  /** Rendered between the fields and the submit button — the image
   *  manager, on the edit page. It's its own set of <form>s and can't nest
   *  inside this one, so it's slotted in here and the button below
   *  references this form by id instead of living inside it. */
  children?: React.ReactNode;
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

      <label className={labelClass}>
        Expires
        <input
          type="date"
          name="expires_at"
          defaultValue={values.expires_at}
          className={inputClass}
        />
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

    {children}

    <button
      type="submit"
      form="listing-form"
      disabled={pending}
      className="w-fit rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Saving…" : submitLabel}
    </button>
    </>
  );
}
