import Form from "next/form";
import Link from "next/link";
import type { ListingTag } from "@/lib/experience-tags/queries";
import type { ListingCategory } from "@/lib/listings/queries";
import { ImageSearchButton } from "./image-search-button";

const fieldClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function ListingsSearchForm({
  q,
  category,
  location,
  experience,
  hasImageMatch = false,
  categories,
  experiences,
}: {
  q: string;
  category: string;
  location: string;
  experience: string;
  hasImageMatch?: boolean;
  categories: ListingCategory[];
  experiences: ListingTag[];
}) {
  const hasFilters = q !== "" || category !== "" || location !== "" || experience !== "" || hasImageMatch;

  return (
    <div className="flex flex-col gap-2">
      {/* A GET form: submitting re-navigates to "/" with these fields as the
          full search params (any not listed here, like `page`, are dropped —
          a new search should start back on page 1). Works with JS disabled. */}
      <Form action="/" className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          name="q"
          placeholder="Search listings…"
          defaultValue={q}
          aria-label="Search listings"
          className={`${fieldClass} flex-1 sm:min-w-[10rem]`}
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

        <input
          type="text"
          name="location"
          placeholder="Location"
          defaultValue={location}
          aria-label="Filter by location"
          className={`${fieldClass} sm:w-40`}
        />

        <select
          name="experience"
          defaultValue={experience}
          aria-label="Filter by experience"
          className={fieldClass}
        >
          <option value="">All experiences</option>
          {experiences.map((tag) => (
            <option key={tag.id} value={tag.slug}>
              {tag.name}
            </option>
          ))}
        </select>

        <ImageSearchButton />

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
          className="w-fit text-sm text-brand-teal underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      )}
    </div>
  );
}
