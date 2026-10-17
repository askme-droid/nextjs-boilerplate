"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-staff";
import { migrateBlobFilesToR2 } from "@/lib/storage/migrate-blob";

const PAGE = "/admin/tools/move-files";

/** Admin-only: re-checked here because a Server Action is reachable directly. */
export async function moveFilesToR2() {
  await requireAdmin(PAGE);

  let summary: string;
  try {
    const { moved, failed } = await migrateBlobFilesToR2();
    summary =
      failed.length === 0
        ? `Done: moved ${moved} file${moved === 1 ? "" : "s"}.`
        : `Moved ${moved}; ${failed.length} failed (first error: ${failed[0].reason}). Run it again later to retry them.`;
  } catch (e) {
    summary = e instanceof Error ? e.message : "The move failed.";
  }

  revalidatePath("/", "layout");
  redirect(`${PAGE}?msg=${encodeURIComponent(summary)}`);
}
