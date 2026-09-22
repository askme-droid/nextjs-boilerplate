import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <Link
        href="/admin/listings"
        className="w-fit rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Manage listings
      </Link>
    </main>
  );
}
