"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/require-staff";
import { deleteForever, listTrash, restoreListing } from "@/lib/listings/trash";

const PAGE = "/admin/listings/trash";
const done = (msg: string) => redirect(`${PAGE}?msg=${encodeURIComponent(msg)}`);

/** Each action re-checks requireStaff(): a Server Action is reachable directly. */
export async function restoreFromTrash(formData: FormData) {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const slug = await restoreListing(id);
  revalidatePath("/");
  if (slug) revalidatePath(`/listings/${slug}`);
  revalidatePath("/admin/listings");
  done("Restored. It's back in the listings with the status it had.");
}

export async function deleteFromTrash(formData: FormData) {
  await requireStaff();
  await deleteForever(String(formData.get("id") ?? ""));
  done("Deleted for good.");
}

export async function emptyTrash() {
  await requireStaff();
  const items = await listTrash();
  for (const item of items) await deleteForever(item.id);
  done(`Trash emptied: ${items.length} listing${items.length === 1 ? "" : "s"} deleted for good.`);
}
