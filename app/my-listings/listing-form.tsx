"use client";

import { useActionState } from "react";
import type { ListingCategory } from "@/lib/listings/queries";
import { saveMyListing, type MyListingFormState, type MyListingFormValues } from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const labelClass = "text-sm font-medium";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

const emptyValues: MyListingFormValues = {
  title: "",
  slug: "",
  category_id: "",
  location: "",
  keywords: "",
  description: "",
  expires_at: "",
};

export function MyListingForm({
  listingId,
  initialValues,
  categories,
  currentStatus,
  children,
}: {
  /** Present when editing; omitted when creating. */
  listingId?: string;
  initialValues?: MyListingFormValues;
  categories: ListingCategory[];
  /** Shown read-only when editing — status only ever changes via an intent
   *  button (draft/pending) or an admin's decision, never a direct field. */
  currentStatus?: string;
  /** Rendered between the fields and the submit buttons — the image
   *  manager, on the edit page. It's a separate <form> (can't nest inside
   *  this one), so it's slotted in here and the buttons below reference
   *  this form by id instead of living inside it. */
  children?: React.ReactNode;
}) {
  const initialState: MyListingFormState = { values: initialValues ?? emptyValues };
  const [state, formAction, pending] = useActionState(saveMyListing, initialState);
  const values = state.values;

  return (
    <>
      <form id="my-listing-form" action={formAction} className="flex flex-col gap-4">
        {listingId && <input type="hidden" name="id" value={listingId} />}

      {currentStatus && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Current status: <span className="font-medium">{currentStatus}</span>
          {currentStatus === "rejected" &&
            " — resubmit below once you've made changes."}
        </p>
      )}

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
      </form>

      {children}

      <div className="flex gap-3">
        <button
          type="submit"
          form="my-listing-form"
          name="intent"
          value="draft"
          disabled={pending}
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {pending ? "Saving…" : "Save as draft"}
        </button>
        <button
          type="submit"
          form="my-listing-form"
          name="intent"
          value="pending"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit for review"}
        </button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Drafts are private to you. Submitting sends it to an admin for approval
        before it appears on the site.
      </p>
    </>
  );
}
