import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-staff";
import { getExperienceTags } from "@/lib/experience-tags/queries";

// requireAdmin(), not just requireStaff() from the layout: experience tags
// are admin-only (unlike listings, which also allow editor) — see actions.ts.
export default async function AdminExperienceTagsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; deleted?: string; error?: string }>;
}) {
  await requireAdmin();
  const { saved, deleted, error } = await searchParams;
  const tags = await getExperienceTags();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Experiences</h1>
        <Link
          href="/admin/experience-tags/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          New experience
        </Link>
      </div>

      {saved && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Saved.
        </p>
      )}
      {deleted && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          Experience deleted.
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      {tags.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No experiences yet.{" "}
          <Link href="/admin/experience-tags/new" className="underline underline-offset-4">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/experience-tags/${tag.id}/edit`}
                  className="font-medium hover:underline"
                >
                  {tag.name}
                </Link>
                <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">/{tag.slug}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
