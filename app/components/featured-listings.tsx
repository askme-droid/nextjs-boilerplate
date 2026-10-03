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

// The pinned box is a full viewport tall but the (4:3) grid inside it is much
// shorter, so the grid floats in the middle with dead space above and below.
//
// Grid width is capped at 72rem and, on short screens, at
// 2 × (100svh − 8rem) + 5rem (see the GalleryContainer max-width below);
// two rows of 4:3 tiles across three columns make its height ≈ 0.5 × width
// − 1.5rem. So the blank band above the grid (B) and below it are each half
// of (viewport height − grid height).
const GALLERY_WIDTH = "min(72rem, 100vw, 2 * (100svh - 8rem) + 5rem)";
const GALLERY_SLACK = `max(0px, 100svh - 0.5 * ${GALLERY_WIDTH} + 1.5rem)`;

// Gap, when the grid is level, between the heading's text and the first row
// of tiles. The runway is pulled up by (B + heading padding − this) so the
// top edge of the grid lands exactly this far below the subtitle; the grid
// hinges on its top edge while it tilts (originY below), so the gap holds
// during the scroll-in too instead of growing as the tilt sinks the top edge.
const GAP_BELOW_HEADING = "50px";
const HEADING_PADDING_BOTTOM = "2rem"; // the pb-8 on the heading block

// Gentle per-column parallax (percent of the column's height), applied only
// once the grid has levelled out (the component's column drift runs over the
// second half of the scroll). Every column STARTS at 0 so the three tops line
// up and the gap under the heading is one clean number; the centre column
// then drifts the opposite way from the sides so they don't travel in lockstep.
const Y_RANGES: string[][] = [
  ["0%", "-1.5%"],
  ["0%", "1.5%"],
  ["0%", "-1.5%"],
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

      <div
        className="hidden lg:block motion-reduce:lg:hidden"
        style={{
          marginTop: `calc(-1 * max(0px, 0.5 * ${GALLERY_SLACK} + ${HEADING_PADDING_BOTTOM} - ${GAP_BELOW_HEADING}))`,
          marginBottom: `calc(-0.3 * ${GALLERY_SLACK})`,
        }}
      >
        <ContainerScroll className="h-[220vh]">
          <ContainerSticky className="flex h-svh items-center justify-center">
            {/* Width is capped so two rows of 4:3 tiles always fit the
                viewport height (2 × 0.75 × tile width + gap, with ~8rem of
                breathing room, plus the 5rem of padding/gaps across three
                columns), otherwise the second row is cropped on short
                screens. On normal-height screens the 72rem cap wins. */}
            <GalleryContainer
              style={{ originY: 0 }}
              className="mx-auto size-auto w-full max-w-[min(72rem,calc(2*(100svh-8rem)+5rem))] gap-4 px-6"
            >
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
