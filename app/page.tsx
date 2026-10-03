import type { HeroSlide } from "@/app/components/hero-slider";
import { HeroSection } from "@/components/blocks/hero-section-6";
import { ListingCard } from "@/app/components/listing-card";
import { ListingsPagination } from "@/app/components/listings-pagination";
import { ListingsSearchForm } from "@/app/components/listings-search-form";
import { getExperienceTags, type ListingTag } from "@/lib/experience-tags/queries";
import {
  getCategories,
  getListings,
  getListingsByIds,
  type ListingCategory,
  type ListingWithRelations,
} from "@/lib/listings/queries";

// Promo banners for the homepage hero slider — swap these out (or wire up
// an admin-managed source later) whenever the current promotions change.
const HERO_SLIDES: HeroSlide[] = [
  { src: "/hero/slide-1.jpg", alt: "VisViva Hair Studio opening promotion — 50% off" },
  { src: "/hero/slide-2.jpg", alt: "Megachure — smart, innovative & sustainability" },
  { src: "/hero/slide-3.jpg", alt: "National Day promotions — free express manicure and $5 off gel services" },
];

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

type PageData = {
  q: string;
  category: string;
  location: string;
  experience: string;
  isImageSearch: boolean;
  categories: ListingCategory[];
  experiences: ListingTag[];
  listings: ListingWithRelations[];
  page: number;
  totalPages: number;
};

async function loadPageData(
  params: Record<string, string | string[] | undefined>,
): Promise<{ ok: true; data: PageData } | { ok: false; error: string }> {
  const requestedPage = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  try {
    const [categories, experiences] = await Promise.all([
      getCategories(),
      getExperienceTags(),
    ]);

    // "Search by image" (see app/components/image-search-button.tsx) is its
    // own mode, not another filter to combine: the ranked id list it hands
    // back only makes sense shown on its own, in that order, so it overrides
    // q/category/location/experience/page rather than narrowing them further.
    const imageMatch = firstValue(params.imageMatch).trim();
    if (imageMatch) {
      const ids = imageMatch.split(",").filter(Boolean);
      const listings = await getListingsByIds(ids);
      return {
        ok: true,
        data: {
          q: "",
          category: "",
          location: "",
          experience: "",
          isImageSearch: true,
          categories,
          experiences,
          listings,
          page: 1,
          totalPages: 1,
        },
      };
    }

    const q = firstValue(params.q).trim();
    const requestedCategory = firstValue(params.category).trim();
    const location = firstValue(params.location).trim();
    const requestedExperience = firstValue(params.experience).trim();

    // Validate both slugs against real rows rather than passing an arbitrary
    // URL value into an inner-join/subquery filter: an unknown slug would
    // otherwise read as "no listings" instead of the filter being ignored.
    const category = categories.some((cat) => cat.slug === requestedCategory)
      ? requestedCategory
      : "";
    const experience = experiences.some((tag) => tag.slug === requestedExperience)
      ? requestedExperience
      : "";

    const { listings, page: currentPage, totalPages } = await getListings({
      q,
      category,
      location,
      experience,
      page,
    });

    return {
      ok: true,
      data: {
        q,
        category,
        location,
        experience,
        isImageSearch: false,
        categories,
        experiences,
        listings,
        page: currentPage,
        totalPages,
      },
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
    <main className="flex flex-1 flex-col">
      <HeroSection slides={HERO_SLIDES} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 pb-6 pt-8">
        {!result.ok ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-lg text-red-600 dark:text-red-400">
              Could not load listings.
            </p>
            <p className="max-w-md font-mono text-sm text-zinc-600 dark:text-zinc-400">
              {result.error}
            </p>
          </div>
        ) : (
          <>
            <div
              id="search"
              className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
            >
              <ListingsSearchForm
                q={result.data.q}
                category={result.data.category}
                location={result.data.location}
                experience={result.data.experience}
                hasImageMatch={result.data.isImageSearch}
                categories={result.data.categories}
                experiences={result.data.experiences}
              />
            </div>

            {result.data.isImageSearch && result.data.listings.length > 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Showing listings with visually similar images, best match first.
              </p>
            )}

            {result.data.listings.length === 0 ? (
              <p className="py-16 text-center text-zinc-500 dark:text-zinc-400">
                {result.data.isImageSearch
                  ? "No visually similar listings found."
                  : result.data.q ||
                      result.data.category ||
                      result.data.location ||
                      result.data.experience
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

            {!result.data.isImageSearch && (
              <ListingsPagination
                page={result.data.page}
                totalPages={result.data.totalPages}
                q={result.data.q}
                category={result.data.category}
                location={result.data.location}
                experience={result.data.experience}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
