-- The client document store uses upsert for mutable docs. Permit a legitimate
-- collaborator/manager to upsert an existing milestone without pretending to be its creator.
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
            or private.can_manage_community(private.idea_community_id(p.data->>'ideaId'))
          )
      )
    )
  )
);
comment on policy docs_insert_accepted_collaborator_workspace on public.docs is
  'Accepted collaborators can post idea-linked discussion, add milestones, and upsert existing milestones only in workspaces they are authorized to access.';
