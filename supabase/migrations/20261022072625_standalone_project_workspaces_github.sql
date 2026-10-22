-- Standalone project workspaces with independent membership and GitHub source evidence.
-- Keep the existing idea-bound collaboration model unchanged.

create or replace function private.is_standalone_project_member(p_project_id text, p_roles text[] default array['owner','manager','contributor','viewer']::text[])
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
  select p_project_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1 from public.docs project
      where project.path = 'standaloneProjects/' || p_project_id
        and project.data->>'id' = p_project_id
        and (
          project.data->>'createdBy' = (select auth.uid())::text
          or exists (
            select 1 from public.docs member
            where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || (select auth.uid())::text
              and member.data->>'projectId' = p_project_id
              and member.data->>'userId' = (select auth.uid())::text
              and member.data->>'status' = 'active'
              and member.data->>'role' = any(p_roles)
          )
        )
    );
$function$;

create or replace function private.can_manage_standalone_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
  select p_project_id is not null and (select auth.uid()) is not null
    and exists (
      select 1 from public.docs project
      where project.path = 'standaloneProjects/' || p_project_id
        and project.data->>'id' = p_project_id
        and (
          project.data->>'createdBy' = (select auth.uid())::text
          or exists (
            select 1 from public.docs member
            where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || (select auth.uid())::text
              and member.data->>'projectId' = p_project_id
              and member.data->>'userId' = (select auth.uid())::text
              and member.data->>'status' = 'active'
              and member.data->>'role' in ('owner','manager')
          )
        )
    );
$function$;

create or replace function private.can_read_standalone_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare uid text := (select auth.uid())::text; project_id text;
begin
  if uid is null or p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;

  if p_path ~ '^standaloneProjects/[^/]+$' then
    project_id := split_part(p_path, '/', 2);
    return p_data->>'id' = project_id
      and (
        private.is_standalone_project_member(project_id)
        or exists (
          select 1 from public.docs member
          where member.path = 'standaloneProjectMembers/' || project_id || '__' || uid
            and member.data->>'projectId' = project_id
            and member.data->>'userId' = uid
            and member.data->>'status' = 'invited'
        )
      );
  elsif p_path ~ '^standaloneProjectMembers/[^/]+$' then
    project_id := coalesce(p_data->>'projectId', split_part(split_part(p_path,'/',2),'__',1));
    return p_path = 'standaloneProjectMembers/' || project_id || '__' || coalesce(p_data->>'userId','')
      and (p_data->>'userId' = uid or private.is_standalone_project_member(project_id));
  elsif p_path ~ '^standaloneTasks/[^/]+$'
     or p_path ~ '^standaloneArtifacts/[^/]+$'
     or p_path ~ '^standaloneGithubRepos/[^/]+$'
     or p_path ~ '^standaloneComments/[^/]+$' then
    project_id := p_data->>'projectId';
    if project_id is null then return false; end if;
    return private.is_standalone_project_member(project_id);
  elsif p_path ~ '^standaloneActivity/[^/]+$' then
    return private.is_standalone_project_member(p_data->>'projectId');
  end if;
  return false;
end;
$function$;

create or replace function private.can_insert_standalone_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  existing_data jsonb;
  project_id text;
  project_creator text;
