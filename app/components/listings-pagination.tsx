import Link from "next/link";

type FilterParams = { q: string; category: string; location: string; experience: string };

function pageHref(params: FilterParams, page: number) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.location) search.set("location", params.location);
  if (params.experience) search.set("experience", params.experience);
  if (page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `/?${qs}` : "/";
}

const linkClass =
  "rounded-md border border-brand-teal/30 px-3 py-1.5 text-sm font-medium text-brand-teal hover:bg-brand-teal/10 dark:border-brand-teal/40";
const disabledClass =
  "rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-400 dark:border-zinc-800 dark:text-zinc-600";

export function ListingsPagination({
  page,
  totalPages,
  q,
  category,
  location,
  experience,
}: FilterParams & {
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const params = { q, category, location, experience };

  return (
    <nav
      aria-label="Listings pagination"
      className="flex items-center justify-center gap-3"
    >
      {page > 1 ? (
        <Link href={pageHref(params, page - 1)} className={linkClass}>
          Previous
        </Link>
      ) : (
        <span className={disabledClass}>Previous</span>
      )}

      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Page {page} of {totalPages}
      </span>

      {page < totalPages ? (
        <Link href={pageHref(params, page + 1)} className={linkClass}>
          Next
        </Link>
      ) : (
        <span className={disabledClass}>Next</span>
      )}
    </nav>
  );
}
