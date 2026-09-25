import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/admin", "/my-listings"];

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. This is simpler than the
// old Supabase version needed to be: Better-Auth's session cookie doesn't
// need proxy-side refreshing the way Supabase's JWT cookie did (no
// getClaims()/token-refresh dance) — a cheap cookie-existence check is all
// that's needed here. This is NOT the security boundary, same as before:
// it's an optimistic redirect only. /admin's layout (requireStaff) and
// /my-listings' pages (requireUser) re-verify the session server-side; there's
// no RLS backstop anymore, so those app-level checks are now the sole
// enforcement, not defense-in-depth.
export async function proxy(request: NextRequest) {
  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );
  if (!isProtected) return NextResponse.next();

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals and static image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
