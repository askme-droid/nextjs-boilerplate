import Link from "next/link";

function pageHref(params: { q: string; category: string }, page: number) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/?${qs}` : "/";
}

const linkClass =
  "rounded-md border border-teal-200 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-900 dark:text-teal-400 dark:hover:bg-teal-900/30";
const disabledClass =
  "rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-600";

export function ListingsPagination({
  page,
  totalPages,
  q,
  category,
}: {
  page: number;
  totalPages: number;
  q: string;
  category: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Listings pagination"
      className="flex items-center justify-center gap-3"
    >
      {page > 1 ? (
        <Link href={pageHref({ q, category }, page - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass}>Previous</span>
      )}

      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link href={pageHref({ q, category }, page + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass}>Next</span>
      )}
    </nav>
  );
}
