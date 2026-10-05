import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { getAdminListings } from "@/lib/listings/admin-queries";
import { createListing, deleteListing, publishListing } from "./actions";

const statusClass: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; deleted?: string; error?: string }>;
}) {
  const { role } = await requireStaff();
  const { published, deleted, error } = await searchParams;
  const listings = await getAdminListings(role);

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
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {listings.map((listing) => (
            <li key={listing.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/listings/${listing.id}/edit`}
                  className="font-medium hover:underline"
                >
                  {listing.title}
                </Link>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {listing.categories?.name ?? "No category"}
                  {listing.location ? ` · ${listing.location}` : ""}
                </p>
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
                    <input type="hidden" name="returnTo" value="list" />
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
