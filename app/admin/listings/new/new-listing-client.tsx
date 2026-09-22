"use client";

import { useActionState, useState } from "react";
import type { ListingCategory } from "@/lib/listings/queries";
import type { ListingFormValues } from "../actions";
import { ListingForm } from "../listing-form";
import { generateListing, type GenerateState } from "./generate-actions";

const fieldClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";

export function NewListingClient({ categories }: { categories: ListingCategory[] }) {
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generateListing,
    {},
  );

  // ListingForm's inputs are uncontrolled (defaultValue), so updating
  // `initialValues` after mount doesn't change what's on screen — remounting
  // it (via `key`) is what actually applies a new generated draft.
  //
  // Derived during render (not an effect): React's documented pattern for
  // "adjust state when a prop/value changes" is to compare against the last
  // value seen and call setState directly in the render body when it
  // differs — that's a same-commit re-render, not an extra effect-driven one.
  const [draft, setDraft] = useState<{ values: ListingFormValues; key: number }>();
  const [lastAppliedValues, setLastAppliedValues] = useState<ListingFormValues>();

  if (state.values && state.values !== lastAppliedValues) {
    setLastAppliedValues(state.values);
    setDraft((prev) => ({ values: state.values!, key: (prev?.key ?? 0) + 1 }));
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Generate from a description or flyer
        </h2>

        <form action={formAction} className="flex flex-col gap-3">
          <textarea
            name="description"
            rows={3}
            placeholder="Paste a description, or describe the business/event…"
            className={fieldClass}
          />
          <label className="text-sm">
            Flyer image (optional)
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block text-sm"
            />
          </label>

          {state.error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {pending ? "Generating…" : "Generate"}
          </button>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Fills in the form below for you to review — nothing is saved until
            you click &quot;Create listing&quot;.
          </p>
        </form>
      </section>

      <ListingForm
        key={draft?.key ?? 0}
        categories={categories}
        submitLabel="Create listing"
        initialValues={draft?.values}
      />
    </div>
  );
}
