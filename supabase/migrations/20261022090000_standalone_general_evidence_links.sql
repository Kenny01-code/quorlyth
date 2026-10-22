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
  elsif p_path ~ '^standaloneComments/[^/]+
end;
$function$; then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and p_data->>'authorId' = uid
      and length(trim(coalesce(p_data->>'text',''))) between 1 and 3000
      and coalesce(p_data->>'at','') ~ '^[0-9]{10,16}
end;
$function$;
      and private.is_standalone_project_member(project_id, array['owner','manager','contributor']::text[]);
  elsif p_path ~ '^standaloneArtifacts/[^/]+
end;
$function$; then
    project_id := p_data->>'projectId';
    return p_data->>'id' = split_part(p_path,'/',2)
      and p_data->>'provider' = 'manual'
      and p_data->>'verificationStatus' = 'submitted_evidence'
      and p_data->>'status' = 'submitted'
      and p_data->>'submittedBy' = uid
      and p_data->>'taskId' is not null
      and p_data->>'kind' in ('link','document','demo')
      and length(trim(coalesce(p_data->>'summary',''))) between 8 and 1200
      and coalesce(p_data->>'url','') ~ '^https://[^[:space:]]+
end;
$function$;
      and jsonb_typeof(p_data->'sourceMetadata') = 'object'
      and coalesce(p_data->>'submittedAt','') ~ '^[0-9]{10,16}
end;
$function$;
      and coalesce(p_data->>'updatedAt','') ~ '^[0-9]{10,16}
end;
$function$;
      and exists (select 1 from public.docs task where task.path = 'standaloneTasks/' || (p_data->>'taskId')
        and task.data->>'projectId' = project_id and task.data->>'status' <> 'done')
      and exists (select 1 from public.docs project where project.path = 'standaloneProjects/' || project_id
        and project.data->>'status' = 'active')
      and private.is_standalone_project_member(project_id, array['owner','manager','contributor']::text[]);
  end if;

  -- GitHub source-verified artifacts are inserted only by the authenticated
  -- server-side verifier, never by client-supplied verification flags.
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
      and coalesce(old_data->>'assigneeId','') in ('', uid)
      and p_data->>'assigneeId' = uid
      and (p_data - 'status' - 'updatedAt' - 'assigneeId') is not distinct from (old_data - 'status' - 'updatedAt' - 'assigneeId')
      and private.is_standalone_project_member(project_id, array['contributor','manager','owner']::text[]);
  elsif p_path ~ '^standaloneArtifacts/[^/]+$' then
    project_id := old_data->>'projectId';
    return old_data->>'status' = 'submitted'
      and p_data->>'id' = old_data->>'id'
      and p_data->>'projectId' = project_id
      and p_data->>'taskId' = old_data->>'taskId'
      and p_data->>'provider' = old_data->>'provider'
      and p_data->>'url' = old_data->>'url'
      and p_data->>'sourceMetadata' is not distinct from old_data->>'sourceMetadata'
      and p_data->>'submittedBy' = old_data->>'submittedBy'
      and p_data->>'verifiedAt' is not distinct from old_data->>'verifiedAt'
      and p_data->>'verificationStatus' = old_data->>'verificationStatus'
      and (
        (old_data->>'provider' = 'github' and old_data->>'verificationStatus' = 'source_verified')
        or (old_data->>'provider' = 'manual' and old_data->>'verificationStatus' = 'submitted_evidence')
      )
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
    if NEW.data->>'provider' = 'github' then
      if NEW.data->>'verificationStatus' is distinct from 'source_verified'
        or jsonb_typeof(NEW.data->'sourceMetadata') is distinct from 'object'
        or coalesce(NEW.data->>'verifiedAt','') !~ '^[0-9]{10,16}$'
        or coalesce(NEW.data->>'url','') !~ '^https://github[.]com/[^/]+/[^/]+/(commit|pull)/[^/]+$'
        or coalesce(NEW.data->>'status','') not in ('submitted','approved','changes_requested') then
        raise exception 'GitHub artifacts must be confirmed by the server-side verifier.'
          using errcode = '22023';
      end if;
    elsif NEW.data->>'provider' = 'manual' then
      if NEW.data->>'verificationStatus' is distinct from 'submitted_evidence'
        or NEW.data->>'kind' not in ('link','document','demo')
        or jsonb_typeof(NEW.data->'sourceMetadata') is distinct from 'object'
        or coalesce(NEW.data->>'url','') !~ '^https://[^[:space:]]+$'
        or coalesce(NEW.data->>'status','') not in ('submitted','approved','changes_requested')
        or length(trim(coalesce(NEW.data->>'summary',''))) not between 8 and 1200
        or coalesce(NEW.data->>'submittedAt','') !~ '^[0-9]{10,16}$'
        or NEW.data->>'submittedBy' is null then
        raise exception 'Evidence links must be submitted with a description and remain labelled as unverified until reviewed.'
          using errcode = '22023';
      end if;
    else
      raise exception 'Only GitHub-verified sources or contributor-submitted evidence links are accepted.'
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
      and artifact.data->>'status' = 'approved'
      and artifact.data->>'submittedBy' is not null
      and artifact.data->>'reviewedBy' is not null
      and artifact.data->>'submittedBy' is distinct from artifact.data->>'reviewedBy'
      and coalesce(artifact.data->>'reviewedAt','') ~ '^[0-9]{10,16}$'
      and (
        (artifact.data->>'provider' = 'github'
          and artifact.data->>'verificationStatus' = 'source_verified'
          and coalesce(artifact.data->>'verifiedAt','') ~ '^[0-9]{10,16}$')
        or
        (artifact.data->>'provider' = 'manual'
          and artifact.data->>'verificationStatus' = 'submitted_evidence'
          and coalesce(artifact.data->>'submittedAt','') ~ '^[0-9]{10,16}$')
      )
  ) then
    raise exception 'Tasks can only be completed after a different project manager approves submitted evidence or a GitHub source-verified artifact.'
      using errcode = '42501';
  end if;

  return NEW;
end;
$function$;

notify pgrst, 'reload schema';
