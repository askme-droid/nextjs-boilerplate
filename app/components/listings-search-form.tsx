import Form from "next/form";
import Link from "next/link";
import type { ListingTag } from "@/lib/experience-tags/queries";
import type { ListingCategory } from "@/lib/listings/queries";

const fieldClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function ListingsSearchForm({
  q,
  category,
  location,
  experience,
  categories,
  experiences,
}: {
  q: string;
  category: string;
  location: string;
  experience: string;
  categories: ListingCategory[];
  experiences: ListingTag[];
}) {
  const hasFilters = q !== "" || category !== "" || location !== "" || experience !== "";

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

        <button
          type="button"
          disabled
          title="Search by image — coming soon"
          aria-label="Search by image — coming soon"
          className="flex items-center justify-center rounded-md border border-zinc-300 p-2.5 text-zinc-400 disabled:cursor-not-allowed dark:border-zinc-700 dark:text-zinc-600"
        >
          <CameraIcon />
        </button>

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
