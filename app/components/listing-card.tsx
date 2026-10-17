import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { endsSoonLabel, isNewListing } from "@/lib/listings/badges";
import { pickListingImage } from "@/lib/listings/image";
import type { ListingWithRelations } from "@/lib/listings/queries";

export function ListingCard({ listing }: { listing: ListingWithRelations }) {
  const outboundUrl = listing.external_url ?? listing.redirect_url;
  const imageUrl = pickListingImage(listing);
  const isNew = isNewListing(listing.created_at);
  const endsSoon = endsSoonLabel(listing.expires_at);

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
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-600">
            No image
          </div>
        )}

        {(isNew || endsSoon) && (
          <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-2">
            {isNew ? (
              <span className="rounded-full bg-brand-teal px-2.5 py-0.5 text-xs font-semibold text-zinc-950 shadow-sm">
                New
              </span>
            ) : (
              <span />
            )}
            {endsSoon && (
              <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-zinc-950 shadow-sm">
                {endsSoon}
              </span>
            )}
          </div>
        )}

        {/* Slides up on hover or keyboard focus. Decorative: the whole card is
            already one link. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 items-center justify-center gap-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-3 pt-12 text-sm font-semibold text-white opacity-0 transition duration-300 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none"
        >
          View deal
          {outboundUrl ? <ArrowUpRight className="size-4" /> : <ArrowRight className="size-4" />}
        </span>
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
    <article
      className="group h-full overflow-hidden rounded-lg border border-zinc-200 bg-white transition-[transform,box-shadow,border-color] duration-300 hover:border-brand-teal/40 hover:shadow-lg hover:shadow-brand-teal/15 motion-safe:hover:-translate-y-1 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {outboundUrl ? (
        // Syndicated from elsewhere (e.g. fd.sg), or a client asked for their
        // listing to go to their own landing page — sends the visitor there
        // instead of a local copy.
        <a
          href={outboundUrl}
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
