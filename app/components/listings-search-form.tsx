"use client";

import { useEffect, useTransition, type FormEvent } from "react";
import Form from "next/form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ListingTag } from "@/lib/experience-tags/queries";
import type { ListingCategory } from "@/lib/listings/queries";
import { ImageSearchButton } from "./image-search-button";
import {
  consumeScrollRequest,
  requestScrollToResults,
  scrollToResults,
} from "./search-scroll";
import { SearchingCard } from "./searching-card";

const fieldClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function ListingsSearchForm({
  q,
  category,
  location,
  experience,
  hasImageMatch = false,
  categories,
  experiences,
}: {
  q: string;
  category: string;
  location: string;
  experience: string;
  hasImageMatch?: boolean;
  categories: ListingCategory[];
  experiences: ListingTag[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentQuery = searchParams.toString();

  // The new results have rendered once the URL's params change; if this
  // search asked for it, put the search card (and so the results) at the top.
  useEffect(() => {
    if (!consumeScrollRequest()) return;
    const frame = requestAnimationFrame(scrollToResults);
    return () => cancelAnimationFrame(frame);
  }, [currentQuery]);

  // Runs instead of next/form's own navigation (which would scroll to the
  // top of the page, leaving the results below the hero). Doing the push in a
  // transition also gives an accurate "still loading" flag for the card.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim() !== "") params.set(name, value.trim());
    }
    const nextQuery = params.toString();
    // Same search again: the params won't change, so scroll right away.
    if (nextQuery === currentQuery) scrollToResults();
    else requestScrollToResults();
    startTransition(() => {
      router.push(nextQuery ? `/?${nextQuery}` : "/", { scroll: false });
    });
  }

  const hasFilters = q !== "" || category !== "" || location !== "" || experience !== "" || hasImageMatch;

  return (
    <div className="flex flex-col gap-2">
      {/* A GET form: submitting re-navigates to "/" with these fields as the
          full search params (any not listed here, like `page`, are dropped —
          a new search should start back on page 1). Works with JS disabled. */}
      <Form
        action="/"
        onSubmit={handleSubmit}
        aria-busy={isPending}
        className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center"
      >
        <input
          type="search"
          name="q"
          placeholder="Search listings…"
          defaultValue={q}
          aria-label="Search listings"
          className={`${fieldClass} flex-1 sm:min-w-[10rem]`}
        />

        <select
          name="category"
          defaultValue={category}
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
          defaultValue={location}
          aria-label="Filter by location"
          className={`${fieldClass} sm:w-40`}
        />

        <select
          name="experience"
          defaultValue={experience}
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

        <ImageSearchButton />

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-orange px-4 py-2 font-medium text-white transition-[filter] hover:brightness-95 disabled:cursor-wait disabled:opacity-70"
        >
          Search
        </button>
      </Form>

      {isPending && <SearchingCard subtitle="Looking through the listings…" />}

      {hasFilters && (
        <Link
          href="/"
          className="w-fit text-sm text-brand-teal underline-offset-4 hover:underline"
        >
          Clear
        </Link>
      )}
    </div>
  );
}
