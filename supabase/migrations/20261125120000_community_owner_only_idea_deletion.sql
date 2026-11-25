begin;

-- Community idea deletion is more restrictive than other community management.
-- Moderators, idea authors, and platform administrators must not inherit this permission.
create or replace function private.is_community_owner_of_idea(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
  select
    p_idea_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.docs idea
      join public.docs community
        on community.path = 'communities/' || (idea.data->>'cid')
      where idea.path = 'ideas/' || p_idea_id
        and (idea.data->>'cid') is not null
        and coalesce(
          nullif(community.data->>'ownerId', ''),
          community.data->>'createdBy'
        ) = (select auth.uid())::text
    );
$function$;

revoke all on function private.is_community_owner_of_idea(text) from public, anon, authenticated;
grant execute on function private.is_community_owner_of_idea(text) to authenticated;

-- Restrictive policies are ANDed with the existing permissive delete policies.
-- This owner check therefore overrides their broader author/admin/manager grants
-- only for the top-level idea record, while preserving other delete capabilities.
drop policy if exists docs_delete_idea_owner_only on public.docs;
create policy docs_delete_idea_owner_only
on public.docs
as restrictive
for delete
to authenticated
using (
  path !~ '^ideas/[^/]+$'
  or private.is_community_owner_of_idea(split_part(path, '/', 2))
);

commit;
