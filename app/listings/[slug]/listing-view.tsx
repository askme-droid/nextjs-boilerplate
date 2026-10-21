import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { isPopularListing, isTrendingListing } from "@/lib/listings/badges";
import { isExpired } from "@/lib/listings/expiry-dates";
import { formatViews } from "@/lib/listings/format-views";
import { socialLabel } from "@/lib/listings/contact-fields";
import type { ListingDetail } from "@/lib/listings/queries";

/**
 * The body of a listing page. Shared by the public page
 * (app/listings/[slug]/page.tsx) and the staff preview
 * (app/admin/listings/[id]/preview), so a preview shows exactly what
 * visitors will see.
 */
export function ListingView({ listing, banner }: { listing: ListingDetail; banner?: ReactNode }) {
  const expired = isExpired(listing.expires_at);
  // Shown as its own box once there's anything beyond the plain end date.
  const hasOfferDetails = !!(listing.offer_price || listing.offer_discount || listing.redemption_info);

  // Featured image first (matches the grid card's choice via
  // pickListingImage), then the rest in position order — every image
  // shown at full width, not a hero-plus-thumbnail-strip split.
  const orderedImages = [...listing.listing_images].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return a.position - b.position;
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-6">
      {banner}
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

      {/* The short factual summary answer engines quote (AEO). */}
      {listing.quick_answer && (
        <p
          id="quick-answer"
          className="rounded-lg border-l-4 border-brand-teal bg-zinc-50 px-4 py-3 text-lg leading-relaxed text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {listing.quick_answer}
        </p>
      )}

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
                // First photo is above the fold: load it straight away. The
                // rest load lazily as the visitor scrolls down to them.
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : "auto"}
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

        {hasOfferDetails && (
          <section aria-labelledby="offer-details" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 id="offer-details" className="mb-2 text-base font-semibold">
              Offer details
            </h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              {listing.offer_discount && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">Offer</dt>
                  <dd className="font-medium">{listing.offer_discount}</dd>
                </>
              )}
              {listing.offer_price && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">Price</dt>
                  <dd className="font-medium">S${formatPrice(listing.offer_price)}</dd>
                </>
              )}
              {listing.expires_at && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">Valid until</dt>
                  <dd className="font-medium">{formatDate(listing.expires_at)}</dd>
                </>
              )}
              {listing.location && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">Where</dt>
                  <dd className="font-medium">{listing.location}</dd>
                </>
              )}
              {listing.redemption_info && (
                <>
                  <dt className="text-zinc-500 dark:text-zinc-400">How to redeem</dt>
                  <dd className="whitespace-pre-line">{listing.redemption_info}</dd>
                </>
              )}
            </dl>
          </section>
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

        {listing.expires_at && !expired && !hasOfferDetails && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Available until {formatDate(listing.expires_at)}
          </p>
        )}

        {listing.faqs.length > 0 && (
          <section aria-labelledby="faq" className="mt-2 flex flex-col gap-2">
            <h2 id="faq" className="text-lg font-semibold">
              Questions &amp; answers
            </h2>
            {listing.faqs.map((faq, i) => (
              <details
                key={i}
                open={i === 0}
                className="group rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <summary className="cursor-pointer font-medium marker:text-zinc-400">{faq.q}</summary>
                <p className="mt-2 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{faq.a}</p>
              </details>
            ))}
          </section>
        )}
      </div>
    </main>
  );
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

function formatPrice(value: string) {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

