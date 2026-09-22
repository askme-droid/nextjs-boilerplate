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
}) {
  const initialState: ListingFormState = { values: initialValues ?? emptyValues };
  const [state, formAction, pending] = useActionState(saveListing, initialState);
  const values = state.values;
  const selected = new Set(selectedTagIds ?? []);

  return (
    <form action={formAction} className="flex flex-col gap-4">
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

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
