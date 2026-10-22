import type { HeroSlide } from "@/app/components/hero-slider";
import { JsonLd } from "@/lib/seo/json-ld";
import { SITE_NAME, SITE_URL } from "@/lib/seo/listing-seo";
import { FeaturedVideoSlider } from "@/app/components/featured-video-slider";
import { HeroSection } from "@/components/blocks/hero-section-6";
import { ListingCard } from "@/app/components/listing-card";
import { Reveal } from "@/app/components/reveal";
import type { CategoryChip } from "@/app/components/listings-search-form";
import { getCategoriesWithCounts } from "@/lib/categories/queries";
import { ListingsPagination } from "@/app/components/listings-pagination";
import { ListingsSearchForm } from "@/app/components/listings-search-form";
import { getActiveHeroSlides } from "@/lib/hero/queries";
import { parseShowFilter, type ShowFilter } from "@/lib/listings/badges";
import { FEATURED_SLOTS } from "@/lib/listings/constants";
import { getExperienceTags, type ListingTag } from "@/lib/experience-tags/queries";
import {
  getCategories,
  getFeaturedVideos,
  getListings,
  getListingsByIds,
  getShowCounts,
  type FeaturedVideoSlide,
  type ListingCategory,
  type ListingWithRelations,
} from "@/lib/listings/queries";

// Promo banners for the homepage hero slider — swap these out (or wire up
// an admin-managed source later) whenever the current promotions change.
// Fallback if the slides can't be loaded (the managed list lives at
// /admin/hero, table hero_slides — seeded with these same flyers).
const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    src: "/hero/overly-cheezy-pizza.jpg",
    alt: "Overly Cheezy Pizza — 1-for-1 regular pizzas at $25.90 and large pizzas at $33.90, plus 10% off your first online order",
  },
  {
    src: "/hero/mindspace-open-house.jpg",
    alt: "MindSpace after-school academy open house — enjoy over $2,460 in savings",
  },
  {
    src: "/hero/singgate-fr059-door-lock.jpg",
    alt: "Singgate FR059 digital door lock — 3D face and palm vein recognition, free installation, 2-year warranty",
  },
  {
    src: "/hero/lingoace-free-trial.jpg",
    alt: "LingoAce — free trial of online Chinese lessons for learners aged 3 to 15",
  },
  {
    src: "/hero/san-laundry-capsules.jpg",
    alt: "SAN 3-in-1 laundry detergent capsules — detergent, softener and anti-bacterial, on sale",
  },
  {
    src: "/hero/uems-healthcare-attendant.jpg",
    alt: "UEMS is hiring healthcare attendants in Seng Kang — salary up to $2,100",
  },
  {
    src: "/hero/kumon-registration.jpg",
    alt: "Kumon — 100% off registration fee (save $50) when you sign up by 15 September 2024",
  },
];

async function loadHeroSlides(): Promise<HeroSlide[]> {
  try {
    const rows = await getActiveHeroSlides();
    return rows.map((r) => ({ src: r.imageUrl, alt: r.altText, href: r.linkUrl }));
  } catch {
    return DEFAULT_HERO_SLIDES;
  }
}

function firstValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

type PageData = {
  q: string;
  category: string;
  location: string;
  experience: string;
  /** Badge filter ("Show" dropdown); "" = all listings. */
  show: string;
  isImageSearch: boolean;
  categories: ListingCategory[];
  /** Quick-filter pills: categories that have something to show. */
  chips: CategoryChip[];
  experiences: ListingTag[];
  listings: ListingWithRelations[];
  /** Homepage "Featured listings" video slider; empty (section hidden) on any
   *  search/filter/page > 1 so results aren't pushed below it. */
  featured: FeaturedVideoSlide[];
  page: number;
  totalPages: number;
  /** Listings matching the current search (all pages). */
  totalCount: number;
  /** How many listings each "Browse" pill would show; null if unavailable. */
  showCounts: Record<ShowFilter, number> | null;
};

/** Categories with at least one published listing, fullest first. */
async function getCategoryChips(): Promise<CategoryChip[]> {
  const rows = await getCategoriesWithCounts();
  return rows
    .filter((row) => row.publishedCount > 0)
    .sort((a, b) => b.publishedCount - a.publishedCount || a.name.localeCompare(b.name))
    .map((row) => ({ slug: row.slug, name: row.name, count: row.publishedCount }));
}

