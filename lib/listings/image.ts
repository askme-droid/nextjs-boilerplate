type ImageLike = {
  listing_images: { url: string; is_featured: boolean; position: number }[];
  featured_image_url: string | null;
};

/**
 * The image to show for a listing: the image flagged `is_featured`, else the
 * lowest `position`, else the listing's own `featured_image_url`, else none
 * (the caller renders a placeholder). Structural typing so this works for
 * both the grid card and the detail page's fuller `ListingDetail` shape.
 */
export function pickListingImage(listing: ImageLike): string | null {
  const images = listing.listing_images;
  const featured = images.find((image) => image.is_featured);
  if (featured) return featured.url;

  const first = [...images].sort((a, b) => a.position - b.position)[0];
  if (first) return first.url;

  return listing.featured_image_url;
}
