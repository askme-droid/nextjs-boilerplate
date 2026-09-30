import Image from "next/image";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { pickListingImage } from "@/lib/listings/image";
import type { ListingWithRelations } from "@/lib/listings/queries";

export function ListingCard({ listing }: { listing: ListingWithRelations }) {
  const imageUrl = pickListingImage(listing);

  const body = (
    <>
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
          <span className="w-fit rounded-full bg-brand-teal/10 px-2.5 py-0.5 text-xs font-medium text-brand-teal dark:bg-brand-teal/20">
            {listing.categories.name}
          </span>
        )}

        <h2 className="font-semibold leading-snug text-brand-gray transition-colors group-hover:text-brand-teal dark:text-zinc-100">
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
    </>
  );

  return (
    <article className="group overflow-hidden rounded-lg border border-zinc-200 transition-shadow hover:shadow-md hover:shadow-brand-teal/10 dark:border-zinc-800">
      {listing.external_url ? (
        // Syndicated from elsewhere (e.g. fd.sg) — sends the visitor to the
        // source instead of a local copy, since that's where the content
        // actually lives.
        <a
          href={listing.external_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex flex-col"
        >
          {body}
        </a>
      ) : (
        <Link href={`/listings/${listing.slug}`} className="flex flex-col">
          {body}
        </Link>
      )}
    </article>
  );
}
