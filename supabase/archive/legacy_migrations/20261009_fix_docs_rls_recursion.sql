-- Fix recursive Row Level Security on public.docs.
-- The old "claim owner once" INSERT policy queried public.docs from a policy
-- on public.docs itself, causing: infinite recursion detected in policy for relation "docs".
-- Run once in the Supabase SQL Editor or apply with the Supabase CLI.

create or replace function public.owner_claim_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1
    from public.docs
    where path = 'config/owner'
  )
$$;

revoke all on function public.owner_claim_exists() from public;
grant execute on function public.owner_claim_exists() to authenticated;

drop policy if exists "claim owner once" on public.docs;

create policy "claim owner once"
on public.docs
for insert
to authenticated
with check (
  path = 'config/owner'
  and data->>'id' = (select auth.uid())::text
  and public.is_owner()
  and not public.owner_claim_exists()
);

-- Verification query: the policy must use owner_claim_exists(), not a direct
-- SELECT from public.docs. Inspect the complete policy set after applying.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'docs'
order by policyname;
