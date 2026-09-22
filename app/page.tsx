import { ListingCard } from "@/app/components/listing-card";
import { ListingsPagination } from "@/app/components/listings-pagination";
import { ListingsSearchForm } from "@/app/components/listings-search-form";
import {
  getCategories,
  getListings,
  type ListingCategory,
  type ListingWithRelations,
} from "@/lib/listings/queries";

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

type PageData = {
  q: string;
  category: string;
  categories: ListingCategory[];
  listings: ListingWithRelations[];
  page: number;
  totalPages: number;
};

async function loadPageData(
  params: Record<string, string | string[] | undefined>,
): Promise<{ ok: true; data: PageData } | { ok: false; error: string }> {
  const q = firstValue(params.q).trim();
  const requestedCategory = firstValue(params.category).trim();
  const requestedPage = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  try {
    const categories = await getCategories();

    // Validate the category slug against real categories rather than passing
    // an arbitrary URL value into an inner-join filter: an unknown slug would
    // otherwise read as "no listings" instead of the filter being ignored.
    const category = categories.some((cat) => cat.slug === requestedCategory)
      ? requestedCategory
      : "";

    const { listings, page: currentPage, totalPages } = await getListings({
      q,
      category,
      page,
    });

    return {
      ok: true,
      data: { q, category, categories, listings, page: currentPage, totalPages },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error." };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const result = await loadPageData(await searchParams);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Listings</h1>

      {!result.ok ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-lg text-red-600 dark:text-red-400">
            Could not load listings.
          </p>
          <p className="max-w-md font-mono text-sm text-zinc-600 dark:text-zinc-400">
            {result.error}
          </p>
        </div>
      ) : (
        <>
          <ListingsSearchForm
            q={result.data.q}
            category={result.data.category}
            categories={result.data.categories}
          />

          {result.data.listings.length === 0 ? (
            <p className="py-16 text-center text-zinc-500 dark:text-zinc-400">
              {result.data.q || result.data.category
                ? "No listings match your search."
                : "No listings have been published yet."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {result.data.listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}

          <ListingsPagination
            page={result.data.page}
            totalPages={result.data.totalPages}
            q={result.data.q}
            category={result.data.category}
          />
        </>
      )}
    </main>
  );
}
