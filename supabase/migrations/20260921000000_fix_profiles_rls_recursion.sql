-- Fix: "infinite recursion detected in policy for relation profiles" (42P17).
--
-- Cause: policies read `profiles` to check the caller's role, and the
-- `profiles` SELECT policy ("read own profile") itself queries `profiles`, so
-- evaluating any of them re-enters the profiles policy forever.
--
-- Fix: do the role lookup inside SECURITY DEFINER functions. They run as the
-- function owner, which bypasses RLS on `profiles`, so no policy re-enters
-- itself. Policy names and access rules are unchanged:
--   * categories, experience_tags               -> admin only
--   * listings, listing_images, listing_experience_tags -> admin or editor
--   * profiles                                  -> own row, or admin sees all
--
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.

begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'editor')
  );
$$;

-- Admin only.
alter policy "staff manage categories" on public.categories
  using (public.is_admin()) with check (public.is_admin());

alter policy "staff manage experience tags" on public.experience_tags
  using (public.is_admin()) with check (public.is_admin());

-- Admin or editor.
alter policy "staff manage listings" on public.listings
  using (public.is_staff()) with check (public.is_staff());

alter policy "staff manage listing images" on public.listing_images
  using (public.is_staff()) with check (public.is_staff());

alter policy "staff manage listing tags" on public.listing_experience_tags
  using (public.is_staff()) with check (public.is_staff());

-- The self-referencing policy that caused the recursion.
alter policy "read own profile" on public.profiles
  using ((select auth.uid()) = id or public.is_admin());

commit;

-- Verify (run separately). Both should return a number, not an error:
--   begin; set local role anon; select count(*) from public.categories; rollback;
--   begin; set local role anon; select count(*) from public.listings;   rollback;
