import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingBySlug } from "@/lib/listings/queries";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) return { title: "Listing not found" };

  return {
    title: listing.title,
    description: listing.description?.slice(0, 160),
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ListingDetailPage({
  params,
}: {
  params: Params;
}) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) notFound();

  // Featured image first (matches the grid card's choice via
  // pickListingImage), then the rest in position order — every image
  // shown at full width, not a hero-plus-thumbnail-strip split.
  const orderedImages = [...listing.listing_images].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return a.position - b.position;
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <Link
        href="/"
        className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Back to listings
      </Link>

      {orderedImages.length > 0 ? (
        <div className="flex flex-col gap-3">
          {orderedImages.map((image, index) => (
            <div
              key={image.id}
              className="relative aspect-[16/9] w-full overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900"
            >
              {/* Listing photos are arbitrary URLs (Supabase Storage or
                  external admin-entered links); see the same note on
                  ListingCard. */}
              <Image
                src={image.url}
                alt={image.alt_text ?? listing.title}
                fill
                unoptimized
                priority={index === 0}
                sizes="(min-width: 1024px) 896px, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600">
          No image
        </div>
      )}

      <div className="flex flex-col gap-3">
        {listing.categories && (
          <Link
            href={`/?category=${listing.categories.slug}`}
            className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            {listing.categories.name}
          </Link>
        )}

        <h1 className="text-3xl font-semibold tracking-tight">{listing.title}</h1>

        {listing.location && (
          <p className="text-zinc-500 dark:text-zinc-400">{listing.location}</p>
        )}

        {listing.experience_tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {listing.experience_tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {listing.description && (
          <p className="whitespace-pre-line leading-relaxed text-zinc-700 dark:text-zinc-300">
            {listing.description}
          </p>
        )}

        {listing.expires_at && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Available until {formatDate(listing.expires_at)}
          </p>
        )}
      </div>
    </main>
  );
}
