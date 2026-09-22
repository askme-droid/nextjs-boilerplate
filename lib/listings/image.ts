import type { ListingWithRelations } from "./queries";

/**
 * The image to show for a listing card: the image flagged `is_featured`,
 * else the lowest `position`, else the listing's own `featured_image_url`,
 * else none (the caller renders a placeholder).
 */
export function pickListingImage(listing: ListingWithRelations): string | null {
  const images = listing.listing_images;
  const featured = images.find((image) => image.is_featured);
  if (featured) return featured.url;

  const first = [...images].sort((a, b) => a.position - b.position)[0];
  if (first) return first.url;

  return listing.featured_image_url;
}
