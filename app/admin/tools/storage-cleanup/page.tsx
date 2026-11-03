import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-staff";
import { ConfirmSubmit } from "@/app/components/confirm-submit";
import { findUnusedFiles, type UnusedScan } from "@/lib/storage/unused-files";
import { cleanUpStorage } from "./actions";

export const metadata = { title: "Clean up unused files" };

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const SHOW = 50;

export default async function StorageCleanupPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireAdmin("/admin/tools/storage-cleanup");
  const { msg } = await searchParams;

  let scan: UnusedScan | null = null;
  let problem: string | null = null;
  try {
    scan = await findUnusedFiles();
  } catch (e) {
    problem = e instanceof Error ? e.message : "Couldn't read the stored files.";
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Clean up unused files</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Finds photos and videos in Cloudflare R2 that no listing, photo or header slide uses any more — mostly
          left behind by listings deleted before deleting also removed their files. Files uploaded in the last day
          are left alone, and so is anything outside the folders this site uploads into.
        </p>
      </div>

      {msg && (
        <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">{msg}</p>
      )}
      {problem && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {problem}
        </p>
      )}

      {scan && (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:w-fit">
            <dt className="text-zinc-500">Files checked</dt>
            <dd>{scan.scanned}</dd>
            <dt className="font-medium">Not used by anything</dt>
            <dd className="font-medium">
              {scan.unused.length} ({megabytes(scan.unusedBytes)})
            </dd>
          </dl>

          {scan.unused.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">Nothing to clean up — every file is in use.</p>
          ) : (
            <>
              <form action={cleanUpStorage}>
                <ConfirmSubmit
                  message={`Delete ${scan.unused.length} unused file${scan.unused.length === 1 ? "" : "s"} (${megabytes(scan.unusedBytes)}) from storage? This can't be undone.`}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Delete {scan.unused.length} unused file{scan.unused.length === 1 ? "" : "s"}
                </ConfirmSubmit>
              </form>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2 text-right">Size</th>
                      <th className="px-3 py-2">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.unused.slice(0, SHOW).map((f) => (
                      <tr key={f.key} className="border-t border-zinc-100 dark:border-zinc-800">
                        <td className="break-all px-3 py-2 font-mono text-xs">{f.key}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{megabytes(f.size)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {f.lastModified.toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {scan.unused.length > SHOW && (
                  <p className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
                    …and {scan.unused.length - SHOW} more.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
