"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/require-staff";
import { syncFdsgListings } from "@/lib/listings/fdsg-sync";

/** Re-checks requireStaff() itself — a Server Action is its own reachable
 *  endpoint, same reasoning as every other action in this app. */
export async function refreshSyncedListings() {
  await requireStaff();

  let errorMessage: string | null = null;
  let added = 0;
  let remaining = 0;
  let datesUpdated = 0;

  try {
    const result = await syncFdsgListings();
    added = result.added;
    remaining = result.remaining;
    datesUpdated = result.datesUpdated;
  } catch (e) {
    // Computed outside the try below on purpose: redirect() throws
    // internally, and calling it inside this catch would just be caught
    // again by the same block.
    errorMessage = e instanceof Error ? e.message : "Could not refresh listings from fd.sg.";
  }

  if (errorMessage) {
    redirect(`/admin/listings/synced?error=${encodeURIComponent(errorMessage)}`);
  }

  revalidatePath("/");
  revalidatePath("/admin/listings/synced");

  const addedMessage =
    added > 0 ? `Added ${added} new listing${added === 1 ? "" : "s"}.` : "No new listings found.";
  // Hit the per-run cap (see MAX_NEW_PER_RUN in fdsg-sync.ts) — tell staff
  // there's more so they know to click again rather than assume this was
  // everything.
  const datesMessage =
    datesUpdated > 0
      ? ` Updated the created date of ${datesUpdated} listing${datesUpdated === 1 ? "" : "s"} to match fd.sg.`
      : "";
  const message =
    (remaining > 0 ? `${addedMessage} ${remaining} more pending — click Refresh again to continue.` : addedMessage) +
    datesMessage;
  redirect(`/admin/listings/synced?refreshed=${encodeURIComponent(message)}`);
}
