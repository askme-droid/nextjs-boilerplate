import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { parseSort, sortListings } from "./sort";
import { ListingsTable } from "./listings-table";
import { getAdminListings } from "@/lib/listings/admin-queries";
import { createListing } from "./actions";


export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; deleted?: string; error?: string; sort?: string; dir?: string }>;
}) {
  const { role } = await requireStaff();
  const { published, deleted, error } = await searchParams;
  const { sort: sortParam, dir } = await searchParams;
  const sort = parseSort(sortParam, dir);
  const listings = sortListings(await getAdminListings(role), sort);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/admin/listings/featured"
            className="whitespace-nowrap text-sm font-medium underline-offset-4 hover:underline"
          >
            Featured listings →
          </Link>
          <Link
            href="/admin/listings/synced"
            className="whitespace-nowrap text-sm font-medium underline-offset-4 hover:underline"
          >
            Synced listings →
          </Link>
          <form action={createListing}>
            <button
              type="submit"
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              New listing
            </button>
          </form>
        </div>
      </div>

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
        <p className="text-zinc-500 dark:text-zinc-400">
          No listings yet.{" "}
          <form action={createListing} className="inline">
            <button type="submit" className="underline underline-offset-4">
              Create the first one
            </button>
          </form>
          .
        </p>
      ) : (
        <ListingsTable listings={listings} returnTo="list" sort={sort} />
      )}
    </div>
  );
}
