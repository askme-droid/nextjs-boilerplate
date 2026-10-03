import Image from "next/image";
import Link from "next/link";
import { pickListingImage } from "@/lib/listings/image";
import type { ListingWithRelations } from "@/lib/listings/queries";

/**
 * Image-led tile for the homepage "Featured listings" gallery. Same
 * destination rules as ListingCard: syndicated listings (external_url) open
 * at their source, everything else at the local detail page.
 */
export function FeaturedTile({ listing }: { listing: ListingWithRelations }) {
  const imageUrl = pickListingImage(listing);

  const body = (
    <>
      {imageUrl && (
        // Arbitrary admin/external image URLs, so unoptimized — same reason
        // as ListingCard.
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 24rem, 50vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 via-black/45 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1.5 p-2.5 text-white sm:p-4">
        {/* Dropped on phones: a 4:3 tile is only ~115px tall there, and badge
            + title together would cover most of the photo. */}
        {listing.categories && (
          <span className="hidden rounded-full bg-brand-teal px-2.5 py-0.5 text-xs font-medium sm:inline-block">
            {listing.categories.name}
          </span>
        )}
        <h3 className="line-clamp-2 text-xs font-semibold leading-snug sm:text-base">
          {listing.title}
        </h3>
      </div>
    </>
  );

  const className =
    "group relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-zinc-100 shadow-md dark:bg-zinc-900";

  return listing.external_url ? (
    <a
      href={listing.external_url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
    >
      {body}
    </a>
  ) : (
    <Link href={`/listings/${listing.slug}`} className={className}>
      {body}
    </Link>
  );
}