begin
  if uid is null or p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;

  select d.data into existing_data from public.docs d where d.path = p_path;
  if existing_data is not null then
    -- DocStore.set uses upsert for mutable records. Existing documents still have to
    -- pass the same immutable-field/role checks as a direct UPDATE.
    return private.can_update_standalone_doc(p_path, p_data);
  end if;

  if p_path ~ '^standaloneProjects/[^/]+$' then
    project_id := split_part(p_path,'/',2);
    return p_data->>'id' = project_id
      and p_data->>'createdBy' = uid
      and coalesce(p_data->>'status','active') = 'active'
      and coalesce(p_data->>'visibility','team') = 'team'
      and length(trim(coalesce(p_data->>'title',''))) between 2 and 100
      and length(trim(coalesce(p_data->>'summary',''))) between 8 and 4000
      and coalesce(p_data->>'at','') ~ '^[0-9]{10,16}$'
      and coalesce(p_data->>'updatedAt','') ~ '^[0-9]{10,16}$';
  elsif p_path ~ '^standaloneProjectMembers/[^/]+$' then
    project_id := coalesce(p_data->>'projectId', split_part(split_part(p_path,'/',2),'__',1));
    project_creator := (select project.data->>'createdBy' from public.docs project where project.path = 'standaloneProjects/' || project_id);
    if p_path <> 'standaloneProjectMembers/' || project_id || '__' || coalesce(p_data->>'userId','')
      or p_data->>'id' is distinct from split_part(p_path,'/',2)
      or p_data->>'projectId' is distinct from project_id
      or coalesce(p_data->>'status','') not in ('active','invited')
      or coalesce(p_data->>'role','') not in ('owner','manager','contributor','viewer')
      or not exists (select 1 from public.docs project where project.path = 'standaloneProjects/' || project_id) then
      return false;
    end if;
    if p_data->>'userId' = uid and uid = project_creator then
      return p_data->>'role' = 'owner' and p_data->>'status' = 'active' and p_data->>'invitedBy' = uid;
    end if;
    return private.can_manage_standalone_project(project_id)
      and p_data->>'invitedBy' = uid
      and p_data->>'userId' <> project_creator
      and p_data->>'role' <> 'owner'
      and p_data->>'status' = 'invited'
      and (p_data->>'role' <> 'manager' or project_creator = uid);
  elsif p_path ~ '^standaloneTasks/[^/]+$' then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and project_id is not null
      and p_data->>'createdBy' = uid
      and coalesce(p_data->>'status','todo') = 'todo'
      and coalesce(p_data->>'updatedAt','') ~ '^[0-9]{10,16}$'
      and private.can_manage_standalone_project(project_id)
      and exists (select 1 from public.docs project where project.path = 'standaloneProjects/' || project_id and project.data->>'status' = 'active')
      and (
        nullif(p_data->>'assigneeId','') is null
        or exists (select 1 from public.docs member where member.path = 'standaloneProjectMembers/' || project_id || '__' || (p_data->>'assigneeId')
          and member.data->>'status' = 'active')
        or exists (select 1 from public.docs project where project.path = 'standaloneProjects/' || project_id and project.data->>'createdBy' = p_data->>'assigneeId')
      );
  elsif p_path ~ '^standaloneComments/[^/]+$' then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and p_data->>'authorId' = uid
      and length(trim(coalesce(p_data->>'text',''))) between 1 and 3000
      and coalesce(p_data->>'at','') ~ '^[0-9]{10,16}$'
      and private.is_standalone_project_member(project_id, array['owner','manager','contributor','viewer']::text[]);
  end if;

  -- Repository records and source-verified artifacts may only be created by the
  -- server-side GitHub verifier, never by client-supplied "verified" flags.
  return false;
end;
$function$;

create or replace function private.can_update_standalone_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  old_data jsonb;
  project_id text;
