"use client";

import { useActionState } from "react";
import {
  saveExperienceTag,
  type ExperienceTagFormState,
  type ExperienceTagFormValues,
} from "./actions";

const inputClass =
  "mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const labelClass = "text-sm font-medium";
const errorClass = "mt-1 text-sm text-red-600 dark:text-red-400";

const emptyValues: ExperienceTagFormValues = { name: "", slug: "" };

export function ExperienceTagForm({
  tagId,
  initialValues,
  submitLabel,
}: {
  /** Present when editing; omitted when creating. */
  tagId?: string;
  initialValues?: ExperienceTagFormValues;
  submitLabel: string;
}) {
  const initialState: ExperienceTagFormState = { values: initialValues ?? emptyValues };
  const [state, formAction, pending] = useActionState(saveExperienceTag, initialState);
  const values = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {tagId && <input type="hidden" name="id" value={tagId} />}

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
          Used to identify this experience internally. Must be unique.
        </span>
        {state.fieldErrors?.slug && <p className={errorClass}>{state.fieldErrors.slug}</p>}
      </label>

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
