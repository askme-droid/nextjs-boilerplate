"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Form from "next/form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { BrowsePills, ResultSummary, useTypingPlaceholder, type ActiveFilter } from "./search-extras";
import type { ListingTag } from "@/lib/experience-tags/queries";
import { SHOW_FILTERS, type ShowFilter } from "@/lib/listings/badges";
import type { ListingCategory } from "@/lib/listings/queries";
import { cn } from "@/lib/utils";
import { ImageSearchButton } from "./image-search-button";

// Search by image is turned off while the site runs on Cloudflare Workers
// (see lib/listings/embeddings.ts). Kept as a client-side constant because
// this is a client component and embeddings.ts is server-only.
const SHOW_IMAGE_SEARCH = false;
import {
  consumeScrollRequest,
  requestScrollToResults,
  scrollToResults,
} from "./search-scroll";
import { SearchingCard } from "./searching-card";

const fieldClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

/** Results refresh this long after the visitor stops typing. */
const LIVE_SEARCH_DELAY_MS = 450;

type Filters = { q: string; category: string; location: string; experience: string; show: string };

export type CategoryChip = { slug: string; name: string; count: number };

const keyOf = (f: Filters) => JSON.stringify([f.q, f.category, f.location, f.experience, f.show]);

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1 text-sm transition-colors",
        active
          ? "border-brand-teal bg-brand-teal font-medium text-zinc-950"
          : "border-zinc-300 text-zinc-700 hover:border-brand-teal hover:text-brand-teal dark:border-zinc-700 dark:text-zinc-300",
      )}
    >
      {children}
    </button>
  );
}

