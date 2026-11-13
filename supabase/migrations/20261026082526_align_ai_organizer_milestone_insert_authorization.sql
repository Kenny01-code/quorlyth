-- Keep the specialized AI-milestone insert guard aligned with the existing collaboration-milestone write authorization.
-- Approved AI organizers may add unassigned AI milestones; existing authorized project managers also may add milestones.
-- All structural and identity checks remain in the dedicated AI guard, while the fallback is constrained by the active-project,
-- team-participant, manager, and creator checks inside can_write_collaboration_milestone.

CREATE OR REPLACE FUNCTION private.can_insert_ai_organizer_milestone(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  project_data jsonb;
  idea_id text;
begin
  if uid is null
     or p_path is null
     or p_path !~ '^milestones/[A-Za-z0-9_-]{1,120}$'
     or p_data is null
     or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  idea_id := p_data->>'projectId';
  if p_data->>'createdBy' is distinct from uid
     or p_data->>'aiOrganized' is distinct from 'true'
     or p_data->>'status' is distinct from 'todo'
     or length(trim(coalesce(p_data->>'title', ''))) < 1
     or length(coalesce(p_data->>'title', '')) > 120
     or length(coalesce(p_data->>'description', '')) > 2000
     or p_data->>'priority' is null
     or p_data->>'priority' not in ('low', 'normal', 'high', 'critical')
     or p_data->>'assigneeId' is not null
     or p_data->>'dueAt' is not null
     or coalesce(p_data->>'blocked', 'false') <> 'false'
     or length(trim(coalesce(p_data->>'blockedNote', ''))) > 0
     or coalesce(p_data->>'at', '') !~ '^[0-9]{10,16}$'
     or coalesce(p_data->>'updatedAt', '') !~ '^[0-9]{10,16}$'
     or length(coalesce(p_data->>'acceptanceCriteria', '')) > 800 then
    return false;
  end if;

  select project.data into project_data
  from public.docs project
  where project.path = 'projects/' || idea_id
    and project.data->>'ideaId' = idea_id
    and project.data->>'status' = 'active';

  if project_data is null then
    return false;
  end if;

  return private.can_organize_idea_with_ai(project_data->>'ideaId')
      or private.can_write_collaboration_milestone(p_path, p_data);
end;
$function$;

revoke all on function private.can_insert_ai_organizer_milestone(text, jsonb) from public, anon;
grant execute on function private.can_insert_ai_organizer_milestone(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
