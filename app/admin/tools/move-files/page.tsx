import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-staff";
import { countBlobFiles } from "@/lib/storage/migrate-blob";
import { moveFilesToR2 } from "./actions";

export const metadata = { title: "Move files to Cloudflare R2" };

// Copying can take a while for videos; give the action room on Vercel.
export const maxDuration = 300;

export default async function MoveFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireAdmin("/admin/tools/move-files");
  const { msg } = await searchParams;
  const counts = await countBlobFiles();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Move files to Cloudflare R2</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          New photos and videos are stored on Cloudflare R2. This copies the ones still on the old Vercel
          Blob store across and updates each listing to the new address. It&apos;s safe to run more than once.
        </p>
      </div>

      {msg && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">{msg}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:w-fit">
        <dt className="text-zinc-500">Listing photos</dt>
        <dd>{counts.images}</dd>
        <dt className="text-zinc-500">Featured images</dt>
        <dd>{counts.featuredImages}</dd>
        <dt className="text-zinc-500">Slider videos</dt>
        <dd>{counts.videos}</dd>
        <dt className="font-medium">Still on Vercel Blob</dt>
        <dd className="font-medium">{counts.total}</dd>
      </dl>

      {counts.total === 0 ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">All files are on Cloudflare R2. Nothing left to move.</p>
      ) : (
        <form action={moveFilesToR2}>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Move {counts.total} file{counts.total === 1 ? "" : "s"} now
          </button>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            If Vercel Blob is still suspended, files can&apos;t be read yet and will show as failed. Try again after
            the store reopens.
          </p>
        </form>
      )}
    </div>
  );
}
