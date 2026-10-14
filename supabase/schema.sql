-- Quorlyth database bootstrap for an empty Supabase project.
-- Apply the versioned files in supabase/migrations/ in order after bootstrapping Auth.
-- Do not add a broad "all signed-in users can read/write" policy here: the migrations
-- define the path-, role-, membership-, and ownership-aware policies.
-- A role table and a safe role-based function must exist before legacy migrations
-- define policies/functions that call public.is_owner(). Actual owner assignment is
-- seeded from the existing config/owner claim by the hardening migration, or assigned
-- manually through the Supabase SQL Editor for a newly provisioned project.
create schema if not exists private;
create table if not exists private.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table private.platform_roles enable row level security;
revoke all on private.platform_roles from public, anon, authenticated, service_role;
grant usage on schema private to authenticated;

create or replace function private.is_platform_owner()
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from private.platform_roles r
    where r.user_id = (select auth.uid()) and r.role = 'owner'
  );
$fn$;
revoke all on function private.is_platform_owner() from public, anon;
grant execute on function private.is_platform_owner() to authenticated;

create or replace function public.is_owner()
returns boolean language sql stable security invoker
set search_path = ''
as $fn$ select private.is_platform_owner(); $fn$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

create table if not exists public.docs (
  path text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.docs enable row level security;

-- Run only once per project. Ignore duplicate_object if Realtime already includes docs.
do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end
$publication$;
