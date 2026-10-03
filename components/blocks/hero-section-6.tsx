import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"

import { HeroSlider, type HeroSlide } from "@/app/components/hero-slider"
import { Button } from "@/components/ui/button"

const highlights = ["Flyer deals", "E-vouchers", "Local promotions"]

// Adapted from the 21st.dev "hero-section-6" block. Dropped from the
// original: its demo <header>/<nav> (the site already has one in the root
// layout, so keeping it would stack two navbars) and its email signup form
// (there's no newsletter backend to receive it). The app illustration on the
// right is replaced by the homepage's real promo slider.
export function HeroSection({ slides }: { slides: HeroSlide[] }) {
  return (
    <section className="overflow-hidden border-b border-dashed border-border bg-brand-teal/10">
      <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <div className="lg:flex lg:items-center lg:gap-12">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:w-1/2 lg:text-left">
            <Link
              href="#search"
              className="mx-auto flex w-fit items-center gap-2 rounded-lg border border-border bg-background p-1 pr-3 lg:mx-0"
            >
              <span className="rounded-md bg-muted px-2 py-1 text-xs">New</span>
              <span className="text-sm">Search listings by photo</span>
              <span className="block h-4 w-px bg-border" />
              <ArrowRight className="size-4" />
            </Link>

            <h1 className="mt-8 text-balance text-4xl font-bold md:text-5xl">
              Find great deals near you
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Browse promos, flyers, and listings from local businesses.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Button asChild size="lg">
                <Link href="#search">Start searching</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/faq">How it works</Link>
              </Button>
            </div>

            <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm lg:justify-start">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-brand-teal" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-12 lg:mt-0 lg:w-1/2">
            <HeroSlider slides={slides} dots="on-surface" />
          </div>
        </div>
      </div>
    </section>
  )
}
