-- Accepted collaborators can actively coordinate their assigned workspace.
-- Keep all write access scoped to the specific idea they were accepted to.
-- The pre-existing docs_insert_scoped/docs_update_scoped policies remain in place;
-- these permissive policies add only the explicitly accepted collaborator paths.

drop policy if exists docs_read_accepted_collaborator_team on public.docs;
create policy docs_read_accepted_collaborator_team
on public.docs
for select
to authenticated
using (
  path ~ '^volunteers/[^/]+$'
  and data->>'status' = 'accepted'
  and private.is_accepted_collaborator(data->>'ideaId')
);

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
    and data->>'createdBy' = (select auth.uid())::text
    and exists (
      select 1
      from public.docs p
      where p.path = 'projects/' || (public.docs.data->>'projectId')
        and p.data->>'ideaId' = (public.docs.data->>'projectId')
        and p.data->>'status' = 'active'
        and private.is_accepted_collaborator(p.data->>'ideaId')
    )
  )
);

drop policy if exists docs_update_accepted_collaborator_milestones on public.docs;
create policy docs_update_accepted_collaborator_milestones
on public.docs
for update
to authenticated
using (
  path ~ '^milestones/[^/]+$'
  and private.is_accepted_collaborator(data->>'projectId')
)
with check (
  path ~ '^milestones/[^/]+$'
  and private.is_accepted_collaborator(data->>'projectId')
);

comment on policy docs_read_accepted_collaborator_team on public.docs is
  'Accepted collaborators can see the accepted team roster for their own idea workspace.';
comment on policy docs_insert_accepted_collaborator_workspace on public.docs is
  'Accepted collaborators can post idea-linked workspace discussion and add milestones to active projects.';
comment on policy docs_update_accepted_collaborator_milestones on public.docs is
  'Accepted collaborators can update milestone progress only for the idea they were accepted to.';
