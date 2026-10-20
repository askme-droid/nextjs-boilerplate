import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { isExpired } from "@/lib/listings/expiry-dates";
import { incrementViewsById, shouldCountView } from "@/lib/listings/views";
import { pickListingImage } from "@/lib/listings/image";
import { getListingBySlug, type ListingDetail } from "@/lib/listings/queries";
import { compact, JsonLd } from "@/lib/seo/json-ld";
import { ListingView } from "./listing-view";
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
  return (
    <>
      <JsonLd data={listingJsonLd(listing)} />
      <ListingView listing={listing} />
    </>
  );
}
