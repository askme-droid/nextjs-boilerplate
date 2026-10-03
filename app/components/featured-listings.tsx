import {
  ContainerAnimated,
  ContainerScroll,
  ContainerStagger,
  ContainerSticky,
  GalleryCol,
  GalleryContainer,
} from "@/components/blocks/animated-gallery";
import type { ListingWithRelations } from "@/lib/listings/queries";
import { FeaturedTile } from "./featured-tile";

const COLUMNS = 3;

// Gentle per-column parallax (percent of the column's height). Centre column
// moves the opposite way so the three don't travel in lockstep.
const Y_RANGES: string[][] = [
  ["-4%", "0%"],
  ["4%", "0%"],
  ["-4%", "0%"],
];

/**
 * Homepage "Featured listings": up to 6 tiles in a 3×2 grid.
 *
 * Two renderings of the same tiles, switched by CSS (the hidden one is
 * display:none, so its lazy images never load):
 *  - lg+ : the scroll-driven 3D gallery (components/blocks/animated-gallery) —
 *          tilts flat and drifts as you scroll through a pinned section.
 *  - below lg, or when the visitor prefers reduced motion: a plain grid
 *    (2 columns × 3 rows on phones/tablets, 3 × 2 on wider reduced-motion
 *    screens). Scroll-linked tilting is unreadable at phone width and
 *    exactly what reduced-motion settings ask to avoid.
 */
export function FeaturedListings({ listings }: { listings: ListingWithRelations[] }) {
  if (listings.length === 0) return null;

  // Reading order is row by row (0 1 2 / 3 4 5), so column c takes c, c+3, …
  const columns = Array.from({ length: COLUMNS }, (_, c) =>
    listings.filter((_, i) => i % COLUMNS === c),
  );

  return (
    <section aria-labelledby="featured-heading">
      <ContainerStagger className="mx-auto max-w-2xl px-6 pb-8 pt-14 text-center">
        <ContainerAnimated>
          <h2 id="featured-heading" className="text-3xl font-bold md:text-4xl">
            Featured <span className="text-brand-teal">listings</span>
          </h2>
        </ContainerAnimated>
        <ContainerAnimated className="mt-3">
          <p className="text-muted-foreground">
            Promos and deals from local businesses, worth a look.
          </p>
        </ContainerAnimated>
      </ContainerStagger>

      <div className="hidden lg:block motion-reduce:lg:hidden">
        <ContainerScroll className="h-[220vh]">
          <ContainerSticky className="flex h-svh items-center justify-center">
            {/* Width is capped so two rows of 4:5 tiles always fit the
                viewport height (2 × 1.25 × tile width + gap, minus the header
                room), otherwise the second row is cropped on short screens. */}
            <GalleryContainer className="mx-auto size-auto w-full max-w-[min(72rem,calc(1.2*(100svh-7rem)+1rem))] gap-4 px-6">
              {columns.map((items, c) => (
                <GalleryCol key={c} yRange={Y_RANGES[c]} className="gap-4">
                  {items.map((listing) => (
                    <FeaturedTile key={listing.id} listing={listing} />
                  ))}
                </GalleryCol>
              ))}
            </GalleryContainer>
          </ContainerSticky>
        </ContainerScroll>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 pb-4 lg:hidden lg:grid-cols-3 motion-reduce:lg:grid">
        {listings.map((listing) => (
          <FeaturedTile key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
