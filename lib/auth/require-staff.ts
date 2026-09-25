import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { isAdmin, isStaff, STAFF_ROLES } from "./roles";

export { STAFF_ROLES };

/**
 * Server-side gate for the management area. Verifies the session with
 * Better-Auth, then checks the role Better-Auth already carries on
 * session.user (an additionalField — no separate profile lookup needed,
 * unlike the old Supabase version which had to query `profiles` itself).
 * Signed-out users go to /login; signed-in non-staff get a 404 so the area
 * isn't advertised. Fails closed on any error.
 */
export async function requireStaff(next = "/admin") {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!isStaff(session.user.role)) notFound();

  return { user: session.user, role: session.user.role as string };
}

/**
 * Stricter gate for admin-only areas — categories, unlike listings, have no
 * editor-level authorization rule, so an editor reaching this page would be
 * rejected at the query layer anyway (see lib/listings/admin-queries.ts and
 * app/admin/categories/actions.ts). 404s them here instead of letting them
 * hit that rejection after filling out a form.
 */
export async function requireAdmin(next = "/admin") {
  const { user, role } = await requireStaff(next);
  if (!isAdmin(role)) notFound();
  return { user, role };
}
