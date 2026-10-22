import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { parseSort, sortListings } from "../sort";
import { ListingsTable } from "../listings-table";
import { getSyndicatedListings } from "@/lib/listings/admin-queries";
import { refreshSyncedListings } from "../sync-actions";

// "Refresh from fd.sg" (below) now embeds every image it scrapes (CLIP
// inference per image, not just HTTP fetches) before this page's default
// function duration budget was ever sized for that — request the platform
// max so a sync pulling in several new listings at once has room. Vercel
// clamps this to whatever the plan actually allows, so it's safe to ask for
// more than is available.
export const maxDuration = 300;


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
  searchParams: Promise<{ published?: string; deleted?: string; refreshed?: string; error?: string; sort?: string; dir?: string }>;
}) {
  const { role } = await requireStaff();
  const { published, deleted, refreshed, error } = await searchParams;
  const { sort: sortParam, dir } = await searchParams;
  const sort = parseSort(sortParam, dir);
  const listings = sortListings(await getSyndicatedListings(role), sort);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Synced listings</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Shown in search here, but the content and the link both point back
            to the original source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <form action={refreshSyncedListings}>
            <button
              type="submit"
              className="whitespace-nowrap rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Refresh from fd.sg
            </button>
          </form>
          <Link
            href="/admin/listings"
            className="whitespace-nowrap text-sm font-medium underline-offset-4 hover:underline"
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
        <ListingsTable listings={listings} returnTo="synced" synced sort={sort} />
      )}
    </div>
  );
}
