-- Fix: "Database error creating new user" when adding a user in Supabase Auth.
--
-- Known from the schema:
--   * trigger public.on_auth_user_created runs handle_new_user() AFTER INSERT on
--     auth.users; the function is SECURITY DEFINER, owned by postgres, so RLS on
--     profiles is not what blocks it.
--   * profiles has only: id (FK -> auth.users ON DELETE CASCADE), full_name,
--     role (default 'viewer'), created_at (default now()).
--   * profiles_role_check only allows role in ('admin', 'editor', 'viewer').
--
-- So the insert fails inside the function body (a column that doesn't exist, an
-- unqualified `profiles` that doesn't resolve for the auth role, or a role value
-- outside the check). This replaces it with a version that can only use columns
-- that exist, pins search_path, and leaves role to its 'viewer' default so
-- nobody becomes staff by signing up. Promote staff explicitly (see bottom).
--
-- Run in: Supabase Dashboard -> SQL Editor. Safe to re-run.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Re-bind the trigger to the function above (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;

-- After creating your first staff user (Authentication -> Users -> Add user),
-- make them an admin. Replace the email. Works whether or not a profile row
-- already exists:
--
--   insert into public.profiles (id, role)
--   select id, 'admin' from auth.users where email = 'you@example.com'
--   on conflict (id) do update set role = 'admin';
