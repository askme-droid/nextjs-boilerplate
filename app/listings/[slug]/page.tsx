import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { isPopularListing, isTrendingListing } from "@/lib/listings/badges";
import { isExpired } from "@/lib/listings/expiry-dates";
import { formatViews, incrementViewsById, shouldCountView } from "@/lib/listings/views";
import { socialLabel } from "@/lib/listings/contact-fields";
import { pickListingImage } from "@/lib/listings/image";
import { getListingBySlug, type ListingDetail } from "@/lib/listings/queries";
import { compact, JsonLd } from "@/lib/seo/json-ld";
import {
  SITE_NAME,
  SITE_URL,
  effectiveDescription,
  effectiveSocialDescription,
  effectiveSocialTitle,
  effectiveTitle,
} from "@/lib/seo/listing-seo";

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
  // Social shares (Facebook, WhatsApp, LinkedIn, X) can have their own
  // title/description/image, set in the SEO panel's "Social media share"
  // section; otherwise they follow the SEO title/description and featured photo.
  const socialTitle = effectiveSocialTitle(listing.og_title, listing.seo_title, listing.title);
  const socialDescription =
    effectiveSocialDescription(listing.og_description, listing.seo_description, listing.description) || undefined;
  const image = listing.og_image_url || pickListingImage(listing);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // An expired offer stays reachable (old links, shares) but shouldn't
    // be shown in search results any more.
    ...(isExpired(listing.expires_at) ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      url,
      title: socialTitle,
      description: socialDescription,
      ...(image ? { images: [{ url: image, alt: listing.title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: socialTitle,
      description: socialDescription,
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

/** Shown when the listing's UEN was checked against ACRA's register and the
 *  business is live (see lib/business/verify-listing.ts). */
function VerifiedBusinessBadge() {
  return (
    <span
      title="This business's UEN was checked against ACRA's register of businesses and companies."
      className="inline-flex items-center gap-1 rounded-full bg-sky-700 px-2.5 py-0.5 text-xs font-semibold text-white"
    >
      <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
          clipRule="evenodd"
        />
      </svg>
      Verified business
    </span>
  );
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

  // Normally proxy.ts already redirected; this covers anything that reaches
  // the page anyway. The client's own landing page (redirect_url, set by
  // staff — also on synced listings) comes first, then a synced listing's
  // fd.sg source. Temporary (307): clearing the field brings the page back.
  if (listing.redirect_url) redirect(listing.redirect_url);
  if (listing.external_url) redirect(listing.external_url);

  // Count the view once the page has been sent (lib/listings/views.ts).
  if (shouldCountView(await headers())) {
    const id = listing.id;
    after(() => incrementViewsById(id));
  }
  const expired = isExpired(listing.expires_at);

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

      {expired && listing.expires_at && (
        <p
          role="status"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        >
          This offer ended on {formatDate(listing.expires_at)}.{" "}
          <Link href="/" className="font-medium underline underline-offset-4">
            See current deals
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{listing.title}</h1>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-500 dark:text-zinc-400">
          {listing.location && <span>{listing.location}</span>}
          {/* The count shown is before this visit (it's added after the page is sent). */}
          <span>{formatViews(listing.view_count)}</span>
          {isTrendingListing(listing.view_count) && (
            <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-semibold text-white">Trending</span>
          )}
          {isPopularListing(listing.view_count) && (
            <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-xs font-semibold text-white">Popular</span>
          )}
          {listing.homepage_featured && (
            <span className="rounded-full bg-brand-orange px-2.5 py-0.5 text-xs font-semibold text-zinc-950">Featured</span>
          )}
          {listing.verified_business && <VerifiedBusinessBadge />}
        </p>
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
            {listing.verified_business && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <VerifiedBusinessBadge />
                <span>
                  Registered with ACRA
                  {listing.verified_business_name &&
                  listing.verified_business_name.toUpperCase() !== (listing.company_name ?? "").toUpperCase()
                    ? ` as ${listing.verified_business_name}`
                    : ""}
                </span>
              </p>
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

        {listing.expires_at && !expired && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Available until {formatDate(listing.expires_at)}
          </p>
        )}
      </div>
    </main>
  );
}
