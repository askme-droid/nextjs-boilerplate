import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { getSyndicatedListings } from "@/lib/listings/admin-queries";
import { deleteListing, publishListing } from "../actions";
import { refreshSyncedListings } from "../sync-actions";

// "Refresh from fd.sg" (below) now embeds every image it scrapes (CLIP
// inference per image, not just HTTP fetches) before this page's default
// function duration budget was ever sized for that — request the platform
// max so a sync pulling in several new listings at once has room. Vercel
// clamps this to whatever the plan actually allows, so it's safe to ask for
// more than is available.
export const maxDuration = 300;

const statusClass: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

/**
 * Listings synced from an external source (fd.sg etc.) — kept off the main
 * /admin/listings list so staff don't mistake them for locally-owned
 * content. Editing here only changes how the card looks in our search
 * results (title/category/thumbnail); the actual content, and everywhere a
 * visitor ends up, is the external site — see external_url on each row and
 * app/components/listing-card.tsx / app/listings/[slug]/page.tsx.
 */
export default async function SyncedListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; deleted?: string; refreshed?: string; error?: string }>;
}) {
  const { role } = await requireStaff();
  const { published, deleted, refreshed, error } = await searchParams;
  const listings = await getSyndicatedListings(role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Synced listings</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Shown in search here, but the content and the link both point back
            to the original source.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <form action={refreshSyncedListings}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Refresh from fd.sg
            </button>
          </form>
          <Link
            href="/admin/listings"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            ← Listings
          </Link>
        </div>
      </div>

      {refreshed && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {refreshed}
        </p>
      )}
      {published && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Listing published.
        </p>
      )}
      {deleted && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Listing deleted.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      {listings.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">No synced listings.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {listings.map((listing) => (
            <li key={listing.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{listing.title}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-400">
                    Synced
                  </span>
                </div>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {listing.categories?.name ?? "No category"}
                </p>
                {listing.external_url && (
                  <a
                    href={listing.external_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs text-brand-teal hover:underline"
                  >
                    {listing.external_url} ↗
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statusClass[listing.status] ?? statusClass.draft
                  }`}
                >
                  {listing.status}
                </span>
                <Link
                  href={`/admin/listings/${listing.id}/edit`}
                  className="text-sm font-medium hover:underline"
                >
                  Edit
                </Link>
                {listing.status !== "published" && (
                  <form action={publishListing}>
                    <input type="hidden" name="id" value={listing.id} />
                    <input type="hidden" name="returnTo" value="synced" />
                    <button
                      type="submit"
                      className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Publish
                    </button>
                  </form>
                )}
                <form action={deleteListing}>
                  <input type="hidden" name="id" value={listing.id} />
                  <input type="hidden" name="returnTo" value="synced" />
                  <button
                    type="submit"
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
