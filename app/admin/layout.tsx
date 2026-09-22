import { requireStaff } from "@/lib/auth/require-staff";
import { signOut } from "./actions";

// Authoritative server-side check for everything under /admin. proxy.ts only
// does an optimistic redirect; this verifies the user and their staff role.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireStaff();

  return (
    <div className="mx-auto w-full max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {user.email}
        </span>
        <form action={signOut}>
          <button
            type="submit"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
