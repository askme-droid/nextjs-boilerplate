import Link from "next/link";

// Rendered when getListingBySlug() returns null: the slug doesn't exist, or
// the listing isn't published (RLS hides drafts from anonymous visitors).
export default function ListingNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Listing not found</h1>
      <p className="text-zinc-500 dark:text-zinc-400">
        It may have been unpublished, or the link may be incorrect.
      </p>
      <Link
        href="/"
        className="mt-2 text-sm underline-offset-4 hover:underline"
      >
        Back to listings
      </Link>
    </main>
  );
}
