"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
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
 * Homepage "Featured listings": one big 16:9 video (or image / animated GIF)
 * at a time with the
 * previous/next ones peeking in at the sides (CSS scroll-snap, so swiping on a
 * phone is native).
 *
 * Only the centred slide plays, muted and looping through the set — when it
 * ends the slider glides to the next. Playback also waits until the section is
 * on screen, and with prefers-reduced-motion it starts paused (the visitor can
 * still press play). There is always a pause button (WCAG 2.2.2: moving
 * content needs a way to stop it) and a sound toggle, since browsers only
 * autoplay muted video.
 *
 * Image slides (stills or animated GIFs, which animate by themselves) stay
 * for IMAGE_SLIDE_SECONDS and then move on, under the same rules: only while
 * on screen and not paused. The sound toggle only appears on video slides.
 */
export function FeaturedVideoSlider({ slides }: { slides: FeaturedVideoSlide[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const frame = useRef(0);

  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  // null = the visitor hasn't touched the button, so follow their motion setting.
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [muted, setMuted] = useState(true);
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const paused = userPaused ?? reduceMotion;

  const count = slides.length;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Which slide is centred follows the scroll position, so swipes, arrows,
  // dots and keyboard scrolling all end up in the same state.
  const syncActive = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const track = trackRef.current;
      if (!track) return;
      const middle = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bestDistance = Infinity;
      itemRefs.current.forEach((item, index) => {
        if (!item) return;
        const distance = Math.abs(item.offsetLeft + item.offsetWidth / 2 - middle);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      setActive(best);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      const item = itemRefs.current[index];
      if (!track || !item) return;
      track.scrollTo({
        left: item.offsetLeft - (track.clientWidth - item.offsetWidth) / 2,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    },
    [reduceMotion],
  );

  // One place decides who plays: the centred slide, while the section is on
  // screen and the visitor hasn't paused. Everything else stops, and a slide
  // that has been left restarts from the beginning next time it's centred.
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      video.muted = muted;
      if (index === active && inView && !paused) {
        void video.play().catch(() => {
          // Autoplay refused (e.g. data saver): the poster stays and the play
          // button still works.
        });
      } else {
        video.pause();
        if (index !== active && video.currentTime > 0) video.currentTime = 0;
      }
    });
  }, [active, inView, paused, muted]);

  // Image slides have no "ended" event, so a timer moves them on.
  const activeIsImage = slides[active]?.kind === "image";
  useEffect(() => {
    if (!activeIsImage || count < 2 || !inView || paused) return;
    const timer = window.setTimeout(() => goTo((active + 1) % count), IMAGE_SLIDE_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [activeIsImage, active, count, inView, paused, goTo]);

  if (count === 0) return null;

  return (
    <section
      ref={sectionRef}
      aria-labelledby="featured-heading"
      aria-roledescription="carousel"
      className="pt-14"
    >
      <div className="mx-auto max-w-2xl px-6 pb-8 text-center">
        <h2 id="featured-heading" className="text-3xl font-bold md:text-4xl">
          Featured <span className="text-brand-teal">listings</span>
        </h2>
        <p className="mt-3 text-muted-foreground">
          Promos and deals from local businesses, worth a look.
        </p>
      </div>

      <div className="relative mx-auto max-w-6xl">
        <ul
          ref={trackRef}
          onScroll={syncActive}
          className={cn(
            "relative flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            // Several slides: wide side padding so the neighbours peek in.
            // A lone slide has no neighbours, so it just fills the column.
            count === 1 ? "px-6 lg:px-[10%]" : "px-[10%] lg:px-[20%]",
          )}
        >
          {slides.map((slide, index) => {
            const isActive = index === active;
            const outboundUrl = slide.externalUrl ?? slide.redirectUrl;
            const near = Math.abs(index - active) <= 1;
            const linkClass = cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-teal px-3 py-1.5 text-xs font-semibold text-zinc-950 sm:text-sm",
              !isActive && "pointer-events-none",
            );
            const linkBody = (
              <>
                View <ArrowUpRight className="size-4" aria-hidden />
              </>
            );

            return (
              <li
                key={slide.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${slide.title}`}
                onClick={() => {
                  if (!isActive) goTo(index);
                }}
                className={cn(
                  "w-full shrink-0 snap-center transition-[opacity,transform] duration-500",
                  !isActive && "cursor-pointer opacity-55 motion-safe:scale-[0.94]",
                )}
              >
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-zinc-900 shadow-lg">
                  {slide.kind === "image" ? (
                    // Plain <img>: next/image would freeze an animated GIF on
                    // its first frame. Lazy-load the ones not near the centre.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slide.mediaUrl}
                      alt={slide.title}
                      loading={near ? "eager" : "lazy"}
                      decoding="async"
                      className="size-full object-cover"
                    />
                  ) : (
                    <video
                      ref={(el) => {
                        videoRefs.current[index] = el;
                      }}
                      // #t=0.1 makes the browser paint a frame instead of a
                      // black box when there is no poster photo.
                      src={slide.posterUrl ? slide.mediaUrl : `${slide.mediaUrl}#t=0.1`}
                      poster={slide.posterUrl ?? undefined}
                      aria-label={slide.title}
                      muted
                      playsInline
                      // A single slide has nothing to advance to, so it loops.
                      loop={count === 1}
                      preload={near ? "auto" : "metadata"}
                      onEnded={() => {
                        if (count > 1) goTo((index + 1) % count);
                      }}
                      className="size-full object-cover"
                    />
                  )}

                  {/* A lone image slide has nothing to play or pause. */}
                  {isActive && (slide.kind === "video" || count > 1) && (
                    <div className="absolute right-3 top-3 flex gap-2">
                      {slide.kind === "video" && (
                        <button
                          type="button"
                          onClick={() => setMuted((m) => !m)}
                          aria-pressed={!muted}
                          aria-label={muted ? "Turn sound on" : "Turn sound off"}
                          className={roundButton}
                        >
                          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setUserPaused(!paused)}
                        aria-pressed={paused}
                        aria-label={
                          slide.kind === "video"
                            ? paused ? "Play video" : "Pause video"
                            : paused ? "Play slideshow" : "Pause slideshow"
                        }
                        className={roundButton}
                      >
                        {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Under the video, not over it: the clips carry their own
                    lettering, which a caption bar would cover. */}
                <div className="mt-3 flex items-center justify-between gap-3 px-1">
                  <div className="flex min-w-0 flex-col items-start gap-0.5">
                    {slide.categoryName && (
                      <span className="text-xs font-semibold uppercase tracking-wide text-brand-teal">
                        {slide.categoryName}
                      </span>
                    )}
                    <h3 className="line-clamp-2 text-base font-semibold leading-snug sm:text-xl">
                      {slide.title}
                    </h3>
                  </div>
                  {outboundUrl ? (
                    <a
                      href={outboundUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      tabIndex={isActive ? 0 : -1}
                      className={linkClass}
                    >
                      {linkBody}
                    </a>
                  ) : (
                    <Link
                      href={`/listings/${slide.slug}`}
                      tabIndex={isActive ? 0 : -1}
                      className={linkClass}
                    >
                      {linkBody}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => goTo((active - 1 + count) % count)}
              aria-label="Previous slide"
              className={cn(roundButton, "absolute left-3 top-1/2 hidden -translate-y-1/2 md:flex")}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => goTo((active + 1) % count)}
              aria-label="Next slide"
              className={cn(roundButton, "absolute right-3 top-1/2 hidden -translate-y-1/2 md:flex")}
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex justify-center">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Go to slide ${index + 1}: ${slide.title}`}
              aria-current={index === active}
              className="group flex h-6 w-6 items-center justify-center"
            >
              <span
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === active ? "w-6 bg-brand-teal" : "w-2 bg-zinc-300 group-hover:bg-zinc-400 dark:bg-zinc-700",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