export function ListingsSearchForm({
  q,
  category,
  location,
  experience,
  show = "",
  hasImageMatch = false,
  categories,
  experiences,
  chips,
  totalCount,
  showCounts = null,
}: {
  q: string;
  category: string;
  location: string;
  experience: string;
  show?: string;
  hasImageMatch?: boolean;
  categories: ListingCategory[];
  experiences: ListingTag[];
  chips: CategoryChip[];
  /** Listings matching the current search, for "24 deals found". */
  totalCount?: number;
  /** Per-pill counts for the Browse row. */
  showCounts?: Record<ShowFilter, number> | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  // "submit" = the visitor asked for it (button, Enter, chip, dropdown): show
  // the full "searching" card. "live" = results refreshing while they type:
  // just a small spinner in the box, so the card doesn't flash on every pause.
  const [pendingKind, setPendingKind] = useState<"submit" | "live">("live");
  const currentQuery = searchParams.toString();

  // The fields are controlled so chips, dropdowns and typing stay in step.
  // The URL stays the source of truth: when it changes from outside (Clear,
  // back/forward) the fields follow; when it changes because of a navigation
  // *we* started, they don't, or characters typed while the results were
  // loading would be overwritten. `inFlight` lists the searches we started
  // that haven't landed yet.
  const propsKey = keyOf({ q, category, location, experience, show });
  const [values, setValues] = useState<Filters>({ q, category, location, experience, show });
  const [seenKey, setSeenKey] = useState(propsKey);
  const [inFlight, setInFlight] = useState<string[]>([]);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    const index = inFlight.indexOf(propsKey);
    if (index === -1) {
      setValues({ q, category, location, experience, show });
      setInFlight([]);
    } else {
      setInFlight(inFlight.slice(index + 1));
    }
  }

  // Timer callbacks outlive the render that created them, so they read the
  // latest URL state from here.
  const latest = useRef({ currentQuery, propsKey });
  useEffect(() => {
    latest.current = { currentQuery, propsKey };
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // On phones the chips are one swipeable row, so the highlighted one can sit
  // off-screen (after a reload, Back, or a pick from the dropdown). Slide the
  // row — only the row, never the page — to put it in view.
  const chipRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipRow.current;
    const active = row?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!row || !active || row.scrollWidth <= row.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({
      left: active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [values.category, hasImageMatch]);

  // The new results have rendered once the URL's params change; if this
  // search asked for it, put the search card (and so the results) at the top.
  useEffect(() => {
    if (!consumeScrollRequest()) return;
    const frame = requestAnimationFrame(scrollToResults);
    return () => cancelAnimationFrame(frame);
  }, [currentQuery]);

  /** Go to the results for `next`. Doing the navigation in a transition gives
   *  an accurate "still loading" flag. `scroll` brings the search card to the
   *  top once the results have rendered (not wanted while typing — the visitor
   *  is already looking at it); `replace` keeps live typing out of the back
   *  button's history. */
  function navigate(
    next: Filters,
    { kind, scroll, replace }: { kind: "submit" | "live"; scroll: boolean; replace: boolean },
  ) {
    const trimmed: Filters = {
      q: next.q.trim(),
      category: next.category,
      location: next.location.trim(),
      experience: next.experience,
      show: next.show,
    };
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(trimmed)) {
      if (value !== "") params.set(name, value);
    }
    const nextQuery = params.toString();
    const { currentQuery: now, propsKey: nowKey } = latest.current;

    if (nextQuery === now) {
      if (scroll) scrollToResults();
      return;
    }
    if (scroll) requestScrollToResults();
    const key = keyOf(trimmed);
    if (key !== nowKey) setInFlight((list) => [...list, key]);
    setPendingKind(kind);
    startTransition(() => {
      const url = nextQuery ? `/?${nextQuery}` : "/";
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    });
  }

  function cancelLiveSearch() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function changeText(field: "q" | "location", value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    cancelLiveSearch();
    timer.current = setTimeout(() => {
      timer.current = null;
      navigate(next, { kind: "live", scroll: false, replace: true });
    }, LIVE_SEARCH_DELAY_MS);
  }

  function changeChoice(field: "category" | "experience" | "show", value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    cancelLiveSearch();
    navigate(next, { kind: "submit", scroll: true, replace: false });
  }

  // Runs instead of next/form's own navigation (which would scroll to the
  // top of the page, leaving the results below the hero).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    cancelLiveSearch();
    navigate(values, { kind: "submit", scroll: true, replace: false });
  }

  const [qFocused, setQFocused] = useState(false);
  const typingPlaceholder = useTypingPlaceholder(!qFocused && values.q === "", "Search listings…");

  // Chips for the filters in use (from the URL, i.e. what the results show).
  const clearOne = (field: keyof Filters) => {
    cancelLiveSearch();
    const next = { ...values, [field]: "" };
    setValues(next);
    navigate(next, { kind: "submit", scroll: false, replace: false });
  };
  const activeFilters: ActiveFilter[] = [
    q && { key: "q", label: `“${q}”` },
    category && {
      key: "category",
      label: categories.find((c) => c.slug === category)?.name ?? category,
    },
    location && { key: "location", label: `In ${location}` },
    experience && {
      key: "experience",
      label: experiences.find((t) => t.slug === experience)?.name ?? experience,
    },
    show && {
      key: "show",
      label: SHOW_FILTERS.find((f) => f.value === show)?.short ?? show,
    },
  ].filter((f): f is ActiveFilter => !!f);

  const hasFilters =
    q !== "" || category !== "" || location !== "" || experience !== "" || show !== "" || hasImageMatch;
  const showSearchingCard = isPending && pendingKind === "submit";
  const liveSearching = isPending && pendingKind === "live";

  return (
    <div className="flex flex-col gap-3">
      {/* A GET form: submitting re-navigates to "/" with these fields as the
          full search params (any not listed here, like `page`, are dropped —
          a new search should start back on page 1). Works with JS disabled. */}
      <Form
        action="/"
        onSubmit={handleSubmit}
        aria-busy={isPending}
        className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center"
      >
        <div className="group/q relative flex-1 sm:min-w-[12rem]">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within/q:text-brand-teal"
          />
          <input
            type="search"
            name="q"
            placeholder={typingPlaceholder}
            value={values.q}
            onChange={(e) => changeText("q", e.target.value)}
            onFocus={() => setQFocused(true)}
            onBlur={() => setQFocused(false)}
            aria-label="Search listings"
            className={`${fieldClass} w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`}
          />
          {liveSearching ? (
            <LoaderCircle
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-brand-teal motion-safe:animate-spin"
            />
          ) : (
            values.q && (
              <button
                type="button"
                onClick={() => {
                  cancelLiveSearch();
                  const next = { ...values, q: "" };
                  setValues(next);
                  navigate(next, { kind: "submit", scroll: false, replace: false });
                }}
                aria-label="Clear search text"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 motion-safe:animate-pop-in dark:hover:bg-zinc-800"
              >
                <X aria-hidden className="size-4" />
              </button>
            )
          )}
        </div>

        <select
          name="category"
          value={values.category}
          onChange={(e) => changeChoice("category", e.target.value)}
          aria-label="Filter by category"
          className={fieldClass}
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug}>
              {cat.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          name="location"
          placeholder="Location"
          value={values.location}
          onChange={(e) => changeText("location", e.target.value)}
          aria-label="Filter by location"
          className={`${fieldClass} sm:w-40`}
        />

        <select
          name="experience"
          value={values.experience}
          onChange={(e) => changeChoice("experience", e.target.value)}
          aria-label="Filter by experience"
          className={fieldClass}
        >
          <option value="">All experiences</option>
          {experiences.map((tag) => (
            <option key={tag.id} value={tag.slug}>
              {tag.name}
            </option>
          ))}
        </select>

        {/* Phones only: on wider screens the Browse pills below do this. */}
        <select
          name="show"
          value={values.show}
          onChange={(e) => changeChoice("show", e.target.value)}
          aria-label="Show only featured, trending, popular or verified listings"
          className={`${fieldClass} sm:hidden`}
        >
          <option value="">All listings</option>
          {SHOW_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {SHOW_IMAGE_SEARCH && <ImageSearchButton />}

        <button
          type="submit"
          disabled={showSearchingCard}
          className="rounded-md bg-brand-orange px-4 py-2 font-medium text-white transition-[filter] hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
        >
          Search
        </button>
      </Form>

      <div className="hidden sm:block">
        <BrowsePills value={values.show} counts={showCounts} onPick={(v) => changeChoice("show", v)} />
      </div>

      {chips.length > 0 && (
        <div role="group" aria-label="Quick category filter" className="relative">
          {/* One swipeable row on phones, wrapping on wider screens. */}
          <div
            ref={chipRow}
            className="relative -mx-1 flex gap-2 overflow-x-auto pb-1 pl-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible sm:pr-1 [&::-webkit-scrollbar]:hidden"
          >
            <Chip
              active={values.category === "" && !hasImageMatch}
              onClick={() => changeChoice("category", "")}
            >
              All
            </Chip>
            {chips.map((chip) => (
              <Chip
                key={chip.slug}
                active={values.category === chip.slug}
                onClick={() => changeChoice("category", chip.slug)}
              >
                {chip.name}
                <span className="text-xs tabular-nums opacity-70">{chip.count}</span>
              </Chip>
            ))}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:hidden dark:from-zinc-900"
          />
        </div>
      )}

      {showSearchingCard && <SearchingCard subtitle="Looking through the listings…" />}

      {totalCount !== undefined && !hasImageMatch && (
        <ResultSummary total={totalCount} filters={activeFilters} onRemove={(key) => clearOne(key as keyof Filters)} />
      )}

      {hasFilters && (
        <Link
          href="/"
          className="w-fit text-sm text-brand-teal underline-offset-4 hover:underline"
        >
          Clear all
        </Link>
      )}
    </div>
  );
}
