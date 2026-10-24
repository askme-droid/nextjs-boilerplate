"use client";

import { useState, useTransition } from "react";
import type { ListingImage } from "@/lib/listings/queries";
import {
  type ImageActionResult,
  addImage,
  deleteImage,
  moveImage,
  setFeaturedImage,
  updateImageAltText,
  uploadImages,
} from "../actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function ImageManager({
  listingId,
  images,
}: {
  listingId: string;
  images: ListingImage[];
}) {
  // Every image action runs in place (no page reload), so unsaved changes or a
  // generated draft in the listing form above are kept.
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run =
    (action: (formData: FormData) => Promise<ImageActionResult>) =>
    (formData: FormData) =>
      new Promise<void>((resolve) => {
        startTransition(async () => {
          setError(null);
          try {
            const result = await action(formData);
            if (result?.error) setError(result.error);
          } catch {
            setError("Something went wrong — try again.");
          }
          resolve();
        });
      });

  return (
    <section className="flex flex-col gap-4" aria-busy={busy}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        Images
        {busy && <span className="text-sm font-normal text-zinc-500">Updating…</span>}
      </h2>
      <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Changes here save straight away and don&apos;t reload the page — anything you&apos;ve typed above stays as it
        is (still click Save changes for those).
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No images yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-center gap-3">
                {/* Plain <img>, not next/image: a small fixed-size admin thumbnail
                    gains nothing from the fill/responsive machinery used on the
                    public pages, and this avoids repeating the unoptimized note. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt_text ?? ""}
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 flex-none rounded object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{image.url}</p>
                  {image.is_featured && (
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Featured
                    </span>
                  )}
                </div>

                <form action={run(moveImage)}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={index === 0} className={buttonClass}>
                    ↑
                  </button>
                </form>

                <form action={run(moveImage)}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button
                    type="submit"
                    disabled={index === images.length - 1}
                    className={buttonClass}
                  >
                    ↓
                  </button>
                </form>

                {!image.is_featured && (
                  <form action={run(setFeaturedImage)}>
                    <input type="hidden" name="listingId" value={listingId} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <button type="submit" className={buttonClass}>
                      Make featured
                    </button>
                  </form>
                )}

                <form action={run(deleteImage)}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <button
                    type="submit"
                    className={`${buttonClass} text-red-600 dark:text-red-400`}
                  >
                    Delete
                  </button>
                </form>
              </div>

              <form
                action={run(updateImageAltText)}
                className="flex items-center gap-2 pl-[76px]"
              >
                <input type="hidden" name="listingId" value={listingId} />
                <input type="hidden" name="imageId" value={image.id} />
                <label className="flex-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Alt text
                  <input
                    type="text"
                    name="altText"
                    defaultValue={image.alt_text ?? ""}
                    placeholder="Describe this image for screen readers"
                    className={`${inputClass} mt-1 w-full text-sm`}
                  />
                </label>
                <button type="submit" className={`${buttonClass} self-end`}>
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={run(uploadImages)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="listingId" value={listingId} />
        <label className="flex-1 text-sm font-medium">
          Upload images
          <input
            type="file"
            name="files"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            required
            className={`${inputClass} mt-1 w-full`}
          />
          <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
            PNG, JPEG, WebP, or GIF. Up to 5MB each — select multiple at once.
          </span>
        </label>
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90"
        >
          Upload
        </button>
      </form>

      <form action={run(addImage)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="listingId" value={listingId} />
        <label className="flex-1 text-sm font-medium">
          Or add by image URL
          <input type="url" name="url" required className={`${inputClass} mt-1 w-full`} />
        </label>
        <label className="flex-1 text-sm font-medium">
          Alt text
          <input type="text" name="altText" className={`${inputClass} mt-1 w-full`} />
        </label>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Add
        </button>
      </form>
    </section>
  );
}
