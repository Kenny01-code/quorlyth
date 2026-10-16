-- Let the idea creator participate in their own active collaboration workspace.
-- Community managers retain administrative controls; accepted applicants and idea
-- creators can contribute to team discussion and milestone progress.

create or replace function private.is_collaboration_workspace_participant(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $fn$
  select (select auth.uid()) is not null
    and p_idea_id is not null
    and (
      private.can_manage_community(private.idea_community_id(p_idea_id))
      or private.is_idea_author(p_idea_id)
      or private.is_accepted_collaborator(p_idea_id)
    );
$fn$;

revoke all on function private.is_collaboration_workspace_participant(text) from public, anon;
grant execute on function private.is_collaboration_workspace_participant(text) to authenticated;

-- An idea creator can still see their own idea/workspace if community visibility
-- or membership changes after creation. The predicate is tied to the exact idea.
drop policy if exists docs_read_collaboration_idea_author_workspace on public.docs;
create policy docs_read_collaboration_idea_author_workspace
on public.docs
for select
to authenticated
using (
  (path ~ '^ideas/[^/]+$'
    and private.is_idea_author(split_part(path, '/', 2)))
  or (path ~ '^ideas/[^/]+/comments/[^/]+$'
    and private.is_idea_author(split_part(path, '/', 2)))
  or (path ~ '^projects/[^/]+$'
    and private.is_idea_author(split_part(path, '/', 2)))
  or (path ~ '^milestones/[^/]+$'
    and private.is_idea_author(data->>'projectId'))
);

-- Idea creators need to see application status and the accepted team for their idea.
-- Existing applicant, manager, and accepted-collaborator policies remain in force.
drop policy if exists docs_read_collaboration_idea_author_applications on public.docs;
create policy docs_read_collaboration_idea_author_applications
on public.docs
for select
to authenticated
using (
  path ~ '^volunteers/[^/]+$'
  and private.is_idea_author(data->>'ideaId')
);

-- Allow idea creators to contribute to the team discussion alongside accepted users.
drop policy if exists docs_insert_accepted_collaborator_workspace on public.docs;
create policy docs_insert_accepted_collaborator_workspace
on public.docs
for insert
to authenticated
with check (
  (
    path ~ '^ideas/[^/]+/comments/[^/]+$'
    and data->>'authorId' = (select auth.uid())::text
    and private.is_collaboration_workspace_participant(split_part(path, '/', 2))
  )
  or
  (
    path ~ '^milestones/[^/]+$'
    and private.can_write_collaboration_milestone(path, data)
  )
);

comment on policy docs_insert_accepted_collaborator_workspace on public.docs is
  'Idea creators, community managers, and accepted collaborators can post workspace comments and add or upsert milestones only for workspaces they can access.';

-- Use the same hardened identity guard for both new milestone writes and updates.
-- This prevents contributors from moving/reassigning milestones or updating a
-- completed project's milestones through a permissive policy.
create or replace function private.can_write_collaboration_milestone(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $fn$
declare
  uid text := (select auth.uid())::text;
  project_id text;
  project_data jsonb;
  existing_data jsonb;
begin
  if uid is null
     or p_path is null
     or p_path !~ '^milestones/[^/]+$'
     or p_data is null
     or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  project_id := nullif(p_data->>'projectId', '');
  if project_id is null then return false; end if;

  select p.data into project_data
  from public.docs p
  where p.path = 'projects/' || project_id;

  if project_data is null
     or project_data->>'ideaId' is distinct from project_id
     or project_data->>'status' is distinct from 'active' then
    return false;
  end if;

  if not private.is_collaboration_workspace_participant(project_id) then
    return false;
  end if;

  select d.data into existing_data
  from public.docs d
  where d.path = p_path;

  if existing_data is not null then
    -- A milestone may be updated only in its original project and by retaining
    -- its original creator; the trigger below independently enforces identity.
    return existing_data->>'projectId' is not distinct from project_id
      and existing_data->>'createdBy' is not distinct from p_data->>'createdBy';
  end if;

  -- New milestones must be authored by the signed-in user.
  return p_data->>'createdBy' = uid;
end;
$fn$;

revoke all on function private.can_write_collaboration_milestone(text, jsonb) from public, anon;
grant execute on function private.can_write_collaboration_milestone(text, jsonb) to authenticated;

drop policy if exists docs_update_accepted_collaborator_milestones on public.docs;
drop policy if exists docs_update_collaboration_participant_milestones on public.docs;
create policy docs_update_collaboration_participant_milestones
on public.docs
for update
to authenticated
using (private.can_write_collaboration_milestone(path, data))
with check (private.can_write_collaboration_milestone(path, data));

comment on policy docs_update_collaboration_participant_milestones on public.docs is
  'Idea creators, community managers, and accepted collaborators can update milestones only in active workspaces, while preserving project and creator identity.';
