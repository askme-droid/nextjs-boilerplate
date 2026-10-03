"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useState } from "react";

export type HeroSlide = {
  src: string;
  alt: string;
};

/**
 * Homepage hero strip: portrait promo flyers scrolling slowly right-to-left
 * in a seamless loop (see hero-marquee in globals.css).
 *
 * The slides are rendered twice back to back and the track animates by
 * exactly -50%, so the loop restarts on an identical frame; the second copy
 * is aria-hidden so screen readers don't hear every flyer twice. Pauses on
 * hover/focus, and via an explicit button (WCAG 2.2.2: auto-moving content
 * needs a way to stop it that doesn't depend on a mouse). With
 * prefers-reduced-motion it doesn't animate at all — it's a normal
 * horizontally scrollable row with just the first copy.
 *
 * Card sizes are fixed (not aspect-ratio driven) because every flyer is
 * A4-shaped (~0.71) and the track's width has to be known for the -50% loop.
 */
export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [paused, setPaused] = useState(false);

  if (slides.length === 0) return null;

  const loop = [...slides, ...slides];

  return (
    <div className="group relative w-full overflow-hidden py-3 motion-reduce:overflow-x-auto">
      <ul
        className={`flex w-max animate-hero-marquee motion-reduce:animate-none group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] ${
          paused ? "[animation-play-state:paused]" : ""
        }`}
      >
        {loop.map((slide, i) => {
          const isCopy = i >= slides.length;
          return (
            <li
              key={`${slide.src}-${isCopy ? "copy" : "orig"}`}
              aria-hidden={isCopy}
              className={`mr-4 shrink-0 ${isCopy ? "motion-reduce:hidden" : ""}`}
            >
              <div className="relative h-72 w-[205px] overflow-hidden rounded-xl bg-muted shadow-md lg:h-[22rem] lg:w-[251px]">
                <Image
                  src={slide.src}
                  alt={isCopy ? "" : slide.alt}
                  fill
                  sizes="(min-width: 1024px) 251px, 205px"
                  // Eager even off-screen: cards slide in from beyond the clip
                  // edge, and a lazy one would pop in blank as it arrives.
                  loading="eager"
                  className="object-cover"
                />
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Play promo carousel" : "Pause promo carousel"}
        className="absolute right-3 top-4 z-10 flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-background motion-reduce:hidden"
      >
        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
    </div>
  );
}
