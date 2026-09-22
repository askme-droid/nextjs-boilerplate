import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export const PAGE_SIZE = 12;

export type ListingCategory = Pick<Tables<"categories">, "id" | "name" | "slug">;

export type ListingWithRelations = Tables<"listings"> & {
  categories: ListingCategory | null;
  listing_images: Pick<
    Tables<"listing_images">,
    "id" | "url" | "is_featured" | "position"
  >[];
};

export type ListingsResult = {
  listings: ListingWithRelations[];
  totalCount: number;
  page: number;
  totalPages: number;
};

export type ListingsFilter = {
  /** Free-text search over title/description. */
  q?: string;
  /** Category slug, as it appears in the URL. */
  category?: string;
  /** 1-based page number. */
  page?: number;
};

/** All categories, for the filter dropdown. Public data, small table. */
export async function getCategories(): Promise<ListingCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, slug")
    .order("name");

  if (error) throw new Error(`Could not load categories: ${error.message}`);
  return data;
}

/**
 * Escapes a search term for safe use inside a Postgres LIKE/ILIKE pattern:
 * a literal backslash, `%` or `_` would otherwise act as a wildcard or
 * escape character. Callers still wrap the result in their own `%…%`.
 */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Applies the search/category/status filters shared by the count and data
 * queries below. Returns a fresh, not-yet-executed query each call — a
 * PostgREST query builder can only be sent once, so callers that need both a
 * count and a page of data call this twice rather than reusing one instance.
 */
function buildFilteredQuery(
  supabase: SupabaseServerClient,
  filter: ListingsFilter,
  selectColumns: string,
  options: { count: "exact"; head?: boolean },
) {
  // Filtering an embedded resource (`categories.slug=eq.…`) only nulls out
  // the nested object on a non-match; it doesn't exclude the row, which
  // would silently break the count and pagination below. `!inner` turns the
  // embed into a join condition, so a non-matching row is actually excluded.
  // Callers are expected to have already validated `category` against a
  // real slug (see app/page.tsx) — an unknown slug would otherwise inner-join
  // to nothing and read as "no listings" rather than "filter ignored".
  const categoriesEmbed = filter.category ? "categories!inner" : "categories";
  const select = selectColumns.replace("categories(", `${categoriesEmbed}(`);

  let query = supabase
    .from("listings")
    .select(select, options)
    .eq("status", "published");

  const q = filter.q?.trim();
  if (q) {
    // A comma or parenthesis would break PostgREST's `or=` filter grammar;
    // stripping them keeps this a plain keyword search rather than risking
    // a 400 on stray punctuation.
    const term = escapeLikeTerm(q.replace(/[,()]/g, " ").trim());
    if (term) {
      query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }
  }

  if (filter.category) {
    query = query.eq("categories.slug", filter.category);
  }

  return query;
}

const LISTINGS_SELECT =
  "*, categories(id, name, slug), listing_images(id, url, is_featured, position)";

/**
 * Published listings matching the given search/category/page, newest first.
 * RLS already restricts anonymous reads to `status = 'published'`; the
 * explicit filter here keeps that true regardless of who's asking.
 */
export async function getListings(
  filter: ListingsFilter = {},
): Promise<ListingsResult> {
  const supabase = await createClient();
  const requestedPage = Math.max(1, filter.page ?? 1);

  const fetchPage = (page: number) => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    return buildFilteredQuery(supabase, filter, LISTINGS_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to)
      .returns<ListingWithRelations[]>();
  };

  let { data, count, error } = await fetchPage(requestedPage);

  // PGRST103: the requested offset is past the last row (e.g. a stale/
  // tampered `?page=` after listings were unpublished). Rather than surface
  // a raw range error, find the real last page and refetch that instead.
  if (error?.code === "PGRST103") {
    // Must still request the categories embed (even though only `id` is
    // read) so `.eq("categories.slug", …)` above has a join to filter on.
    const { count: realCount, error: countError } = await buildFilteredQuery(
      supabase,
      filter,
      "id, categories(id)",
      { count: "exact", head: true },
    );
    if (countError) throw new Error(`Could not load listings: ${countError.message}`);

    const lastPage = Math.max(1, Math.ceil((realCount ?? 0) / PAGE_SIZE));
    ({ data, count, error } = await fetchPage(lastPage));
  }

  if (error) throw new Error(`Could not load listings: ${error.message}`);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  return { listings: data ?? [], totalCount, page, totalPages };
}
