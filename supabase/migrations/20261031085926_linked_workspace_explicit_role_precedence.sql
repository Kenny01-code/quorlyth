CREATE OR REPLACE FUNCTION private.is_standalone_project_member(p_project_id text, p_roles text[] DEFAULT ARRAY['owner'::text, 'manager'::text, 'contributor'::text, 'viewer'::text])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select p_project_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.docs project
      where project.path = 'standaloneProjects/' || p_project_id
        and project.data->>'id' = p_project_id
        and (
          project.data->>'createdBy' = (select auth.uid())::text
          or (
            exists (
              select 1 from public.docs member
              where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || (select auth.uid())::text
                and member.data->>'projectId' = p_project_id
                and member.data->>'userId' = (select auth.uid())::text
            )
            and exists (
              select 1 from public.docs member
              where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || (select auth.uid())::text
                and member.data->>'projectId' = p_project_id
                and member.data->>'userId' = (select auth.uid())::text
                and member.data->>'status' = 'active'
                and member.data->>'role' = any(p_roles)
            )
          )
          or (
            not exists (
              select 1 from public.docs member
              where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || (select auth.uid())::text
                and member.data->>'projectId' = p_project_id
                and member.data->>'userId' = (select auth.uid())::text
            )
            and nullif(project.data->>'linkedIdeaId', '') is not null
            and p_roles && array['contributor'::text, 'viewer'::text]
            and private.is_collaboration_workspace_participant(project.data->>'linkedIdeaId')
          )
        )
    );
$function$;

CREATE OR REPLACE FUNCTION private.is_valid_standalone_assignee(p_project_id text, p_assignee_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  explicit_member jsonb;
begin
  if p_project_id is null then return false; end if;
  if nullif(btrim(coalesce(p_assignee_id, '')), '') is null then return true; end if;

  select member.data into explicit_member
  from public.docs member
  where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || p_assignee_id
    and member.data->>'projectId' = p_project_id
    and member.data->>'userId' = p_assignee_id;

  if explicit_member is not null then
    return explicit_member->>'status' = 'active'
      and explicit_member->>'role' in ('owner','manager','contributor');
  end if;

  return exists (
    select 1 from public.docs project
    where project.path = 'standaloneProjects/' || p_project_id
      and project.data->>'id' = p_project_id
      and project.data->>'createdBy' = p_assignee_id
  ) or exists (
    select 1
    from public.docs workspace
    join public.docs idea on idea.path = 'ideas/' || (workspace.data->>'linkedIdeaId')
    where workspace.path = 'standaloneProjects/' || p_project_id
      and workspace.data->>'id' = p_project_id
      and nullif(workspace.data->>'linkedIdeaId', '') is not null
      and (
        idea.data->>'authorId' = p_assignee_id
        or exists (
          select 1 from public.docs community
          where community.path = 'communities/' || (idea.data->>'cid')
            and (community.data->>'ownerId' = p_assignee_id or community.data->>'createdBy' = p_assignee_id)
        )
        or exists (
          select 1 from public.docs volunteer
          where volunteer.path ~ '^volunteers/[^/]+$'
            and volunteer.data->>'ideaId' = workspace.data->>'linkedIdeaId'
            and volunteer.data->>'applicantId' = p_assignee_id
            and volunteer.data->>'status' = 'accepted'
        )
      )
  );
end;
$function$;
