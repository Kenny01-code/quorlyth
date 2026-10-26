CREATE OR REPLACE FUNCTION private.can_insert_standalone_doc(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
      and private.are_valid_standalone_assignees(
        project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId','')
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
      or not private.can_submit_milestone_work(project_id, p_data->>'taskId')
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

CREATE OR REPLACE FUNCTION private.can_submit_milestone_work(p_idea_id text, p_milestone_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
      and case
        when jsonb_typeof(milestone_data->'assigneeIds') = 'array' then
          case when jsonb_array_length(milestone_data->'assigneeIds') > 0
            then milestone_data->'assigneeIds' ? uid
            else (nullif(milestone_data->>'assigneeId','') is null or milestone_data->>'assigneeId' = uid)
          end
        else (nullif(milestone_data->>'assigneeId','') is null or milestone_data->>'assigneeId' = uid)
      end
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
    and case
        when jsonb_typeof(milestone_data->'assigneeIds') = 'array' then
          case when jsonb_array_length(milestone_data->'assigneeIds') > 0
            then milestone_data->'assigneeIds' ? uid
            else (nullif(milestone_data->>'assigneeId','') is null or milestone_data->>'assigneeId' = uid)
          end
        else (nullif(milestone_data->>'assigneeId','') is null or milestone_data->>'assigneeId' = uid)
      end
    and private.can_access_work_idea(p_idea_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_update_standalone_doc(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
      or p_data->>'invitedBy' is distinct from old_data->>'invitedBy' then
      return false;
    end if;
    -- An invitee can accept their own invite, but cannot change their role.
    if old_data->>'userId' = uid and old_data->>'status' = 'invited'
      and p_data->>'status' in ('invited','active')
      and (p_data - 'status' - 'updatedAt') is not distinct from (old_data - 'status' - 'updatedAt') then
      return true;
    end if;
    return private.can_manage_standalone_project(project_id)
      and old_data->>'userId' <> uid
      and old_data->>'role' <> 'owner'
      and p_data->>'role' in ('manager','contributor','viewer')
      and (
        p_data->>'role' <> 'manager'
        or old_data->>'role' = 'manager'
        or exists (
          select 1 from public.docs project
          where project.path = 'standaloneProjects/' || project_id
            and project.data->>'createdBy' = uid
        )
      )
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
    -- Starting an assigned task is reserved for a selected teammate.
    -- Managers can still edit task details/reassign it, but cannot start work on
    -- behalf of someone who was assigned to do the work.
    if old_data->>'status' = 'todo' and p_data->>'status' = 'in_progress' then
      if not private.is_standalone_project_member(project_id, array['owner','manager','contributor']::text[])
         or not private.are_valid_standalone_assignees(
           project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId','')
         ) then
        return false;
      end if;
      if jsonb_typeof(old_data->'assigneeIds') = 'array'
         and jsonb_array_length(old_data->'assigneeIds') > 0 then
        return (old_data->'assigneeIds') ? uid
          and (p_data - 'status' - 'updatedAt') is not distinct from (old_data - 'status' - 'updatedAt');
      elsif nullif(old_data->>'assigneeId','') is not null then
        return old_data->>'assigneeId' = uid
          and (p_data - 'status' - 'updatedAt') is not distinct from (old_data - 'status' - 'updatedAt');
      else
        return p_data->>'assigneeId' = uid
          and p_data->'assigneeIds' = jsonb_build_array(uid)
          and (p_data - 'status' - 'updatedAt' - 'assigneeId' - 'assigneeIds')
              is not distinct from (old_data - 'status' - 'updatedAt' - 'assigneeId' - 'assigneeIds');
      end if;
    end if;
    if private.can_manage_standalone_project(project_id) then
      return length(trim(coalesce(p_data->>'title',''))) between 2 and 140
        and private.are_valid_standalone_assignees(
          project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId','')
        );
    end if;
    return p_data->>'status' = 'in_progress'
      and old_data->>'status' = 'todo'
      and private.are_valid_standalone_assignees(
        project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId','')
      )
      and (
        (
          coalesce(nullif(old_data->>'assigneeId',''), '') = ''
          and (
            old_data->'assigneeIds' is null
            or old_data->'assigneeIds' = 'null'::jsonb
            or old_data->'assigneeIds' = '[]'::jsonb
          )
          and p_data->>'assigneeId' = uid
          and p_data->'assigneeIds' = jsonb_build_array(uid)
        )
        or (
          (
            old_data->>'assigneeId' = uid
            or coalesce(old_data->'assigneeIds','[]'::jsonb) ? uid
          )
          and p_data->>'assigneeId' is not distinct from old_data->>'assigneeId'
          and p_data->'assigneeIds' is not distinct from old_data->'assigneeIds'
        )
      )
      and (p_data - 'status' - 'updatedAt' - 'assigneeId' - 'assigneeIds')
          is not distinct from (old_data - 'status' - 'updatedAt' - 'assigneeId' - 'assigneeIds')
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

CREATE OR REPLACE FUNCTION private.can_write_collaboration_milestone(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  project_id text;
  project_data jsonb;
  existing_data jsonb;
  manager boolean;
begin
  if uid is null
     or p_path is null
     or p_path !~ '^milestones/[^/]+$'
     or p_data is null
     or pg_catalog.jsonb_typeof(p_data) <> 'object' then
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

  manager := private.can_manage_community(private.idea_community_id(project_id));

  select d.data into existing_data
  from public.docs d
  where d.path = p_path;

  if existing_data is null then
    -- Creating milestones is project management, not contributor execution.
    return manager
      and p_data->>'createdBy' = uid
      and private.are_valid_collaboration_assignees(project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId', ''));
  end if;

  -- Milestone ID is the path, and its project and creator are immutable.
  if existing_data->>'projectId' is distinct from project_id
     or existing_data->>'createdBy' is distinct from p_data->>'createdBy' then
    return false;
  end if;

  -- A status transition into "in progress" must be initiated by an assignee,
  -- not merely by a manager who assigned the work.
  if existing_data->>'status' = 'todo' and p_data->>'status' = 'in_progress' then
    if coalesce(existing_data->>'blocked', 'false') = 'true'
       or not private.are_valid_collaboration_assignees(project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId', '')) then
      return false;
    end if;
    if jsonb_typeof(existing_data->'assigneeIds') = 'array'
       and jsonb_array_length(existing_data->'assigneeIds') > 0 then
      return (existing_data->'assigneeIds') ? uid
        and (p_data - 'status' - 'updatedAt') is not distinct from (existing_data - 'status' - 'updatedAt');
    elsif nullif(existing_data->>'assigneeId', '') is not null then
      return existing_data->>'assigneeId' = uid
        and (p_data - 'status' - 'updatedAt') is not distinct from (existing_data - 'status' - 'updatedAt');
    else
      return (p_data - 'status' - 'updatedAt') is not distinct from (existing_data - 'status' - 'updatedAt');
    end if;
  end if;

  if manager then
    return private.are_valid_collaboration_assignees(project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId', ''));
  end if;

  -- Contributors cannot edit scope, acceptance criteria, assignee, due date,
  -- priority, or blocking state. Their only permissible mutation is the
  -- one-way transition from queued to in-progress, when the milestone is open
  -- and is either unassigned or assigned to the current contributor.
  if (p_data - 'status' - 'updatedAt')
       is distinct from (existing_data - 'status' - 'updatedAt') then
    return false;
  end if;

  if p_data->>'status' is not distinct from existing_data->>'status' then
    return true;
  end if;

  return existing_data->>'status' = 'todo'
    and p_data->>'status' = 'in_progress'
    and coalesce(existing_data->>'blocked', 'false') <> 'true'
    and case
      when jsonb_typeof(existing_data->'assigneeIds') = 'array' then
        case when jsonb_array_length(existing_data->'assigneeIds') > 0
          then (existing_data->'assigneeIds') ? uid
          else (nullif(existing_data->>'assigneeId', '') is null or existing_data->>'assigneeId' = uid)
        end
      else (nullif(existing_data->>'assigneeId', '') is null or existing_data->>'assigneeId' = uid)
    end;
end;
$function$;
NOTIFY pgrst, 'reload schema';
