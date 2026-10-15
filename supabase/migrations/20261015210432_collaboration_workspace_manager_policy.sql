-- Expose a narrow, caller-aware manager predicate for the workspace policy.
-- The helper returns only whether auth.uid() can manage this idea's community.
create or replace function private.is_collaboration_workspace_manager(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $fn$
  select p_idea_id is not null
    and private.can_manage_community(private.idea_community_id(p_idea_id));
$fn$;
revoke all on function private.is_collaboration_workspace_manager(text) from public, anon, authenticated;
grant execute on function private.is_collaboration_workspace_manager(text) to authenticated;

drop policy if exists docs_insert_accepted_collaborator_workspace on public.docs;
create policy docs_insert_accepted_collaborator_workspace
on public.docs
for insert
to authenticated
with check (
  (
    path ~ '^ideas/[^/]+/comments/[^/]+$'
    and data->>'authorId' = (select auth.uid())::text
    and private.is_accepted_collaborator(split_part(path, '/', 2))
  )
  or
  (
    path ~ '^milestones/[^/]+$'
    and (
      (
        data->>'createdBy' = (select auth.uid())::text
        and exists (
          select 1
          from public.docs p
          where p.path = 'projects/' || (public.docs.data->>'projectId')
            and p.data->>'ideaId' = (public.docs.data->>'projectId')
            and p.data->>'status' = 'active'
            and private.is_accepted_collaborator(p.data->>'ideaId')
        )
      )
      or exists (
        select 1
        from public.docs existing
        join public.docs p on p.path = 'projects/' || (existing.data->>'projectId')
        where existing.path = public.docs.path
          and existing.data->>'projectId' = public.docs.data->>'projectId'
          and p.data->>'ideaId' = (public.docs.data->>'projectId')
          and p.data->>'status' = 'active'
          and (
            private.is_accepted_collaborator(p.data->>'ideaId')
            or private.is_collaboration_workspace_manager(p.data->>'ideaId')
          )
      )
    )
  )
);
comment on policy docs_insert_accepted_collaborator_workspace on public.docs is
  'Accepted collaborators can post idea-linked discussion, add milestones, and upsert existing milestones only in workspaces they are authorized to access.';
