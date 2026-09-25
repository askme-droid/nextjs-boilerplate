// Plain helpers, no DB access — replaces the is_staff()/is_admin() SQL
// functions from the old Supabase RLS policies. Kept in one place so
// require-staff.ts and lib/listings/admin-queries.ts's self-guard both use
// the exact same definition of "staff".
export const STAFF_ROLES = ["admin", "editor"] as const;

export function isStaff(role: string | null | undefined): boolean {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}