begin
  if uid is null or p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;
  select d.data into old_data from public.docs d where d.path = p_path;
  if old_data is null then return false; end if;

  if p_path ~ '^standaloneProjects/[^/]+$' then
    project_id := split_part(p_path,'/',2);
    return p_data->>'id' = project_id
      and p_data->>'createdBy' = old_data->>'createdBy'
      and p_data->>'at' = old_data->>'at'
      and p_data->>'visibility' = 'team'
      and p_data->>'status' in ('active','completed')
      and length(trim(coalesce(p_data->>'title',''))) between 2 and 100
      and length(trim(coalesce(p_data->>'summary',''))) between 8 and 4000
      and private.can_manage_standalone_project(project_id);
  elsif p_path ~ '^standaloneProjectMembers/[^/]+$' then
    project_id := old_data->>'projectId';
    if p_data->>'id' is distinct from old_data->>'id'
      or p_data->>'projectId' is distinct from project_id
      or p_data->>'userId' is distinct from old_data->>'userId'
      or p_data->>'invitedBy' is distinct from old_data->>'invitedBy'
      or p_data->>'role' is distinct from old_data->>'role' then
      return false;
    end if;
    -- An invitee can accept their own invite, but cannot change their role.
    if old_data->>'userId' = uid and old_data->>'status' = 'invited'
      and p_data->>'status' = 'active'
      and (p_data - 'status' - 'updatedAt') is not distinct from (old_data - 'status' - 'updatedAt') then
      return true;
    end if;
    return private.can_manage_standalone_project(project_id)
      and old_data->>'role' <> 'owner'
      and p_data->>'role' = old_data->>'role'
      and p_data->>'status' in ('invited','active','removed');
  elsif p_path ~ '^standaloneTasks/[^/]+$' then
    project_id := old_data->>'projectId';
    if p_data->>'id' is distinct from old_data->>'id'
      or p_data->>'projectId' is distinct from project_id
      or p_data->>'createdBy' is distinct from old_data->>'createdBy'
      or p_data->>'at' is distinct from old_data->>'at'
      or p_data->>'status' not in ('todo','in_progress','done') then
      return false;
    end if;
    if private.can_manage_standalone_project(project_id) then
      return length(trim(coalesce(p_data->>'title',''))) between 2 and 140;
    end if;
    return p_data->>'status' = 'in_progress'
      and old_data->>'status' = 'todo'
      and p_data->>'assigneeId' = uid
      and (p_data - 'status' - 'updatedAt') is not distinct from (old_data - 'status' - 'updatedAt')
      and private.is_standalone_project_member(project_id, array['contributor','manager','owner']::text[]);
  elsif p_path ~ '^standaloneArtifacts/[^/]+$' then
    project_id := old_data->>'projectId';
    return old_data->>'status' = 'submitted'
      and p_data->>'id' = old_data->>'id'
      and p_data->>'projectId' = project_id
      and p_data->>'taskId' = old_data->>'taskId'
      and p_data->>'provider' = 'github'
      and p_data->>'url' = old_data->>'url'
      and p_data->>'sourceMetadata' is not distinct from old_data->>'sourceMetadata'
      and p_data->>'submittedBy' = old_data->>'submittedBy'
      and p_data->>'verifiedAt' = old_data->>'verifiedAt'
      and p_data->>'verificationStatus' = 'source_verified'
      and p_data->>'status' in ('approved','changes_requested')
      and p_data->>'reviewedBy' = uid
      and p_data->>'reviewedBy' is distinct from old_data->>'submittedBy'
      and coalesce(p_data->>'reviewedAt','') ~ '^[0-9]{10,16}$'
      and coalesce(p_data->>'updatedAt','') ~ '^[0-9]{10,16}$'
      and length(coalesce(p_data->>'reviewNote','')) <= 1600
      and (p_data->>'status' <> 'changes_requested' or length(trim(coalesce(p_data->>'reviewNote',''))) >= 4)
      and private.can_manage_standalone_project(project_id);
  end if;
  return false;
end;
$function$;

revoke all on function private.is_standalone_project_member(text,text[]) from public, anon;
revoke all on function private.can_manage_standalone_project(text) from public, anon;
revoke all on function private.can_read_standalone_doc(text,jsonb) from public, anon;
revoke all on function private.can_insert_standalone_doc(text,jsonb) from public, anon;
revoke all on function private.can_update_standalone_doc(text,jsonb) from public, anon;
grant execute on function private.is_standalone_project_member(text,text[]) to authenticated;
grant execute on function private.can_manage_standalone_project(text) to authenticated;
grant execute on function private.can_read_standalone_doc(text,jsonb) to authenticated;
grant execute on function private.can_insert_standalone_doc(text,jsonb) to authenticated;
grant execute on function private.can_update_standalone_doc(text,jsonb) to authenticated;

-- Add standalone scope to the already-consolidated least-privilege policies.
drop policy if exists docs_insert_scoped on public.docs;
create policy docs_insert_scoped on public.docs
for insert to authenticated
with check (
  (select private.can_insert_doc(path, data))
  or (select private.can_create_ai_organizer_request(path, data))
  or (select private.can_insert_ai_organizer_milestone(path, data))
  or (select private.can_insert_work_submission(path, data))
  or (select private.can_insert_standalone_doc(path, data))
);

drop policy if exists docs_read_scoped on public.docs;
create policy docs_read_scoped on public.docs
for select to authenticated
using (
  (select private.can_read_doc(path, data))
  or (select private.can_read_conversation_doc(path, data))
  or (select private.can_read_ai_organizer_request(path, data))
  or (select private.can_read_collaboration_application(path, data))
  or (select private.can_read_work_submission(path, data))
  or (select private.can_read_standalone_doc(path, data))
);

