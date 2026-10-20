"use client";

import { useActionState, useRef, useState } from "react";
import type { ListingCategory, ListingTag } from "@/lib/listings/queries";
import type { ListingFormValues } from "../actions";
import { ListingForm } from "../listing-form";
import { generateListing, type GenerateState } from "../generate-actions";
import { FlyerReader } from "./flyer-reader";
import type { UenVerification } from "@/lib/listings/admin-queries";

const fieldClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";

export function EditListingClient({
  listingId,
  initialValues,
  categories,
  allTags,
  selectedTagIds,
  images,
  children,
  footer,
  uenVerification,
}: {
  listingId: string;
  uenVerification?: UenVerification | null;
  /** Listing photos, offered as social share images in the SEO panel. */
  images?: { url: string; is_featured: boolean; position: number }[];
  initialValues: ListingFormValues;
  categories: ListingCategory[];
  allTags: ListingTag[];
  selectedTagIds: string[];
  /** The image manager, slotted between the form's fields and its Save
   *  button (see ListingForm). */
  children?: React.ReactNode;
  /** Shown after the SEO panel (the delete box). */
  footer?: React.ReactNode;
}) {
  // The flyer picked in the box below, also read by the free flyer reader.
  const flyerInput = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    generateListing,
    {},
  );

  // ListingForm's inputs are uncontrolled (defaultValue), so updating
  // `values` after mount doesn't change what's on screen — remounting it
  // (via `key`) is what actually applies a newly generated draft over
  // whatever the listing's own saved values were.
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
              ref={flyerInput}
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
            Fills in the form below for you to review — nothing changes until
            you click &quot;Save changes&quot;.
          </p>
        </form>

        <FlyerReader categories={categories} getFile={() => flyerInput.current?.files?.[0] ?? null} />
      </section>

      <ListingForm
        key={draft?.key ?? 0}
        listingId={listingId}
        images={images}
        categories={categories}
        submitLabel="Save changes"
        initialValues={
          draft
            ? {
                ...draft.values,
                // The generator never fills these, so keep what's saved
                // instead of letting a blank draft wipe them from the form.
                company_name: initialValues.company_name,
                company_uen: initialValues.company_uen,
                social_links: initialValues.social_links,
                cta_label: initialValues.cta_label,
                cta_url: initialValues.cta_url,
                redirect_url: initialValues.redirect_url,
                seo_title: initialValues.seo_title,
                seo_description: initialValues.seo_description,
                focus_keyword: initialValues.focus_keyword,
                og_title: initialValues.og_title,
                og_description: initialValues.og_description,
                og_image_url: initialValues.og_image_url,
                homepage_featured: initialValues.homepage_featured,
                view_count: initialValues.view_count,
              }
            : initialValues
        }
        allTags={allTags}
        selectedTagIds={selectedTagIds}
        footer={footer}
        uenVerification={uenVerification}
      >
        {children}
      </ListingForm>
    </div>
  );
}
