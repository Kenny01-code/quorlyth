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
      and private.is_valid_collaboration_assignee(project_id, nullif(p_data->>'assigneeId', ''));
  end if;

  -- Milestone ID is the path, and its project and creator are immutable.
  if existing_data->>'projectId' is distinct from project_id
     or existing_data->>'createdBy' is distinct from p_data->>'createdBy' then
    return false;
  end if;

  if manager then
    return private.is_valid_collaboration_assignee(project_id, nullif(p_data->>'assigneeId', ''));
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

CREATE OR REPLACE FUNCTION private.is_valid_collaboration_assignee(p_idea_id text, p_assignee_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
begin
  if p_idea_id is null then return false; end if;
  if nullif(btrim(coalesce(p_assignee_id, '')), '') is null then return true; end if;

  if exists (
    select 1 from public.docs idea
    where idea.path = 'ideas/' || p_idea_id
      and idea.data->>'authorId' = p_assignee_id
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.docs community
    where community.path = 'communities/' || private.idea_community_id(p_idea_id)
      and (
        community.data->>'ownerId' = p_assignee_id
        or community.data->>'createdBy' = p_assignee_id
      )
  ) then
    return true;
  end if;

  return exists (
    select 1 from public.docs v
    where v.path ~ '^volunteers/[^/]+$'
      and v.data->>'ideaId' = p_idea_id
      and v.data->>'applicantId' = p_assignee_id
      and v.data->>'status' = 'accepted'
  );
end;
$function$;

revoke all on function private.is_valid_collaboration_assignee(text,text) from public, anon, authenticated;
notify pgrst, 'reload schema';
