import Link from "next/link";
import { requireStaff } from "@/lib/auth/require-staff";

const linkClass =
  "w-fit rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export default async function AdminPage() {
  // Not requireAdmin(): this page itself is fine for any staff to see —
  // it just decides which links to show them.
  const { role } = await requireStaff();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <Link href="/admin/listings" className={linkClass}>
        Manage listings
      </Link>
      <Link href="/admin/listings/synced" className={linkClass}>
        Synced listings
      </Link>
      {role === "admin" && (
        <Link href="/admin/categories" className={linkClass}>
          Manage categories
        </Link>
      )}
      {role === "admin" && (
        <Link href="/admin/experience-tags" className={linkClass}>
          Manage experiences
        </Link>
      )}
    </main>
  );
}
