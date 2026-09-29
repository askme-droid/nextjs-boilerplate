import Image from "next/image";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { pickListingImage } from "@/lib/listings/image";
import type { ListingWithRelations } from "@/lib/listings/queries";

export function ListingCard({ listing }: { listing: ListingWithRelations }) {
  const imageUrl = pickListingImage(listing);

  return (
    <article className="group overflow-hidden rounded-lg border border-zinc-200 transition-shadow hover:shadow-md hover:shadow-teal-900/5 dark:border-zinc-800">
      <Link href={`/listings/${listing.slug}`} className="flex flex-col">
        <div className="relative aspect-[4/3] w-full bg-zinc-100 dark:bg-zinc-900">
          {imageUrl ? (
            // Listing photos are arbitrary URLs (Supabase Storage or external),
            // so this is unoptimized: Next's Image Optimization API requires
            // allowlisting every source domain up front, which isn't possible
            // for admin-entered URLs.
            <Image
              src={imageUrl}
              alt={listing.title}
              fill
              unoptimized
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
              No image
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          {listing.categories && (
            <span className="w-fit rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
              {listing.categories.name}
            </span>
          )}

          <h2 className="font-semibold leading-snug transition-colors group-hover:text-teal-700 dark:group-hover:text-teal-400">
            {listing.title}
          </h2>

          {listing.location && (
            <p className="text-sm text-zinc-500 dark:text-zinc-500">
              {listing.location}
            </p>
          )}

          {listing.description && (
            <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
              {listing.description}
            </p>
          )}

          <p className="mt-auto pt-1 text-xs text-zinc-400 dark:text-zinc-600">
            Posted {formatRelativeTime(listing.created_at)}
          </p>
        </div>
      </Link>
    </article>
  );
}