drop policy if exists docs_update_scoped on public.docs;
create policy docs_update_scoped on public.docs
for update to authenticated
using (
  (select private.can_update_doc(path, data))
  or (select private.can_update_ai_organizer_request(path, data))
  or (select private.can_review_pending_collaboration_application(path, data))
  or (select private.can_review_work_submission(path, data))
  or (select private.can_update_ai_organizer_project_brief(path, data))
  or (select private.can_update_standalone_doc(path, data))
)
with check (
  (select private.can_update_doc(path, data))
  or (select private.can_save_ai_organizer_request(path, data))
  or (select private.can_decide_collaboration_application(path, data))
  or (select private.can_save_work_review(path, data))
  or (select private.can_update_ai_organizer_project_brief(path, data))
  or (select private.can_update_standalone_doc(path, data))
);

create or replace function private.enforce_standalone_project_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  task_id text;
  project_id text;
  previous_updated_ms numeric := 0;
begin
  if NEW.path ~ '^standaloneArtifacts/[^/]+$' then
    if NEW.data->>'provider' is distinct from 'github'
      or NEW.data->>'verificationStatus' is distinct from 'source_verified'
      or jsonb_typeof(NEW.data->'sourceMetadata') is distinct from 'object'
      or coalesce(NEW.data->>'verifiedAt','') !~ '^[0-9]{10,16}$'
      or coalesce(NEW.data->>'url','') !~ '^https://github\.com/[^/]+/[^/]+/(commit|pull)/[^/]+$'
      or coalesce(NEW.data->>'status','') not in ('submitted','approved','changes_requested') then
      raise exception 'GitHub artifacts must be confirmed by the server-side verifier.'
        using errcode = '22023';
    end if;
    return NEW;
  end if;

  if NEW.path ~ '^standaloneProjects/[^/]+$' then
    if NEW.data->>'status' = 'completed' then
      if not exists (
        select 1 from public.docs task
        where task.path ~ '^standaloneTasks/[^/]+$'
          and task.data->>'projectId' = NEW.data->>'id'
      ) or exists (
        select 1 from public.docs task
        where task.path ~ '^standaloneTasks/[^/]+$'
          and task.data->>'projectId' = NEW.data->>'id'
          and task.data->>'status' <> 'done'
      ) then
        raise exception 'Complete every project task through approved evidence before closing the workspace.'
          using errcode = '42501';
      end if;
    end if;
    return NEW;
  end if;

  if NEW.path !~ '^standaloneTasks/[^/]+$'
    or coalesce(NEW.data->>'status','todo') <> 'done' then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if coalesce(OLD.data->>'status','todo') = 'done' then return NEW; end if;
    if coalesce(OLD.data->>'updatedAt','') ~ '^[0-9]{10,16}$' then
      previous_updated_ms := (OLD.data->>'updatedAt')::numeric;
    elsif coalesce(OLD.data->>'at','') ~ '^[0-9]{10,16}$' then
      previous_updated_ms := (OLD.data->>'at')::numeric;
    end if;
  end if;

  task_id := split_part(NEW.path,'/',2);
  project_id := NEW.data->>'projectId';

  if not exists (
    select 1 from public.docs artifact
    where artifact.path ~ '^standaloneArtifacts/[^/]+$'
      and artifact.data->>'taskId' = task_id
      and artifact.data->>'projectId' = project_id
      and artifact.data->>'provider' = 'github'
      and artifact.data->>'verificationStatus' = 'source_verified'
      and artifact.data->>'status' = 'approved'
      and artifact.data->>'submittedBy' is not null
      and artifact.data->>'reviewedBy' is not null
      and artifact.data->>'submittedBy' is distinct from artifact.data->>'reviewedBy'
      and coalesce(artifact.data->>'reviewedAt','') ~ '^[0-9]{10,16}$'
      and coalesce(artifact.data->>'verifiedAt','') ~ '^[0-9]{10,16}$'
      and (artifact.data->>'reviewedAt')::numeric > previous_updated_ms
  ) then
    raise exception 'Tasks can only be completed after a different project manager approves a GitHub source-verified artifact.'
      using errcode = '42501';
  end if;

  return NEW;
end;
$function$;

drop trigger if exists docs_enforce_standalone_project_evidence on public.docs;
create trigger docs_enforce_standalone_project_evidence
before insert or update on public.docs
for each row
when (NEW.path ~ '^(standaloneProjects|standaloneTasks|standaloneArtifacts)/[^/]+$')
execute function private.enforce_standalone_project_evidence();

revoke all on function private.enforce_standalone_project_evidence() from public, anon, authenticated;

notify pgrst, 'reload schema';
