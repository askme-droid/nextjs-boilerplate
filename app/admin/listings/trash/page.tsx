import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";
import { ConfirmSubmit } from "@/app/components/confirm-submit";
import { listTrash, purgeExpiredTrash, TRASH_DAYS } from "@/lib/listings/trash";
import { deleteFromTrash, emptyTrash, restoreFromTrash } from "./actions";

export const metadata = { title: "Trash" };

const date = (d: Date) => d.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  await requireStaff("/admin/listings/trash");
  const { msg } = await searchParams;
  // Anything past 30 days goes now (the 6-hourly job does this too).
  await purgeExpiredTrash().catch(() => 0);
  const items = await listTrash();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Deleted listings stay here for {TRASH_DAYS} days, hidden from the site. Restore one to put it back as it
            was; after {TRASH_DAYS} days it&apos;s deleted for good, with its photos and videos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {items.length > 0 && (
            <form action={emptyTrash}>
              <ConfirmSubmit
                message={`Delete all ${items.length} listing${items.length === 1 ? "" : "s"} in the Trash for good? This can't be undone.`}
                className="whitespace-nowrap rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Empty Trash
              </ConfirmSubmit>
            </form>
          )}
          <Link href="/admin/listings" className="whitespace-nowrap text-sm font-medium underline-offset-4 hover:underline">
            ← Listings
          </Link>
        </div>
      </div>

      {msg && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          {msg}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">The Trash is empty.</p>
      ) : (
        <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[640px] border-collapse rounded-lg border border-zinc-200 text-sm dark:border-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-3 py-2.5">Title</th>
                <th className="px-3 py-2.5">Was</th>
                <th className="px-3 py-2.5">Deleted</th>
                <th className="px-3 py-2.5">Deleted for good</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const { daysLeft } = item;
                return (
                  <tr key={item.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60">
                    <td className="px-3 py-3 align-top">
                      <span className="font-medium">{item.title || "Untitled listing"}</span>
                      {item.synced && (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          from fd.sg
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top capitalize text-zinc-600 dark:text-zinc-300">{item.previousStatus}</td>
                    <td className="whitespace-nowrap px-3 py-3 align-top">{date(item.trashedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-3 align-top">
                      {date(item.purgeAt)}
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        in {daysLeft} day{daysLeft === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
                        <form action={restoreFromTrash}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="font-medium text-brand-teal hover:underline">
                            Restore
                          </button>
                        </form>
                        <form action={deleteFromTrash}>
                          <input type="hidden" name="id" value={item.id} />
                          <ConfirmSubmit
                            message={`Delete “${item.title || "Untitled listing"}” for good? Its photos and videos are deleted too. This can't be undone.`}
                            className="text-red-600 hover:underline dark:text-red-400"
                          >
                            Delete forever
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
