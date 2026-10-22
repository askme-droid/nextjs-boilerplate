import type { AdminListingRow } from "@/lib/listings/admin-queries";

export const SORT_KEYS = ["title", "author", "category", "views", "created", "posted", "expires"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export type Sort = { key: SortKey; dir: SortDir } | null;

/** ?sort=views&dir=desc → { key, dir }; anything else → null (default order). */
export function parseSort(sort?: string, dir?: string): Sort {
  if (!sort || !(SORT_KEYS as readonly string[]).includes(sort)) return null;
  return { key: sort as SortKey, dir: dir === "desc" ? "desc" : "asc" };
}

const text = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function value(row: AdminListingRow, key: SortKey): string | number | null {
  switch (key) {
    case "title":
      return text(row.title) || null;
    case "author":
      return text(row.author) || null;
    case "category":
      return text(row.categories?.name) || null;
    case "views":
      return row.view_count;
    case "created":
      return row.created_at;
    case "posted":
      return row.published_at;
    case "expires":
      return row.expires_at;
  }
}

/** Sorted copy. Empty values (no category, never published, never expires)
 *  always go last, whichever direction. */
export function sortListings(rows: AdminListingRow[], sort: Sort): AdminListingRow[] {
  if (!sort) return rows;
  const factor = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a, sort.key);
    const vb = value(b, sort.key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return cmp * factor;
  });
}
