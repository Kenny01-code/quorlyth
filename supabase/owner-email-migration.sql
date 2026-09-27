-- Run once in Supabase SQL Editor to make the verified owner account authoritative.
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

drop policy if exists "claim owner once" on public.docs;
create policy "claim owner once" on public.docs for insert
  with check (
    path = 'config/owner'
    and data->>'id' = (select auth.uid())::text
    and public.is_owner()
    and not exists (select 1 from public.docs d where d.path = 'config/owner')
  );
