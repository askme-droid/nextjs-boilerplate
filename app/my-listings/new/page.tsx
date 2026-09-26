import { requireUser } from "@/lib/auth/require-user";
import { createMyListing } from "../actions";

// Not linked to from anywhere anymore (see app/my-listings/page.tsx's "New
// listing" button) — kept as a fallback for anyone with this URL bookmarked
// or typed directly. Creation only happens on the real POST below, never as
// a side effect of loading this page, so a prefetch of this route is a
// harmless no-op.
export default async function NewMyListingPage() {
  await requireUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 p-6">
      <form action={createMyListing}>
        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90"
        >
          New listing
        </button>
      </form>
    </main>
  );
}
