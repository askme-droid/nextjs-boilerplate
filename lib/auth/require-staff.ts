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

/**
 * Stricter gate for admin-only areas — categories, unlike listings, have no
 * editor-level RLS policy ("staff manage categories" is_admin() only), so an
 * editor reaching this page would fail at the database anyway. 404s them here
 * instead of letting them hit a raw RLS error after filling out a form.
 */
export async function requireAdmin(next = "/admin") {
  const { user, role } = await requireStaff(next);
  if (role !== "admin") notFound();
  return { user, role };
}
