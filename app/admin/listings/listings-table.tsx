import Link from "next/link";
import type { AdminListingRow } from "@/lib/listings/admin-queries";
import { formatListingDate } from "@/lib/listings/dates";
import { isExpired } from "@/lib/listings/expiry-dates";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { deleteListing, publishListing } from "./actions";
import type { Sort, SortKey } from "./sort";

const statusClass: Record<string, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const td = "px-3 py-3 align-top";

/** A column heading that sorts the table: first click A→Z / smallest first,
 *  second click reverses. ▲▼ shows the current order. */
function SortHeader({
  sortKey,
  label,
  sort,
  path,
  right = false,
  title,
  className = "",
}: {
  sortKey: SortKey;
  label: string;
  sort: Sort;
  path: string;
  right?: boolean;
  title?: string;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const nextDir = active && sort.dir === "asc" ? "desc" : "asc";
  return (
    <th
      className={`${th} ${right ? "text-right" : ""} ${className}`}
      title={title}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={`${path}?sort=${sortKey}&dir=${nextDir}`}
        scroll={false}
        className={`group inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${
          active ? "text-zinc-900 dark:text-zinc-100" : ""
        }`}
      >
        {label}
        <span aria-hidden className="flex flex-col text-[8px] leading-[7px]">
          <span className={active && sort.dir === "asc" ? "text-brand-teal" : "opacity-40 group-hover:opacity-70"}>▲</span>
          <span className={active && sort.dir === "desc" ? "text-brand-teal" : "opacity-40 group-hover:opacity-70"}>▼</span>
        </span>
      </Link>
    </th>
  );
}

/** "22 Oct 2026" with "3 days ago" under it, like the WordPress list. */
function DateCell({ iso, empty }: { iso: string | null; empty: string }) {
  if (!iso) return <span className="text-zinc-400">{empty}</span>;
  return (
    <div className="whitespace-nowrap">
      <div>{formatListingDate(iso)}</div>
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{formatRelativeTime(iso)}</div>
    </div>
  );
}

/**
 * WordPress-style table of listings: Title (with status and row actions),
 * Author, Category, Views, Created, Posted and Expires. Used by /admin/listings and
 * /admin/listings/synced (`synced` labels Created as "Imported").
 */
export function ListingsTable({
  listings,
  returnTo,
  synced = false,
  sort = null,
}: {
  listings: AdminListingRow[];
  returnTo: "list" | "synced";
  synced?: boolean;
  sort?: Sort;
}) {
  const path = returnTo === "synced" ? "/admin/listings/synced" : "/admin/listings";
  // Kept by Publish/Delete so the list comes back in the same order.
  const back = sort ? `sort=${sort.key}&dir=${sort.dir}` : "";
  const head = (key: SortKey, label: string, opts: { right?: boolean; title?: string; className?: string } = {}) => (
    <SortHeader key={key} sortKey={key} label={label} sort={sort} path={path} {...opts} />
  );
  return (
    <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[860px] border-collapse rounded-lg border border-zinc-200 text-sm dark:border-zinc-800">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr className="border-b border-zinc-200 dark:border-zinc-800">
            {head("title", "Title", { className: "w-[34%]" })}
            {head("author", "Author")}
            {head("category", "Category")}
            {head("views", "Views", { right: true })}
            {head("created", synced ? "Imported" : "Created", {
              title: synced ? "When it was copied in from fd.sg" : "When the entry was made",
            })}
            {head("posted", "Posted", { title: "The date visitors see (“Posted …”). Editable on the listing." })}
            {head("expires", "Expires")}
          </tr>
        </thead>
        <tbody>
          {listings.map((listing, i) => {
            const expired = isExpired(listing.expires_at);
            return (
              <tr
                key={listing.id}
                className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-900 ${
                  i % 2 ? "bg-zinc-50/40 dark:bg-zinc-900/30" : ""
                }`}
              >
                <td className={td}>
                  <Link
                    href={`/admin/listings/${listing.id}/edit`}
                    className="font-medium text-brand-teal hover:underline"
                  >
                    {listing.title || "Untitled listing"}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        statusClass[listing.status] ?? statusClass.draft
                      }`}
                    >
                      {listing.status}
                    </span>
                    {expired && (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        expired
                      </span>
                    )}
                    {listing.redirect_url && (
                      <span
                        title={`Redirects to ${listing.redirect_url}`}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      >
                        redirects
                      </span>
                    )}
                    {listing.homepage_featured && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                        featured
                      </span>
                    )}
                  </div>
                  {/* Row actions, as in WordPress. */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <Link href={`/admin/listings/${listing.id}/edit`} className="font-medium hover:underline">
                      Edit
                    </Link>
                    <Link href={`/admin/listings/${listing.id}/preview`} className="hover:underline">
                      Preview
                    </Link>
                    {synced && listing.external_url && (
                      <a
                        href={listing.external_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="hover:underline"
                      >
                        View on fd.sg ↗
                      </a>
                    )}
                    {listing.status !== "published" && (
                      <form action={publishListing}>
                        <input type="hidden" name="id" value={listing.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <input type="hidden" name="back" value={back} />
                        <button type="submit" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
                          Publish
                        </button>
                      </form>
                    )}
                    <form action={deleteListing}>
                      <input type="hidden" name="id" value={listing.id} />
                      {returnTo === "synced" && <input type="hidden" name="returnTo" value="synced" />}
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="text-red-600 hover:underline dark:text-red-400">
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
                <td className={`${td} text-zinc-600 dark:text-zinc-300`}>
                  {listing.author ?? <span className="text-zinc-400">{synced ? "fd.sg sync" : "—"}</span>}
                </td>
                <td className={td}>
                  {listing.categories ? (
                    <span>{listing.categories.name}</span>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                  {listing.location && (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{listing.location}</div>
                  )}
                </td>
                <td className={`${td} text-right tabular-nums`}>{listing.view_count.toLocaleString("en-SG")}</td>
                <td className={td}>
                  <DateCell iso={listing.created_at} empty="—" />
                </td>
                <td className={td}>
                  <DateCell iso={listing.published_at} empty="Not published" />
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {listing.expires_at ? (
                    <span className={expired ? "text-zinc-400 line-through" : ""}>
                      {formatListingDate(`${listing.expires_at}T12:00:00+08:00`)}
                    </span>
                  ) : (
                    <span className="text-zinc-500 dark:text-zinc-400">Never</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
