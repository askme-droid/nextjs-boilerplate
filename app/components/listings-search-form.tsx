import Form from "next/form";
import Link from "next/link";
import type { ListingCategory } from "@/lib/listings/queries";

const fieldClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function ListingsSearchForm({
  q,
  category,
  categories,
}: {
  q: string;
  category: string;
  categories: ListingCategory[];
}) {
  const hasFilters = q !== "" || category !== "";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* A GET form: submitting re-navigates to "/" with these fields as the
          full search params (any not listed here, like `page`, are dropped —
          a new search should start back on page 1). Works with JS disabled. */}
      <Form action="/" className="flex flex-1 flex-col gap-2 sm:flex-row">
        <input
          type="search"
          name="q"
          placeholder="Search listings…"
          defaultValue={q}
          aria-label="Search listings"
          className={`${fieldClass} flex-1`}
        />

        <select
          name="category"
          defaultValue={category}
          aria-label="Filter by category"
          className={fieldClass}
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="rounded-md bg-brand-orange px-4 py-2 font-medium text-white transition-[filter] hover:brightness-95"
        >
          Search
        </button>
      </Form>

      {hasFilters && (
        <Link
          href="/"
          className="text-sm text-brand-teal underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      )}
    </div>
  );
}
