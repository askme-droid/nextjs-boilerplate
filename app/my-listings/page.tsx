import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { getMyListings } from "@/lib/listings/user-queries";
import { deleteMyListing } from "./actions";

const statusClass: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  const { user } = await requireUser();
  const { saved, deleted, error } = await searchParams;
  const listings = await getMyListings(user.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My listings</h1>
        <Link
          href="/my-listings/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          New listing
        </Link>
      </div>

      {saved && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Saved.
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
          You haven&apos;t created any listings yet.{" "}
          <Link href="/my-listings/new" className="underline underline-offset-4">
            Create your first one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {listings.map((listing) => (
            <li key={listing.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/my-listings/${listing.id}/edit`}
                  className="font-medium hover:underline"
                >
                  {listing.title}
                </Link>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  {listing.categories?.name ?? "No category"}
                  {listing.location ? ` · ${listing.location}` : ""}
                </p>
              </div>
              <div className="flex flex-none items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statusClass[listing.status] ?? statusClass.draft
                  }`}
                >
                  {listing.status}
                </span>
                <form action={deleteMyListing}>
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
    </main>
  );
}
