create or replace function private.can_access_work_idea(p_idea_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
  select (select auth.uid()) is not null
    and p_idea_id is not null
    and (
      private.is_platform_admin()
      or private.is_idea_author(p_idea_id)
      or private.is_accepted_collaborator(p_idea_id)
      or private.can_manage_community(private.idea_community_id(p_idea_id))
      or private.is_standalone_project_member(p_idea_id)
    );
$function$;

create or replace function private.can_submit_milestone_work(p_idea_id text, p_milestone_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  project_data jsonb;
  milestone_data jsonb;
begin
  if uid is null or p_idea_id is null or p_milestone_id is null then return false; end if;

  -- Allow this private bucket to store standalone project task evidence as well.
  select d.data into project_data from public.docs d where d.path = 'standaloneProjects/' || p_idea_id;
  if project_data is not null then
    select d.data into milestone_data from public.docs d where d.path = 'standaloneTasks/' || p_milestone_id;
    if milestone_data is null then return false; end if;
    return project_data->>'status' = 'active'
      and milestone_data->>'projectId' = p_idea_id
      and coalesce(milestone_data->>'status','todo') <> 'done'
      and coalesce(milestone_data->>'blocked','false') <> 'true'
      and (nullif(milestone_data->>'assigneeId','') is null or milestone_data->>'assigneeId' = uid)
      and private.is_standalone_project_member(p_idea_id, array['owner','manager','contributor']::text[]);
  end if;

  select d.data into project_data from public.docs d where d.path = 'projects/' || p_idea_id;
  select d.data into milestone_data from public.docs d where d.path = 'milestones/' || p_milestone_id;
  if project_data is null or milestone_data is null then return false; end if;

  return project_data->>'ideaId' = p_idea_id
    and project_data->>'status' = 'active'
    and milestone_data->>'projectId' = p_idea_id
    and coalesce(milestone_data->>'status','todo') <> 'done'
    and coalesce(milestone_data->>'blocked','false') <> 'true'
    and (nullif(milestone_data->>'assigneeId','') is null or milestone_data->>'assigneeId' = uid)
    and private.can_access_work_idea(p_idea_id);
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
  attachment jsonb;
  attachment_path text;
  attachment_name text;
  attachment_size text;
  expected_prefix text;
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
      and private.is_standalone_project_member(project_id, array['owner','manager','contributor']::text[]);
  elsif p_path ~ '^standaloneArtifacts/[^/]+$' then
    project_id := p_data->>'projectId';
    if p_data->>'id' is distinct from split_part(p_path,'/',2)
      or p_data->>'provider' is distinct from 'manual'
      or p_data->>'verificationStatus' is distinct from 'submitted_evidence'
      or p_data->>'status' is distinct from 'submitted'
      or p_data->>'submittedBy' is distinct from uid
      or p_data->>'taskId' is null
      or p_data->>'kind' not in ('link','document','demo','file')
      or length(trim(coalesce(p_data->>'summary',''))) not between 8 and 1200
      or jsonb_typeof(p_data->'sourceMetadata') is distinct from 'object'
      or coalesce(p_data->>'submittedAt','') !~ '^[0-9]{10,16}$'
      or coalesce(p_data->>'updatedAt','') !~ '^[0-9]{10,16}$'
      or not exists (select 1 from public.docs task where task.path = 'standaloneTasks/' || (p_data->>'taskId')
        and task.data->>'projectId' = project_id and task.data->>'status' <> 'done')
      or not exists (select 1 from public.docs project where project.path = 'standaloneProjects/' || project_id
        and project.data->>'status' = 'active')
      or not private.is_standalone_project_member(project_id, array['owner','manager','contributor']::text[]) then
      return false;
    end if;

    if p_data->>'kind' = 'file' then
      if jsonb_typeof(p_data->'attachments') is distinct from 'array' then return false; end if;
      if jsonb_array_length(p_data->'attachments') < 1 or jsonb_array_length(p_data->'attachments') > 8 then return false; end if;
      expected_prefix := project_id || '/' || (p_data->>'taskId') || '/' || uid || '/';
      for attachment in select value from jsonb_array_elements(p_data->'attachments') loop
        if jsonb_typeof(attachment) <> 'object' then return false; end if;
        attachment_path := coalesce(attachment->>'path','');
        attachment_name := coalesce(attachment->>'name','');
        attachment_size := coalesce(attachment->>'size','');
        if left(attachment_path,length(expected_prefix)) <> expected_prefix
          or length(attachment_name) < 1 or length(attachment_name) > 180
          or attachment_size !~ '^[0-9]{1,9}$' or attachment_size::numeric > 26214400
          or coalesce(attachment->>'mimeType','') = ''
          or coalesce(attachment->>'uploadedAt','') !~ '^[0-9]{10,16}$' then
          return false;
        end if;
      end loop;
      return true;
    end if;

    return p_data->>'kind' in ('link','document','demo')
      and coalesce(p_data->>'url','') ~ '^https://[^[:space:]]+$';
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
      and p_data->>'kind' = old_data->>'kind'
      and p_data->>'summary' = old_data->>'summary'
      and p_data->'attachments' is not distinct from old_data->'attachments'
      and p_data->>'provider' = old_data->>'provider'
      and p_data->>'url' is not distinct from old_data->>'url'
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
  attachment jsonb;
  attachment_path text;
  attachment_name text;
  attachment_size text;
  expected_prefix text;
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
        or jsonb_typeof(NEW.data->'sourceMetadata') is distinct from 'object'
        or coalesce(NEW.data->>'status','') not in ('submitted','approved','changes_requested')
        or length(trim(coalesce(NEW.data->>'summary',''))) not between 8 and 1200
        or coalesce(NEW.data->>'submittedAt','') !~ '^[0-9]{10,16}$'
        or NEW.data->>'submittedBy' is null then
        raise exception 'Evidence must include a description and remain labelled as submitted evidence until reviewed.'
          using errcode = '22023';
      end if;

      if NEW.data->>'kind' = 'file' then
        if jsonb_typeof(NEW.data->'attachments') is distinct from 'array' then
          raise exception 'File evidence must contain an attachment array.' using errcode = '22023';
        end if;
        if jsonb_array_length(NEW.data->'attachments') < 1 or jsonb_array_length(NEW.data->'attachments') > 8 then
          raise exception 'File evidence must contain between 1 and 8 attachments.' using errcode = '22023';
        end if;
        expected_prefix := coalesce(NEW.data->>'projectId','') || '/' || coalesce(NEW.data->>'taskId','') || '/' || coalesce(NEW.data->>'submittedBy','') || '/';
        for attachment in select value from jsonb_array_elements(NEW.data->'attachments') loop
          if jsonb_typeof(attachment) <> 'object' then
            raise exception 'File evidence contains an invalid attachment record.' using errcode = '22023';
          end if;
          attachment_path := coalesce(attachment->>'path','');
          attachment_name := coalesce(attachment->>'name','');
          attachment_size := coalesce(attachment->>'size','');
          if left(attachment_path,length(expected_prefix)) <> expected_prefix
            or length(attachment_name) < 1 or length(attachment_name) > 180
            or attachment_size !~ '^[0-9]{1,9}$' or attachment_size::numeric > 26214400
            or coalesce(attachment->>'mimeType','') = ''
            or coalesce(attachment->>'uploadedAt','') !~ '^[0-9]{10,16}$' then
            raise exception 'File evidence contains an attachment that does not belong to this contributor and task.'
              using errcode = '42501';
          end if;
        end loop;
      elsif NEW.data->>'kind' in ('link','document','demo') then
        if coalesce(NEW.data->>'url','') !~ '^https://[^[:space:]]+$' then
          raise exception 'Evidence links must use HTTPS.' using errcode = '22023';
        end if;
      else
        raise exception 'Choose a supported evidence type.' using errcode = '22023';
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
      and (artifact.data->>'reviewedAt')::numeric > previous_updated_ms
  ) then
    raise exception 'Tasks can only be completed after a different project manager approves submitted evidence or a GitHub source-verified artifact.'
      using errcode = '42501';
  end if;

  return NEW;
end;
$function$;

drop policy if exists quorlyth_work_uploads_insert on storage.objects;
create policy quorlyth_work_uploads_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'quorlyth-work-submissions'
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[3] = (select auth.uid())::text
  and private.can_submit_milestone_work((storage.foldername(name))[1], (storage.foldername(name))[2])
);

