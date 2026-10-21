import Image from "next/image";
import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import {
  getFeaturedAdminListings,
  searchFeaturableListings,
  type FeaturedAdminRow,
} from "@/lib/listings/admin-queries";
import { FEATURED_SLOTS } from "@/lib/listings/constants";
import { addFeatured, moveFeatured, removeFeatured } from "../featured-actions";
import { MediaUpload } from "./media-upload";

const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm font-medium hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800";

function Thumb({ row }: { row: FeaturedAdminRow }) {
  return (
    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
      {row.slideImageUrl ? (
        // Plain <img> so an animated GIF slide animates in the preview too.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.slideImageUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : row.videoUrl ? (
        // #t=0.1 makes the browser paint a frame instead of a black box.
        <video
          src={`${row.videoUrl}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
      ) : (
        row.imageUrl && (
          <Image src={row.imageUrl} alt="" fill unoptimized sizes="4rem" className="object-cover" />
        )
      )}
    </div>
  );
}

/** Why a picked listing isn't actually showing, or null if it is. */
function problem(row: FeaturedAdminRow): string | null {
  if (row.status !== "published") return `Not published (${row.status}) — hidden until it is.`;
  if (!row.videoUrl && !row.slideImageUrl) return "No video or image — skipped until one is uploaded.";
  return null;
}

export default async function FeaturedListingsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; msg?: string }>;
}) {
  const { role } = await requireStaff("/admin/listings/featured");
  const { q = "", msg } = await searchParams;

  const [picked, candidates] = await Promise.all([
    getFeaturedAdminListings(role),
    searchFeaturableListings(role, q),
  ]);

  // Mirrors the homepage: the slider shows the first FEATURED_SLOTS picked
  // listings that are published and have a video or slide image. No top-up.
  const visible = picked.filter((row) => !problem(row));
  const shownIds = new Set(visible.slice(0, FEATURED_SLOTS).map((row) => row.id));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin/listings"
          className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          ← Listings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Featured listings</h1>
        <p className="max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">
          The homepage slider shows up to {FEATURED_SLOTS} listings, in the order below. A listing
          only appears once it has a video <em>or</em> an image: pick it below, then use Upload video
          (MP4 or WebM, up to 50MB) or Upload image (JPG, PNG, WebP or animated GIF, up to 15MB) on
          its row. Landscape 16:9 fits best (e.g. 1920×1080). Each slide shows one or the other —
          uploading one replaces the other. Image slides move on after a few seconds.
        </p>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {msg}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          On the homepage{" "}
          <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
            ({shownIds.size} of {FEATURED_SLOTS} slides live)
          </span>
        </h2>

        {picked.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing picked yet, so the slider is hidden on the homepage.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {picked.map((row, index) => {
              const issue = problem(row);
              const beyondSlots = !issue && !shownIds.has(row.id);
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
                  <span className="w-6 text-center text-sm tabular-nums text-zinc-500">
                    {issue || beyondSlots ? "–" : index + 1}
                  </span>
                  <Thumb row={row} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/listings/${row.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {row.title}
                    </Link>
                    <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                      {row.categoryName ?? "No category"}
                      {row.synced ? " · synced from fd.sg" : ""}
                    </p>
                    {issue && (
                      <p className="text-sm text-amber-700 dark:text-amber-400">{issue}</p>
                    )}
                    {beyondSlots && (
                      <p className="text-sm text-amber-700 dark:text-amber-400">
                        Past the {FEATURED_SLOTS} slots — not shown until something above is removed.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <MediaUpload listingId={row.id} label={row.videoUrl ? "Replace video" : "Upload video"} />
                    <MediaUpload
                      listingId={row.id}
                      kind="image"
                      label={row.slideImageUrl ? "Replace image" : "Upload image / GIF"}
                    />
                    {(row.videoUrl || row.slideImageUrl) && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {row.videoUrl ? "Video slide" : /\.gif($|\?)/i.test(row.slideImageUrl ?? "") ? "GIF slide" : "Image slide"}
                      </span>
                    )}
                    <form action={moveFeatured}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        className={buttonClass}
                        disabled={index === 0}
                        aria-label={`Move ${row.title} up`}
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveFeatured}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        className={buttonClass}
                        disabled={index === picked.length - 1}
                        aria-label={`Move ${row.title} down`}
                      >
                        ↓
                      </button>
                    </form>
                    <form action={removeFeatured}>
                      <input type="hidden" name="id" value={row.id} />
                      <button
                        type="submit"
                        className="text-sm text-red-600 hover:underline dark:text-red-400"
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Add a listing</h2>
        <form className="flex gap-2" role="search">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search published listings by title or location"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
          />
          <button type="submit" className={buttonClass}>
            Search
          </button>
        </form>

        {candidates.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {q ? "No published listings match." : "Every published listing is already picked."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {candidates.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 p-3">
                <Thumb row={row} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.title}</p>
                  <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {row.categoryName ?? "No category"}
                    {row.synced ? " · synced from fd.sg" : ""}
                  </p>
                </div>
                <form action={addFeatured}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className={buttonClass}>
                    Feature
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {candidates.length === 20 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Showing the newest 20 — search to narrow down.
          </p>
        )}
      </section>
    </div>
  );
}
