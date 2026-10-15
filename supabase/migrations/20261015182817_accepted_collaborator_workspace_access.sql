-- Let explicitly accepted contributors read only the idea and workspace they were accepted to.
-- This does not grant idea/project write access or expose other communities.

create or replace function private.is_accepted_collaborator(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $fn$
  select (select auth.uid()) is not null
    and p_idea_id is not null
    and exists (
      select 1
      from public.docs v
      where v.path ~ '^volunteers/[^/]+$'
        and v.data->>'ideaId' = p_idea_id
        and v.data->>'applicantId' = (select auth.uid())::text
        and v.data->>'status' = 'accepted'
    );
$fn$;

revoke all on function private.is_accepted_collaborator(text) from public, anon;
grant execute on function private.is_accepted_collaborator(text) to authenticated;

drop policy if exists docs_read_accepted_collaborator_workspace on public.docs;
create policy docs_read_accepted_collaborator_workspace
on public.docs
for select
to authenticated
using (
  (path ~ '^ideas/[^/]+$'
    and private.is_accepted_collaborator(split_part(path, '/', 2)))
  or (path ~ '^ideas/[^/]+/comments/[^/]+$'
    and private.is_accepted_collaborator(split_part(path, '/', 2)))
  or (path ~ '^projects/[^/]+$'
    and private.is_accepted_collaborator(split_part(path, '/', 2)))
  or (path ~ '^milestones/[^/]+$'
    and private.is_accepted_collaborator(data->>'projectId'))
);
