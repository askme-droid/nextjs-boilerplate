"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IMAGE_SLIDE_SECONDS } from "@/lib/listings/constants";
import type { FeaturedVideoSlide } from "@/lib/listings/queries";
import { cn } from "@/lib/utils";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const roundButton =
  "flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal";

/**
 * Homepage "Featured listings": a carousel of cards, two side by side on
 * tablets and computers, one on phones (CSS scroll-snap, so swiping is native).
 *
 * Each card shows the listing's slide (video, image or animated GIF) with a
 * "Featured" tag, and its title and location under it; the whole card opens
 * the listing. Visible videos play muted. The carousel moves on by one card
 * when the first visible card's video ends, or every IMAGE_SLIDE_SECONDS for
 * images — only while on screen and not paused, and paused by default with
 * prefers-reduced-motion. A pause button is always there (WCAG 2.2.2).
 */
export function FeaturedVideoSlider({ slides }: { slides: FeaturedVideoSlide[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const frame = useRef(0);

  // Index of the first (leftmost) visible card, and how many fit at once.
  const [active, setActive] = useState(0);
  const [perView, setPerView] = useState(2);
  const [inView, setInView] = useState(false);
  const [approached, setApproached] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(true);
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const paused = userPaused ?? reduceMotion;

  const count = slides.length;
  const lastStart = Math.max(0, count - perView);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(section);
    const ahead = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setApproached(true);
          ahead.disconnect();
        }
      },
      { rootMargin: "100% 0px" },
    );
    ahead.observe(section);
    return () => {
      observer.disconnect();
      ahead.disconnect();
    };
  }, []);

  // Which card is first, and how many fit, follow the scroll position and
  // width — so swipes, arrows, dots and resizing all agree.
  const sync = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      const first = itemRefs.current[0];
      if (!track || !first) return;
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      const step = (itemRefs.current[1]?.offsetLeft ?? first.offsetLeft + first.offsetWidth) - first.offsetLeft;
      setPerView(Math.max(1, Math.round((track.clientWidth - pad * 2 + (step - first.offsetWidth)) / step)));
      let best = 0;
      let bestDistance = Infinity;
      itemRefs.current.forEach((item, index) => {
        if (!item) return;
        const distance = Math.abs(item.offsetLeft - pad - track.scrollLeft);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      setActive(best);
    });
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      cancelAnimationFrame(frame.current);
      // Clear it too, or a cancelled frame would block every later update.
      frame.current = 0;
    };
  }, [sync]);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const item = itemRefs.current[index];
      if (!track || !item) return;
      const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
      track.scrollTo({ left: item.offsetLeft - pad, behavior: reduceMotion ? "auto" : "smooth" });
    },
    [reduceMotion],
  );
  // Past the last full view, wrap round to the start (and back).
  const next = useCallback(() => goTo(active >= lastStart ? 0 : active + 1), [goTo, active, lastStart]);
  const prev = useCallback(() => goTo(active <= 0 ? lastStart : active - 1), [goTo, active, lastStart]);

  const isVisible = (index: number) => index >= active && index < active + perView;
  const running = inView && !paused && !hovered;

  // Visible videos play (muted unless the visitor turned sound on); the rest stop.
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      video.muted = muted;
      if (index >= active && index < active + perView && inView && !paused) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [active, perView, inView, paused, muted]);

  // Images: move on after a while. (A first card that's a video moves on
  // when it ends instead — see onEnded.)
  const firstIsImage = slides[active]?.kind === "image";
  useEffect(() => {
    if (!firstIsImage || count <= perView || !running) return;
    const timer = window.setTimeout(next, IMAGE_SLIDE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [firstIsImage, count, perView, running, next]);

  if (count === 0) return null;
  const hasVideo = slides.some((s, i) => s.kind === "video" && isVisible(i));
  const starts = lastStart + 1;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="featured-heading"
      aria-roledescription="carousel"
      className="pt-14"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      <div className="mx-auto max-w-2xl px-6 pb-8 text-center">
        <h2 id="featured-heading" className="text-3xl font-bold md:text-4xl">
          Featured <span className="text-brand-teal">listings</span>
        </h2>
        <p className="mt-3 text-muted-foreground">Promos and deals from local businesses, worth a look.</p>
      </div>

      <div className="relative mx-auto max-w-6xl">
        <ul
          ref={trackRef}
          onScroll={sync}
          className="flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto overscroll-x-contain px-6 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, index) => {
            const visible = isVisible(index);
            const near = approached && index >= active - 1 && index <= active + perView;
            // Client redirects go via /listings/<slug> so the visit is counted;
            // synced listings open the source.
            const outboundUrl = slide.externalUrl ?? (slide.redirectUrl ? `/listings/${slide.slug}` : null);
            const cardInner = (
              <>
                <div className="relative aspect-video overflow-hidden rounded-xl bg-zinc-900">
                  {slide.kind === "image" ? (
                    // Plain <img>: next/image would freeze an animated GIF.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slide.mediaUrl}
                      alt={slide.title}
                      loading={near ? "eager" : "lazy"}
                      decoding="async"
                      className="size-full object-cover transition-transform duration-500 group-hover/card:scale-105 motion-reduce:transition-none"
                    />
                  ) : (
                    <video
                      ref={(el) => {
                        videoRefs.current[index] = el;
                      }}
                      src={slide.posterUrl ? slide.mediaUrl : `${slide.mediaUrl}#t=0.1`}
                      poster={slide.posterUrl ?? undefined}
                      aria-label={slide.title}
                      muted
                      playsInline
                      loop={count <= perView}
                      preload={near ? "auto" : slide.posterUrl || !approached ? "none" : "metadata"}
                      onEnded={(e) => {
                        if (index === active && count > perView && running) next();
                        else e.currentTarget.play().catch(() => {});
                      }}
                      className="size-full object-cover"
                    />
                  )}
                  <span className="absolute left-3 top-3 rounded-md bg-amber-50/95 px-2.5 py-1 text-xs font-semibold text-amber-900 shadow-sm">
                    Featured
                  </span>
                </div>
                <div className="px-1 pb-1 pt-3">
                  <h3 className="line-clamp-1 text-base font-semibold leading-snug sm:text-lg">{slide.title}</h3>
                  {(slide.location || slide.categoryName) && (
                    <p className="line-clamp-1 text-sm text-zinc-500 dark:text-zinc-400">
                      {slide.location || slide.categoryName}
                    </p>
                  )}
                </div>
              </>
            );
            const cardClass =
              "group/card block h-full rounded-2xl border-2 border-brand-orange/70 bg-white p-2.5 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:border-brand-orange hover:shadow-lg motion-safe:hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-teal/40 dark:bg-zinc-900";

            return (
              <li
                key={slide.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${slide.title}`}
                aria-hidden={!visible}
                className="w-full shrink-0 snap-start md:w-[calc(50%-10px)]"
              >
                {outboundUrl ? (
                  <a
                    href={outboundUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    tabIndex={visible ? 0 : -1}
                    className={cardClass}
                  >
                    {cardInner}
                  </a>
                ) : (
                  <Link href={`/listings/${slide.slug}`} tabIndex={visible ? 0 : -1} className={cardClass}>
                    {cardInner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {count > perView && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous"
              className={cn(roundButton, "absolute left-1 top-[42%] hidden -translate-y-1/2 md:flex lg:-left-3")}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next"
              className={cn(roundButton, "absolute right-1 top-[42%] hidden -translate-y-1/2 md:flex lg:-right-3")}
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {(count > perView || hasVideo) && (
        <div className="mt-2 flex items-center justify-center gap-3">
          {count > perView && (
            <div className="flex">
              {Array.from({ length: starts }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`Go to ${slides[index]?.title ?? `slide ${index + 1}`}`}
                  aria-current={index === active}
                  className="group flex h-6 w-6 items-center justify-center"
                >
                  <span
                    className={cn(
                      "h-2 rounded-full transition-all",
                      index === active
                        ? "w-6 bg-brand-teal"
                        : "w-2 bg-zinc-300 group-hover:bg-zinc-400 dark:bg-zinc-700",
                    )}
                  />
                </button>
              ))}
            </div>
          )}
          {hasVideo && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-pressed={!muted}
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
              className="flex size-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          )}
          {count > perView && (
            <button
              type="button"
              onClick={() => setUserPaused(!paused)}
              aria-pressed={paused}
              aria-label={paused ? "Play slideshow" : "Pause slideshow"}
              className="flex size-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
