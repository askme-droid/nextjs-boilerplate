import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { socialLabel } from "@/lib/listings/contact-fields";
import { pickListingImage } from "@/lib/listings/image";
import { getListingBySlug, type ListingDetail } from "@/lib/listings/queries";
import { compact, JsonLd } from "@/lib/seo/json-ld";
import { SITE_NAME, SITE_URL, effectiveDescription, effectiveTitle } from "@/lib/seo/listing-seo";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) return { title: "Listing not found" };

  // Same rules the admin SEO panel previews (lib/seo/listing-seo.ts): the
  // custom SEO title is used as the whole <title> (absolute, so the layout's
  // "| FDSG" template isn't added twice); otherwise "<title> | FDSG".
  const title = effectiveTitle(listing.seo_title, listing.title);
  const description = effectiveDescription(listing.seo_description, listing.description) || undefined;
  const url = `/listings/${listing.slug}`;
  const image = pickListingImage(listing);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url,
      title,
      description,
      ...(image ? { images: [{ url: image, alt: listing.title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

/**
 * schema.org structured data for a listing page: the business behind it
 * (LocalBusiness, with the deal as an Offer), the page itself, and a
 * breadcrumb trail. Helps Google rich results and AI assistants understand
 * who the listing is for and what's on offer.
 */
function listingJsonLd(listing: ListingDetail) {
  const pageUrl = `${SITE_URL}/listings/${listing.slug}`;
  const description = effectiveDescription(listing.seo_description, listing.description);
  const images = [...listing.listing_images]
    .sort((a, b) => (a.is_featured !== b.is_featured ? (a.is_featured ? -1 : 1) : a.position - b.position))
    .map((img) => img.url);
  if (images.length === 0 && listing.featured_image_url) images.push(listing.featured_image_url);

  const business = compact({
    "@type": "LocalBusiness",
    "@id": `${pageUrl}#business`,
    name: listing.company_name || listing.title,
    description,
    url: pageUrl,
    image: images,
    address: listing.location
      ? { "@type": "PostalAddress", addressLocality: listing.location, addressCountry: "SG" }
      : undefined,
    sameAs: listing.social_links,
    identifier: listing.company_uen
      ? { "@type": "PropertyValue", propertyID: "UEN", value: listing.company_uen }
      : undefined,
    makesOffer: compact({
      "@type": "Offer",
      name: listing.title,
      description,
      url: listing.cta_url || pageUrl,
      validThrough: listing.expires_at || undefined,
      category: listing.categories?.name,
    }),
  });

  const breadcrumb = {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      ...(listing.categories
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: listing.categories.name,
              item: `${SITE_URL}/?category=${encodeURIComponent(listing.categories.slug)}`,
            },
          ]
        : []),
      { "@type": "ListItem", position: listing.categories ? 3 : 2, name: listing.title, item: pageUrl },
    ],
  };

  const page = compact({
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    name: effectiveTitle(listing.seo_title, listing.title),
    description,
    inLanguage: "en-SG",
    isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL },
    about: { "@id": `${pageUrl}#business` },
    breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
    primaryImageOfPage: images[0],
    dateModified: listing.updated_at,
  });

  return { "@context": "https://schema.org", "@graph": [page, business, breadcrumb] };
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

  // Syndicated listing (e.g. from fd.sg) — the card already links straight
  // there, but this covers anyone hitting the local URL directly (a bookmark,
  // a shared link, a search engine result).
  if (listing.external_url) redirect(listing.external_url);

  // The client asked for this listing to go to their own landing page. A
  // temporary (307) redirect, not permanent: staff can clear it at any time
  // and the listing page should come straight back.
  if (listing.redirect_url) redirect(listing.redirect_url);

  // Featured image first (matches the grid card's choice via
  // pickListingImage), then the rest in position order — every image
  // shown at full width, not a hero-plus-thumbnail-strip split.
  const orderedImages = [...listing.listing_images].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return a.position - b.position;
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      <JsonLd data={listingJsonLd(listing)} />
      <Link
        href="/"
        className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
      >
        ← Back to listings
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{listing.title}</h1>

        {listing.location && (
          <p className="text-zinc-500 dark:text-zinc-400">{listing.location}</p>
        )}
      </div>

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

        {listing.cta_url && (
          <a
            href={listing.cta_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="w-fit rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90"
          >
            {listing.cta_label || "Learn more"}
          </a>
        )}

        {(listing.company_name ||
          listing.company_uen ||
          listing.social_links.length > 0) && (
          <section className="mt-2 flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            {listing.company_name && (
              <p className="font-medium">{listing.company_name}</p>
            )}
            {listing.company_uen && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                UEN <span className="font-mono">{listing.company_uen}</span>
              </p>
            )}
            {listing.social_links.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {listing.social_links.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-block rounded-full border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {socialLabel(url)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
