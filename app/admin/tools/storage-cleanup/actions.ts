"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-staff";
import { deleteUnusedFiles } from "@/lib/storage/unused-files";

const PAGE = "/admin/tools/storage-cleanup";

/** Admin-only: re-checked here because a Server Action is reachable directly. */
export async function cleanUpStorage() {
  await requireAdmin(PAGE);
  let summary: string;
  try {
    const { deleted, bytes, failed } = await deleteUnusedFiles();
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    summary =
      failed === 0
        ? `Done: deleted ${deleted} unused file${deleted === 1 ? "" : "s"} (${mb} MB).`
        : `Deleted ${deleted} (${mb} MB); ${failed} couldn't be deleted. Run it again to retry them.`;
  } catch (e) {
    summary = e instanceof Error ? e.message : "The clean-up failed.";
  }
  redirect(`${PAGE}?msg=${encodeURIComponent(summary)}`);
}
