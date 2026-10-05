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

const buttonClass =
  "rounded-md border border-zinc-300 px-2.5 py-1 text-sm font-medium hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:bg-zinc-800";

function Thumb({ row }: { row: FeaturedAdminRow }) {
  return (
    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
      {row.imageUrl && (
        <Image src={row.imageUrl} alt="" fill unoptimized sizes="4rem" className="object-cover" />
      )}
    </div>
  );
}

/** Why a picked listing isn't actually showing, or null if it is. */
function problem(row: FeaturedAdminRow): string | null {
  if (row.status !== "published") return `Not published (${row.status}) — hidden until it is.`;
  if (!row.hasImage) return "No photo — skipped until it has one.";
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

  // Mirrors the homepage: the gallery shows the first FEATURED_SLOTS picked
  // listings that can actually render, then tops up with the newest.
  const visible = picked.filter((row) => !problem(row));
  const shownIds = new Set(visible.slice(0, FEATURED_SLOTS).map((row) => row.id));
  const autoFilled = Math.max(0, FEATURED_SLOTS - shownIds.size);

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
          The homepage gallery shows {FEATURED_SLOTS} tiles, left to right, top row first. Pick
          listings and put them in order here; any slot you leave empty is filled with the newest
          listings automatically.
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
            ({shownIds.size} picked, {autoFilled} auto-filled)
          </span>
        </h2>

        {picked.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing picked yet, so the gallery is showing the {FEATURED_SLOTS} newest listings.
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
                  <div className="flex items-center gap-2">
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
                  {!row.hasImage && (
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      No photo — won&apos;t show until it has one.
                    </p>
                  )}
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
