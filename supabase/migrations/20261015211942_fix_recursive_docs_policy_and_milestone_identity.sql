-- Fix recursive RLS evaluation: policies on public.docs must not query public.docs
-- directly. Keep document lookups inside a narrowly-scoped SECURITY DEFINER helper.
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
  manager_access boolean;
  collaborator_access boolean;
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

  manager_access := private.is_collaboration_workspace_manager(project_id);
  collaborator_access := private.is_accepted_collaborator(project_id);
  if not coalesce(manager_access, false) and not coalesce(collaborator_access, false) then
    return false;
  end if;

  select d.data into existing_data
  from public.docs d
  where d.path = p_path;

  if existing_data is not null then
    -- A milestone may be updated only in its original project and by retaining
    -- its original creator; do not allow upserts to transfer or impersonate it.
    return existing_data->>'projectId' is not distinct from project_id
      and existing_data->>'createdBy' is not distinct from p_data->>'createdBy';
  end if;

  -- New milestones must be authored by the signed-in user.
  return p_data->>'createdBy' = uid;
end;
$fn$;

revoke all on function private.can_write_collaboration_milestone(text, jsonb) from public, anon;
grant execute on function private.can_write_collaboration_milestone(text, jsonb) to authenticated;

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
    and private.can_write_collaboration_milestone(path, data)
  )
);

create or replace function private.guard_collaboration_milestone_identity()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.path ~ '^milestones/[^/]+$'
     and (
       new.path is distinct from old.path
       or new.data->>'projectId' is distinct from old.data->>'projectId'
       or new.data->>'createdBy' is distinct from old.data->>'createdBy'
     ) then
    raise exception 'A milestone cannot be moved to another project or reassigned to another creator.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

drop trigger if exists guard_collaboration_milestone_identity on public.docs;
create trigger guard_collaboration_milestone_identity
before update of path, data on public.docs
for each row
when (old.path ~ '^milestones/[^/]+$')
execute function private.guard_collaboration_milestone_identity();

comment on function private.can_write_collaboration_milestone(text, jsonb) is
  'Checks milestone inserts/upserts using RLS-independent reads to avoid recursive docs policies and preserve project/creator identity.';
