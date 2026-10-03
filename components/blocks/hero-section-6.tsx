import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"

import { HeroSlider, type HeroSlide } from "@/app/components/hero-slider"
import { Button } from "@/components/ui/button"

const highlights = ["Flyer deals", "E-vouchers", "Local promotions"]

// Adapted from the 21st.dev "hero-section-6" block. Dropped from the
// original: its demo <header>/<nav> (the site already has one in the root
// layout, so keeping it would stack two navbars) and its email signup form
// (there's no newsletter backend to receive it). The app illustration is
// replaced by the homepage's real promo slider.
//
// Layout: like the original, on desktop (lg+) the visual sits *behind* the
// text, right-aligned, with a left-to-right fade so the copy stays readable
// where they overlap. Below lg the slider stacks under the text instead —
// banners with their own lettering behind centered copy would be unreadable
// at those widths.
export function HeroSection({ slides }: { slides: HeroSlide[] }) {
  return (
    <section className="relative overflow-hidden border-b border-dashed border-white/40 bg-(--hero-surface) text-white">
      {/* lg:static so the strip below positions against the whole section
          (and can bleed off the right edge of the screen), not this box. */}
      <div className="relative mx-auto max-w-6xl px-6 py-14 lg:static lg:py-20">
        <div className="relative z-10 mx-auto max-w-xl text-center lg:mx-0 lg:w-[45%] lg:text-left">
          <Link
            href="#search"
            className="mx-auto flex w-fit items-center gap-2 rounded-lg border border-border bg-background p-1 pr-3 text-foreground lg:mx-0"
          >
            <span className="rounded-md bg-muted px-2 py-1 text-xs">New</span>
            <span className="text-sm">Search listings by photo</span>
            <span className="block h-4 w-px bg-border" />
            <ArrowRight className="size-4" />
          </Link>

          <h1 className="mt-8 text-balance text-4xl font-bold md:text-5xl">
            Find great deals near you
          </h1>
          <p className="mx-auto mt-6 max-w-md text-lg lg:mx-0">
            Browse promos, flyers, and listings from local businesses.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button asChild size="lg">
              <Link href="#search">Start searching</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-foreground">
              <Link href="/faq">How it works</Link>
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm lg:justify-start">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Mobile/tablet: full-bleed row under the text (-mx-6 cancels the
            container padding). Desktop: pinned to the section's right edge so
            it runs off-screen like the original; the width is "from about a
            third of the way into the content column to the screen edge"
            (50% + 11rem: half the 72rem container is 36rem, minus its 1.5rem
            padding, minus ~34% of the content width). */}
        <div className="-mx-6 mt-12 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:mt-0 lg:flex lg:w-[calc(50%+11rem)] lg:items-center">
          <div className="relative w-full">
            <HeroSlider slides={slides} />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1 right-0 z-[1] hidden bg-linear-to-r from-(--hero-surface) from-12% to-transparent to-40% lg:block"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
