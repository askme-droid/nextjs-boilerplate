"use client";

// Interactive extras for the homepage search box (listings-search-form.tsx):
// a typing placeholder, the "Browse" badge pills and the result summary with
// removable filter chips. All motion stops for prefers-reduced-motion.

import { useEffect, useState, useSyncExternalStore } from "react";
import { BadgeCheck, Clock, Flame, Sparkles, Star, TrendingUp, X } from "lucide-react";
import { SHOW_FILTERS, type ShowFilter } from "@/lib/listings/badges";
import { cn } from "@/lib/utils";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/** Example searches typed out (and erased) in the empty search box. */
export const SEARCH_EXAMPLES = [
  "pizza 1-for-1",
  "tuition in Bukit Batok",
  "free trial class",
  "digital door lock",
  "laundry deals",
  "Chinese lessons for kids",
];

/**
 * A placeholder that types and erases each example in turn. Runs only while
 * `active` (the box is empty and not focused); otherwise returns the plain
 * fallback text.
 */
export function useTypingPlaceholder(active: boolean, fallback: string) {
  const reduced = useReducedMotion();
  const [text, setText] = useState("");
  useEffect(() => {
    if (!active || reduced) return;
    let example = 0;
    let chars = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const word = SEARCH_EXAMPLES[example];
      chars += deleting ? -1 : 1;
      setText(chars > 0 ? `Try “${word.slice(0, chars)}”` : "");
      let delay = deleting ? 35 : 75;
      if (!deleting && chars === word.length) {
        deleting = true;
        delay = 1600;
      } else if (deleting && chars === 0) {
        deleting = false;
        example = (example + 1) % SEARCH_EXAMPLES.length;
        delay = 400;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [active, reduced]);
  return active && !reduced && text ? text : fallback;
}

const PILL_ICON: Record<ShowFilter, typeof Flame> = {
  trending: Flame,
  popular: Star,
  new: Sparkles,
  ending: Clock,
  verified: BadgeCheck,
  featured: TrendingUp,
};

const PILL_TONE: Record<ShowFilter, string> = {
  trending: "text-rose-600 dark:text-rose-400",
  popular: "text-emerald-700 dark:text-emerald-400",
  new: "text-brand-teal",
  ending: "text-amber-600 dark:text-amber-400",
  verified: "text-sky-700 dark:text-sky-400",
  featured: "text-brand-orange",
};

/** One-tap "Browse" filters (Trending, Popular, New…) with live counts.
 *  Pills with nothing to show are hidden. */
export function BrowsePills({
  value,
  counts,
  onPick,
}: {
  value: string;
  counts: Record<ShowFilter, number> | null;
  onPick: (value: string) => void;
}) {
  const pills = SHOW_FILTERS.filter((f) => !counts || counts[f.value] > 0 || value === f.value);
  if (pills.length === 0) return null;
  return (
    <div role="group" aria-label="Browse" className="relative">
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto pb-1 pl-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:pr-1 [&::-webkit-scrollbar]:hidden">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Browse
        </span>
        {pills.map((f, i) => {
          const Icon = PILL_ICON[f.value];
          const active = value === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(active ? "" : f.value)}
              style={{ animationDelay: `${i * 60}ms` }}
              className={cn(
                "group/pill relative inline-flex min-h-9 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border px-3.5 py-1 text-sm font-medium transition-all motion-safe:animate-pop-in motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
              )}
            >
              {/* A light sweep across Trending every few seconds. */}
              {f.value === "trending" && !active && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/3 bg-linear-to-r from-transparent via-rose-200/70 to-transparent motion-safe:block motion-safe:animate-sheen dark:via-rose-400/20"
                />
              )}
              <Icon
                aria-hidden
                className={cn(
                  "relative size-4 transition-transform motion-safe:group-hover/pill:scale-125",
                  active ? "" : PILL_TONE[f.value],
                  f.value === "trending" && !active && "motion-safe:animate-pulse",
                )}
              />
              <span className="relative">{f.short}</span>
              {counts && (
                <span className={cn("relative text-xs tabular-nums", active ? "opacity-80" : "opacity-60")}>
                  {counts[f.value]}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:hidden dark:from-zinc-900"
      />
    </div>
  );
}

/** Counts up to `value` when it changes (instant with reduced motion). */
function useCountUp(value: number) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (reduced) return;
    const from = 0;
    const start = performance.now();
    const duration = 500;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return reduced ? value : shown;
}

export type ActiveFilter = { key: string; label: string };

/** "24 deals found" plus a removable chip for each filter in use. */
export function ResultSummary({
  total,
  filters,
  onRemove,
}: {
  total: number;
  filters: ActiveFilter[];
  onRemove: (key: string) => void;
}) {
  const shown = useCountUp(total);
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
      <span className="font-medium text-zinc-700 dark:text-zinc-300">
        <span className="tabular-nums">{shown}</span> {total === 1 ? "deal" : "deals"} found
      </span>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onRemove(f.key)}
          aria-label={`Remove filter: ${f.label}`}
          className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-0.5 text-brand-teal transition-colors motion-safe:animate-pop-in hover:bg-brand-teal/20"
        >
          {f.label}
          <X aria-hidden className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
