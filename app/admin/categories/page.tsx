import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-staff";
import {
  getCategoriesWithCounts,
  getUncategorizedListingCount,
} from "@/lib/categories/queries";
import { DeleteCategoryButton } from "./delete-category-button";

// requireAdmin(), not just requireStaff() from the layout: categories are
// admin-only (unlike listings, which also allow editor) — see actions.ts.
export default async function AdminCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, deleted, error } = await searchParams;
  const [categories, uncategorized] = await Promise.all([
    getCategoriesWithCounts(),
    getUncategorizedListingCount(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        <Link
          href="/admin/categories/new"
          className="whitespace-nowrap rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          New category
        </Link>
      </div>

      {saved && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Saved.
        </p>
      )}
      {deleted && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Category deleted.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      {categories.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No categories yet.{" "}
          <Link href="/admin/categories/new" className="underline underline-offset-4">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/categories/${category.id}/edit`}
                  className="font-medium hover:underline"
                >
                  {category.name}
                </Link>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                  /{category.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className="whitespace-nowrap rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  title={
                    category.publishedCount === category.listingCount
                      ? undefined
                      : `${category.publishedCount} published`
                  }
                >
                  {category.listingCount} {category.listingCount === 1 ? "listing" : "listings"}
                  {category.publishedCount !== category.listingCount &&
                    ` · ${category.publishedCount} published`}
                </span>
                <Link
                  href={`/admin/categories/${category.id}/edit`}
                  className="text-sm font-medium hover:underline"
                >
                  Edit
                </Link>
                <DeleteCategoryButton
                  id={category.id}
                  name={category.name}
                  listingCount={category.listingCount}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {uncategorized === 0
          ? "Every listing has a category."
          : `${uncategorized} ${uncategorized === 1 ? "listing has" : "listings have"} no category.`}
      </p>
    </div>
  );
}
