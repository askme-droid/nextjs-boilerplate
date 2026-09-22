import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Roles allowed into /admin. Mirrors public.is_staff() in the database. */
export const STAFF_ROLES = ["admin", "editor"] as const;

/**
 * Server-side gate for the management area. Verifies the session with the Auth
 * server, then checks `profiles.role`. Signed-out users go to /login; signed-in
 * non-staff get a 404 so the area isn't advertised. Fails closed on any error.
 */
export async function requireStaff(next = "/admin") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(`Could not load profile: ${error.message}`);
  if (!profile || !(STAFF_ROLES as readonly string[]).includes(profile.role)) {
    notFound();
  }

  return { user, role: profile.role };
}
