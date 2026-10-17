-- Preserve shared milestone work while separating manager-only planning from contributor execution.
-- Managers may create/edit assignments and review/close milestones. Other workspace
-- participants may only start an open milestone they are allowed to work on.
create or replace function private.can_write_collaboration_milestone(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
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
      and p_data->>'createdBy' = uid;
  end if;

  -- Milestone ID is the path, and its project and creator are immutable.
  if existing_data->>'projectId' is distinct from project_id
     or existing_data->>'createdBy' is distinct from p_data->>'createdBy' then
    return false;
  end if;

  if manager then
    return true;
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
    and (
      nullif(existing_data->>'assigneeId', '') is null
      or existing_data->>'assigneeId' = uid
    );
end;
$function$;
