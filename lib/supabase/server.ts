import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers.
 * Uses the anon key plus the visitor's session cookie, so Row Level Security
 * applies as that user. Create a new client per request; never share one.
 */
export async function createClient() {
  // Read cookies first: it opts the route into dynamic rendering even when the
  // env check below throws (otherwise the build would try to prerender it).
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore: proxy.ts refreshes the session and writes cookies.
        }
      },
    },
  });
}