async function loadPageData(
  params: Record<string, string | string[] | undefined>,
): Promise<{ ok: true; data: PageData } | { ok: false; error: string }> {
  const requestedPage = Number.parseInt(firstValue(params.page), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  try {
    const [categories, experiences, chips, showCounts] = await Promise.all([
      getCategories(),
      getExperienceTags(),
      // Decorative extra, like the slider: if it fails the pills just go away.
      getCategoryChips().catch((): CategoryChip[] => []),
      getShowCounts().catch(() => null),
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
          show: "",
          isImageSearch: true,
          categories,
          chips,
          experiences,
          listings,
          featured: [],
          page: 1,
          totalPages: 1,
          totalCount: listings.length,
          showCounts,
        },
      };
    }

    const q = firstValue(params.q).trim();
    const requestedCategory = firstValue(params.category).trim();
    const location = firstValue(params.location).trim();
    const requestedExperience = firstValue(params.experience).trim();
    const show = parseShowFilter(firstValue(params.show).trim());

    // Validate both slugs against real rows rather than passing an arbitrary
    // URL value into an inner-join/subquery filter: an unknown slug would
    // otherwise read as "no listings" instead of the filter being ignored.
    const category = categories.some((cat) => cat.slug === requestedCategory)
      ? requestedCategory
      : "";
    const experience = experiences.some((tag) => tag.slug === requestedExperience)
      ? requestedExperience
      : "";

    const isDefaultView = !q && !category && !location && !experience && !show && page === 1;

    const [{ listings, page: currentPage, totalPages, totalCount }, featured] = await Promise.all([
      getListings({ q, category, location, experience, show, page }),
      // Decorative extra: a failure here must not take the whole page down
      // into the error state, so it degrades to "no featured section".
      isDefaultView ? getFeaturedVideos(FEATURED_SLOTS).catch(() => []) : Promise.resolve([]),
    ]);

    return {
      ok: true,
      data: {
        q,
        category,
        location,
        experience,
        show,
        isImageSearch: false,
        categories,
        chips,
        experiences,
        listings,
        featured,
        page: currentPage,
        totalPages,
        totalCount,
        showCounts,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error." };
  }
}

/** Site-wide identity for search engines and AI assistants: who runs FDSG
 *  and how to search it. Listing pages reference the WebSite by its @id. */
const siteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: "Flyer deals, e-vouchers and promotions from local Singapore businesses.",
      inLanguage: "en-SG",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      sameAs: ["https://www.facebook.com/FDSGDeals", "https://www.instagram.com/fdsgdeals/", "https://fd.sg"],
    },
  ],
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const [result, heroSlides] = await Promise.all([loadPageData(params), loadHeroSlides()]);
  const gridKey = [
    firstValue(params.q),
    firstValue(params.category),
    firstValue(params.location),
    firstValue(params.experience),
    firstValue(params.show),
    firstValue(params.imageMatch),
    firstValue(params.page),
  ].join("|");

  return (
    <main className="flex flex-1 flex-col">
      <JsonLd data={siteJsonLd} />
      <HeroSection slides={heroSlides} />

      {result.ok && <FeaturedVideoSlider slides={result.data.featured} />}

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
              // The white search card itself is drawn by ListingsSearchForm, so
              // the category pills can sit just outside it.
              className="scroll-mt-4"
            >
              <ListingsSearchForm
                q={result.data.q}
                category={result.data.category}
                location={result.data.location}
                experience={result.data.experience}
                show={result.data.show}
                hasImageMatch={result.data.isImageSearch}
                categories={result.data.categories}
                chips={result.data.chips}
                totalCount={result.data.totalCount}
                showCounts={result.data.showCounts}
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
                      result.data.experience ||
                      result.data.show
                    ? "No listings match your search."
                    : "No listings have been published yet."}
              </p>
            ) : (
              // Keyed by the search itself, so a new search or page replays the
              // reveal for the whole grid instead of silently swapping cards.
              <div
                key={gridKey}
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
              >
                {result.data.listings.map((listing, index) => (
                  // Staggered by column, so a row arrives left to right.
                  <Reveal key={listing.id} delay={(index % 4) * 80} className="h-full">
                    <ListingCard listing={listing} />
                  </Reveal>
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
                show={result.data.show}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
