import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv, hasSupabaseEnv } from "./env";

/**
 * Called from proxy.ts on every request. Refreshes the Supabase auth cookies
 * (Server Components can't write cookies) and does an optimistic redirect for
 * /admin. This is NOT the security boundary: app/admin/layout.tsx re-checks the
 * user on the server, and RLS enforces access in the database.
 */
export async function updateSession(request: NextRequest) {
  // Don't take the whole site down when env vars aren't set yet; pages show
  // their own error. /admin still fails closed via its layout.
  if (!hasSupabaseEnv()) return NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Cache-Control headers so a CDN never caches a response with Set-Cookie.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Don't run code between createServerClient and getClaims(): it validates the
  // JWT and refreshes the session if it has expired.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && request.nextUrl.pathname.startsWith("/admin")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);

    const redirect = NextResponse.redirect(loginUrl);
    // Carry over any refreshed/cleared auth cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "cache-control") redirect.headers.set(key, value);
    });
    return redirect;
  }

  return response;
}
