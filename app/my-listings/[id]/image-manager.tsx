import type { MyListingImage } from "@/lib/listings/user-queries";
import {
  addMyListingImage,
  deleteMyListingImage,
  moveMyListingImage,
  setMyListingFeaturedImage,
  updateMyListingImageAltText,
  uploadMyListingImages,
} from "../actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/30 dark:border-zinc-700";
const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function MyImageManager({
  listingId,
  images,
}: {
  listingId: string;
  images: MyListingImage[];
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Images</h2>

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
                {/* Plain <img>, not next/image: a small fixed-size admin
                    thumbnail gains nothing from the fill/responsive machinery
                    used on the public pages. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt_text ?? ""}
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

                <form action={moveMyListingImage}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="imageId" value={image.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={index === 0} className={buttonClass}>
                    ↑
                  </button>
                </form>

                <form action={moveMyListingImage}>
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
                  <form action={setMyListingFeaturedImage}>
                    <input type="hidden" name="listingId" value={listingId} />
                    <input type="hidden" name="imageId" value={image.id} />
                    <button type="submit" className={buttonClass}>
                      Make featured
                    </button>
                  </form>
                )}

                <form action={deleteMyListingImage}>
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
                action={updateMyListingImageAltText}
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

      <form action={uploadMyListingImages} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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

      <form action={addMyListingImage} className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
