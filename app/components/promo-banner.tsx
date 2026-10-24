import Link from "next/link";

/**
 * Wide promo banner on the homepage, between the hero and "Featured listings".
 * The artwork's "Find Great Deals" button is part of the picture, so the whole
 * banner links to the search box.
 */
export function PromoBanner() {
  return (
    <section aria-label="Discover Singapore" className="mx-auto w-full max-w-6xl px-6 pt-10">
      <Link
        href="#search"
        className="group block overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-teal/50"
      >
        <picture>
          <source media="(max-width: 640px)" srcSet="/banners/discover-singapore-sm.webp" />
          <img
            src="/banners/discover-singapore.webp"
            width={2126}
            height={565}
            loading="lazy"
            decoding="async"
            alt="Discover Singapore, one listing at a time — businesses, events and experiences near you. Support local, explore more, experience Singapore. Find great deals."
            className="block h-auto w-full"
          />
        </picture>
      </Link>
    </section>
  );
}
