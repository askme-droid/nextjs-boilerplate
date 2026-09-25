import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";

/**
 * Server-side gate for self-service pages (/my-listings): any signed-in
 * account qualifies, staff included — unlike requireStaff(), there's no role
 * check. Signed-out visitors go to /login. Every query/action still filters
 * explicitly by the returned user's id (see lib/listings/user-queries.ts and
 * app/my-listings/actions.ts) — that filter, not this gate, is what actually
 * scopes access, now that there's no RLS backstop underneath it.
 */
export async function requireUser(next = "/my-listings") {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) redirect(`/login?next=${encodeURIComponent(next)}`);

  return { user: session.user };
}