drop policy if exists quorlyth_work_uploads_read on storage.objects;
create policy quorlyth_work_uploads_read on storage.objects
for select to authenticated
using (
  bucket_id = 'quorlyth-work-submissions'
  and cardinality(storage.foldername(name)) = 3
  and private.can_access_work_idea((storage.foldername(name))[1])
);

drop policy if exists quorlyth_work_uploads_delete_unsubmitted on storage.objects;
create policy quorlyth_work_uploads_delete_unsubmitted on storage.objects
for delete to authenticated
using (
  bucket_id = 'quorlyth-work-submissions'
  and cardinality(storage.foldername(name)) = 3
  and (storage.foldername(name))[3] = (select auth.uid())::text
  and not exists (
    select 1 from public.docs d
    where d.path ~ '^workSubmissions/[^/]+$'
      and jsonb_typeof(d.data->'attachments') = 'array'
      and exists (
        select 1 from jsonb_array_elements(coalesce(d.data->'attachments','[]'::jsonb)) attachment(value)
        where attachment.value->>'path' = objects.name
      )
  )
  and not exists (
    select 1 from public.docs d
    where d.path ~ '^standaloneArtifacts/[^/]+$'
      and jsonb_typeof(d.data->'attachments') = 'array'
      and exists (
        select 1 from jsonb_array_elements(coalesce(d.data->'attachments','[]'::jsonb)) attachment(value)
        where attachment.value->>'path' = objects.name
      )
  )
);

notify pgrst, 'reload schema';