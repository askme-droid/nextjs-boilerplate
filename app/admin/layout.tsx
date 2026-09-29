import { requireStaff } from "@/lib/auth/require-staff";

// Authoritative server-side check for everything under /admin. proxy.ts only
// does an optimistic redirect; this verifies the user and their staff role.
// Sign-out and the account email live in the global nav
// (app/components/site-nav.tsx) now, not duplicated here.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireStaff();

  return <div className="mx-auto w-full max-w-5xl p-6">{children}</div>;
}
