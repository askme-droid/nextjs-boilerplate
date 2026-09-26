"use client";

import { useActionState } from "react";
import {
  saveCategory,
  type CategoryFormState,
  type CategoryFormValues,
} from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const labelClass = "text-sm font-medium";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

const emptyValues: CategoryFormValues = { name: "", slug: "", description: "" };

export function CategoryForm({
  categoryId,
  initialValues,
  submitLabel,
  children,
}: {
  /** Present when editing; omitted when creating. */
  categoryId?: string;
  initialValues?: CategoryFormValues;
  submitLabel: string;
  /** Rendered between the fields and the submit button — the delete section,
   *  on the edit page. Kept as a separate element (not nested inside this
   *  form) so the page controls where it sits while the button below still
   *  references this form by id. */
  children?: React.ReactNode;
}) {
  const initialState: CategoryFormState = { values: initialValues ?? emptyValues };
  const [state, formAction, pending] = useActionState(saveCategory, initialState);
  const values = state.values;

  return (
    <>
      <form id="category-form" action={formAction} className="flex flex-col gap-4">
        {categoryId && <input type="hidden" name="id" value={categoryId} />}

      {state.error && (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      )}

      <label className={labelClass}>
        Name
        <input
          type="text"
          name="name"
          required
          defaultValue={values.name}
          className={inputClass}
        />
        {state.fieldErrors?.name && <p className={errorClass}>{state.fieldErrors.name}</p>}
      </label>

      <label className={labelClass}>
        Slug
        <input
          type="text"
          name="slug"
          placeholder="Leave blank to generate from the name"
          defaultValue={values.slug}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
          Used in the listings filter: /?category=your-slug. Must be unique.
        </span>
        {state.fieldErrors?.slug && <p className={errorClass}>{state.fieldErrors.slug}</p>}
      </label>

      <label className={labelClass}>
        Description
        <textarea
          name="description"
          rows={3}
          defaultValue={values.description}
          className={inputClass}
        />
      </label>
      </form>

      {children}

      <button
        type="submit"
        form="category-form"
        disabled={pending}
        className="w-fit rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </>
  );
}
