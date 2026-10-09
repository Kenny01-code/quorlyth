-- Run this once in the Supabase SQL editor.
create table if not exists public.docs (
  path text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.docs enable row level security;
alter publication supabase_realtime add table public.docs;

-- The designated owner must have a verified Supabase Auth email.
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and lower(u.email) = 'ighiledivine77@gmail.com'
      and u.email_confirmed_at is not null
  )
$$;
grant execute on function public.is_owner() to anon, authenticated;
-- Never query public.docs directly from a policy on public.docs. That causes RLS recursion.
create or replace function public.owner_claim_exists() returns boolean
language sql stable security definer set search_path = '' set row_security = off as $
  select exists (select 1 from public.docs where path = 'config/owner')
$;
revoke all on function public.owner_claim_exists() from public;
grant execute on function public.owner_claim_exists() to authenticated;

drop policy if exists "claim owner once" on public.docs;
create policy "claim owner once" on public.docs for insert to authenticated
  with check (path = 'config/owner' and data->>'id' = (select auth.uid())::text
    and public.is_owner()
    and not public.owner_claim_exists());

-- Everyone signed in can read the space.
create policy "read when signed in" on public.docs for select using (auth.role() = 'authenticated');

-- Owner can write anything.
create policy "owner writes all" on public.docs for all using (public.is_owner()) with check (public.is_owner());

-- Members can add and edit ideas and comments, and their own votes, membership, profile, request and private data.
create policy "members write ideas" on public.docs for all
  using (auth.role() = 'authenticated' and path like 'ideas/%')
  with check (auth.role() = 'authenticated' and path like 'ideas/%');

create policy "own docs" on public.docs for all
  using (auth.role() = 'authenticated' and (
    path = 'votes/' || auth.uid() or path = 'members/' || auth.uid() or path = 'profiles/' || auth.uid()
    or path = 'requests/' || auth.uid() or path like 'data/users/' || auth.uid() || '/%'))
  with check (auth.role() = 'authenticated' and (
    path = 'votes/' || auth.uid() or path = 'members/' || auth.uid() or path = 'profiles/' || auth.uid()
    or path = 'requests/' || auth.uid() or path like 'data/users/' || auth.uid() || '/%'));

-- Private data stays private: others cannot read another person's data/users/* rows.
drop policy if exists "read when signed in" on public.docs;
create policy "read when signed in" on public.docs for select
  using (auth.role() = 'authenticated' and (path not like 'data/users/%' or path like 'data/users/' || auth.uid() || '/%' or public.is_owner()) and (path not like 'requests/%' or path = 'requests/' || auth.uid() or public.is_owner()));
