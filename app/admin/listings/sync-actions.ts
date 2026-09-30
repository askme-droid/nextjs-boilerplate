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

  try {
    const result = await syncFdsgListings();
    added = result.added;
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

  const message = added > 0 ? `Added ${added} new listing${added === 1 ? "" : "s"}.` : "No new listings found.";
  redirect(`/admin/listings/synced?refreshed=${encodeURIComponent(message)}`);
}
