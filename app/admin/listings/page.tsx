import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { getAdminListings } from "@/lib/listings/admin-queries";
import { createListing } from "./actions";

const statusClass: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export default async function AdminListingsPage() {
  const { role } = await requireStaff();
  const listings = await getAdminListings(role);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Listings</h1>
        <form action={createListing}>
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            New listing
          </button>
        </form>
      </div>

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
            <li key={listing.id} className="flex items-center justify-between gap-4 py-3">
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
              <span
                className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  statusClass[listing.status] ?? statusClass.draft
                }`}
              >
                {listing.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
