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
  community_manager boolean;
  linked_workspace_id text;
  task_id text;
  artifact_id text;
  task_data jsonb;
  artifact_data jsonb;
  milestone_id text;
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
  milestone_id := split_part(p_path, '/', 2);

  select p.data into project_data
  from public.docs p
  where p.path = 'projects/' || project_id;

  if project_data is null
     or project_data->>'ideaId' is distinct from project_id
     or project_data->>'status' is distinct from 'active' then
    return false;
  end if;

  community_manager := private.can_manage_community(private.idea_community_id(project_id));

  select workspace.data->>'id' into linked_workspace_id
  from public.docs workspace
  where workspace.path = 'standaloneProjects/' || (workspace.data->>'id')
    and workspace.data->>'status' = 'active'
    and workspace.data->>'linkedIdeaId' = project_id
    and coalesce(workspace.data->>'linkedIdeaProjectId', workspace.data->>'linkedIdeaId') = project_id
  order by coalesce((workspace.data->>'updatedAt')::bigint, (workspace.data->>'at')::bigint, 0) desc
  limit 1;

  manager := community_manager
    or (linked_workspace_id is not null and private.can_manage_standalone_project(linked_workspace_id));

  if not private.is_collaboration_workspace_participant(project_id)
     and not (linked_workspace_id is not null and private.can_manage_standalone_project(linked_workspace_id)) then
    return false;
  end if;

  select d.data into existing_data
  from public.docs d
  where d.path = p_path;

  if existing_data is null then
    return community_manager
      and p_data->>'createdBy' = uid
      and private.are_valid_collaboration_assignees(project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId', ''));
  end if;

  if existing_data->>'projectId' is distinct from project_id
     or existing_data->>'createdBy' is distinct from p_data->>'createdBy' then
    return false;
  end if;

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

  if p_data->>'status' = 'done' then
    task_id := nullif(p_data->>'workspaceTaskId', '');
    artifact_id := nullif(p_data->>'evidenceArtifactId', '');

    if task_id is not null and artifact_id is not null and linked_workspace_id is not null then
      select task.data into task_data
      from public.docs task
      where task.path = 'standaloneTasks/' || task_id;

      select artifact.data into artifact_data
      from public.docs artifact
      where artifact.path = 'standaloneArtifacts/' || artifact_id;

      if not (
        task_data is not null
        and artifact_data is not null
        and task_data->>'projectId' = linked_workspace_id
        and task_data->>'milestoneId' = milestone_id
        and task_data->>'status' = 'done'
        and artifact_data->>'projectId' = linked_workspace_id
        and artifact_data->>'taskId' = task_id
        and artifact_data->>'status' = 'approved'
        and artifact_data->>'reviewedBy' = uid
        and artifact_data->>'reviewedBy' is distinct from artifact_data->>'submittedBy'
        and (
          (artifact_data->>'provider' = 'github' and artifact_data->>'verificationStatus' = 'source_verified')
          or (
            artifact_data->>'provider' = 'manual'
            and artifact_data->>'verificationStatus' = 'submitted_evidence'
            and (
              nullif(artifact_data->>'url', '') is not null
              or (jsonb_typeof(artifact_data->'attachments') = 'array' and jsonb_array_length(artifact_data->'attachments') > 0)
            )
          )
        )
      ) then
        return false;
      end if;

      if not community_manager then
        return (p_data - 'status' - 'workspaceTaskId' - 'evidenceArtifactId' - 'updatedAt')
          is not distinct from (existing_data - 'status' - 'workspaceTaskId' - 'evidenceArtifactId' - 'updatedAt');
      end if;
      return private.are_valid_collaboration_assignees(project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId', ''));
    end if;

    if not community_manager then return false; end if;
    return exists (
      select 1
      from public.docs submission
      where submission.path ~ '^workSubmissions/[^/]+$'
        and submission.data->>'milestoneId' = milestone_id
        and submission.data->>'projectId' = project_id
        and submission.data->>'status' = 'approved'
        and submission.data->>'reviewedBy' = uid
        and submission.data->>'reviewedBy' is distinct from submission.data->>'submittedBy'
        and jsonb_typeof(submission.data->'attachments') = 'array'
        and jsonb_array_length(submission.data->'attachments') > 0
    );
  end if;

  if manager then
    if not community_manager then
      return (p_data - 'workspaceTaskId' - 'evidenceArtifactId' - 'updatedAt')
          is not distinct from (existing_data - 'workspaceTaskId' - 'evidenceArtifactId' - 'updatedAt')
        and p_data->>'status' is not distinct from existing_data->>'status';
    end if;
    return private.are_valid_collaboration_assignees(project_id, p_data->'assigneeIds', nullif(p_data->>'assigneeId', ''));
  end if;

  if (p_data - 'status' - 'updatedAt') is distinct from (existing_data - 'status' - 'updatedAt') then
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
