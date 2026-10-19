-- Per-community approval for using Organize with AI in collaboration workspaces.
-- Approved organizers have a narrow AI-plan permission; this does not grant community management or platform-admin privileges.

CREATE OR REPLACE FUNCTION private.valid_community_ai_organizer_request(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  cid text := p_data->>'cid';
  user_id text := p_data->>'userId';
  idea_id text := p_data->>'ideaId';
begin
  if p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object'
     or cid is null or cid !~ '^[A-Za-z0-9_-]{1,120}$'
     or user_id is null or length(user_id) < 10 or length(user_id) > 128
     or idea_id is null or idea_id !~ '^[A-Za-z0-9_-]{1,120}$'
     or p_path <> 'communityAiOrganizerRequests/' || cid || '__' || user_id
     or p_data->>'status' is null or p_data->>'status' not in ('pending', 'approved', 'declined')
     or coalesce(p_data->>'at', '') !~ '^[0-9]{10,16}$'
     or length(coalesce(p_data->>'message', '')) > 500 then
    return false;
  end if;

  return exists (
    select 1 from public.docs c
    where c.path = 'communities/' || cid
  ) and exists (
    select 1 from public.docs i
    where i.path = 'ideas/' || idea_id
      and i.data->>'cid' = cid
  );
end;
$function$


CREATE OR REPLACE FUNCTION private.can_organize_idea_with_ai(p_idea_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select p_idea_id is not null and (
    private.can_manage_community(private.idea_community_id(p_idea_id))
    or (
      (
        private.is_idea_author(p_idea_id)
        or private.is_accepted_collaborator(p_idea_id)
      )
      and exists (
        select 1
        from public.docs r
        where r.path = 'communityAiOrganizerRequests/'
          || private.idea_community_id(p_idea_id) || '__' || (select auth.uid())::text
          and r.data->>'cid' = private.idea_community_id(p_idea_id)
          and r.data->>'userId' = (select auth.uid())::text
          and r.data->>'status' = 'approved'
      )
    )
  );
$function$


CREATE OR REPLACE FUNCTION private.can_read_ai_organizer_request(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select private.valid_community_ai_organizer_request(p_path, p_data)
    and (
      p_data->>'userId' = (select auth.uid())::text
      or private.can_manage_community(p_data->>'cid')
    );
$function$


CREATE OR REPLACE FUNCTION private.can_create_ai_organizer_request(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  cid text := p_data->>'cid';
  user_id text := p_data->>'userId';
  idea_id text := p_data->>'ideaId';
  previous jsonb;
  is_manager boolean;
begin
  if not private.valid_community_ai_organizer_request(p_path, p_data) then return false; end if;
  select d.data into previous from public.docs d where d.path = p_path;
  is_manager := private.can_manage_community(cid);

  -- Upserts must not allow creating or changing an approval decision unless a
  -- real pending request already exists and the actor manages this community.
  if is_manager then
    return previous is not null
      and previous->>'status' = 'pending'
      and p_data->>'status' in ('approved', 'declined')
      and p_data->>'cid' = previous->>'cid'
      and p_data->>'userId' = previous->>'userId'
      and p_data->>'ideaId' = previous->>'ideaId'
      and p_data->>'at' = previous->>'at'
      and coalesce(p_data->>'message', '') = coalesce(previous->>'message', '')
      and p_data->>'reviewedBy' = uid
      and coalesce(p_data->>'reviewedAt', '') ~ '^[0-9]{10,16}$';
  end if;

  if uid is null or user_id is distinct from uid
     or p_data->>'status' <> 'pending'
     or exists (
       select 1 from public.docs c
       where c.path = 'communities/' || cid
         and coalesce(c.data->>'arch', 'false') = 'true'
     )
     or not (
       private.is_member_of_community(cid)
       or private.is_idea_author(idea_id)
       or private.is_accepted_collaborator(idea_id)
     ) then
    return false;
  end if;

  if previous is null then
    return not is_manager;
  end if;

  -- Only the requester may resubmit a declined request.
  return previous->>'status' = 'declined'
    and previous->>'cid' = cid
    and previous->>'userId' = uid
    and not (p_data ? 'reviewedBy')
    and not (p_data ? 'reviewedAt');
end;
$function$


CREATE OR REPLACE FUNCTION private.can_update_ai_organizer_request(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
begin
  if not private.valid_community_ai_organizer_request(p_path, p_data) then return false; end if;

  if private.can_manage_community(p_data->>'cid') then
    return p_data->>'status' = 'pending';
  end if;

  return p_data->>'userId' = (select auth.uid())::text
    and p_data->>'status' = 'declined';
end;
$function$


CREATE OR REPLACE FUNCTION private.can_save_ai_organizer_request(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  previous jsonb;
  cid text := p_data->>'cid';
  user_id text := p_data->>'userId';
  idea_id text := p_data->>'ideaId';
begin
  if not private.valid_community_ai_organizer_request(p_path, p_data) then return false; end if;
  select d.data into previous from public.docs d where d.path = p_path;
  if previous is null then return false; end if;

  if private.can_manage_community(cid) then
    return previous->>'status' = 'pending'
      and p_data->>'status' in ('approved', 'declined')
      and p_data->>'cid' = previous->>'cid'
      and p_data->>'userId' = previous->>'userId'
      and p_data->>'ideaId' = previous->>'ideaId'
      and p_data->>'at' = previous->>'at'
      and coalesce(p_data->>'message', '') = coalesce(previous->>'message', '')
      and p_data->>'reviewedBy' = uid
      and coalesce(p_data->>'reviewedAt', '') ~ '^[0-9]{10,16}$';
  end if;

  return uid is not null
    and user_id = uid
    and previous->>'status' = 'declined'
    and p_data->>'status' = 'pending'
    and p_data->>'cid' = previous->>'cid'
    and p_data->>'userId' = previous->>'userId'
    and not (p_data ? 'reviewedBy')
    and not (p_data ? 'reviewedAt')
    and (
      private.is_member_of_community(cid)
      or private.is_idea_author(idea_id)
      or private.is_accepted_collaborator(idea_id)
    );
end;
$function$


CREATE OR REPLACE FUNCTION private.can_update_ai_organizer_project_brief(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  idea_id text;
  current_data jsonb;
begin
  if p_path is null or p_path !~ '^projects/[A-Za-z0-9_-]{1,120}$'
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  idea_id := split_part(p_path, '/', 2);
  if p_data->>'ideaId' is distinct from idea_id
     or length(trim(coalesce(p_data->>'summary', ''))) < 1
     or length(coalesce(p_data->>'summary', '')) > 1200
     or coalesce(p_data->>'updatedAt', '') !~ '^[0-9]{10,16}$'
     or not private.can_organize_idea_with_ai(idea_id) then
    return false;
  end if;

  select d.data into current_data from public.docs d where d.path = p_path;
  if current_data is null then return false; end if;

  -- Only the summary and updatedAt timestamp may change under this narrow grant.
  return (p_data - 'summary' - 'updatedAt')
    is not distinct from (current_data - 'summary' - 'updatedAt');
end;
$function$


CREATE OR REPLACE FUNCTION private.can_insert_ai_organizer_milestone(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  milestone_id text;
  project_data jsonb;
  idea_id text;
begin
  if uid is null or p_path is null or p_path !~ '^milestones/[A-Za-z0-9_-]{1,120}$'
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  milestone_id := split_part(p_path, '/', 2);
  idea_id := p_data->>'projectId';
  if p_data->>'createdBy' is distinct from uid
     or p_data->>'status' is distinct from 'todo'
     or length(trim(coalesce(p_data->>'title', ''))) < 1
     or length(coalesce(p_data->>'title', '')) > 120
     or length(coalesce(p_data->>'description', '')) > 2000
     or p_data->>'priority' is null or p_data->>'priority' not in ('low', 'normal', 'high', 'critical')
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

  if project_data is null then return false; end if;
  return private.can_organize_idea_with_ai(project_data->>'ideaId');
end;
$function$


revoke all on function private.valid_community_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_organize_idea_with_ai(text) from public, anon;
revoke all on function private.can_read_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_create_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_update_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_save_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_update_ai_organizer_project_brief(text, jsonb) from public, anon;
revoke all on function private.can_insert_ai_organizer_milestone(text, jsonb) from public, anon;
grant execute on function private.valid_community_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_organize_idea_with_ai(text) to authenticated;
grant execute on function private.can_read_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_create_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_update_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_save_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_update_ai_organizer_project_brief(text, jsonb) to authenticated;
grant execute on function private.can_insert_ai_organizer_milestone(text, jsonb) to authenticated;


drop policy if exists docs_read_ai_organizer_requests on public.docs;
create policy docs_read_ai_organizer_requests on public.docs for select to authenticated
using (private.can_read_ai_organizer_request(path, data));

drop policy if exists docs_insert_ai_organizer_requests on public.docs;
create policy docs_insert_ai_organizer_requests on public.docs for insert to authenticated
with check (private.can_create_ai_organizer_request(path, data));

drop policy if exists docs_update_ai_organizer_requests on public.docs;
create policy docs_update_ai_organizer_requests on public.docs for update to authenticated
using (private.can_update_ai_organizer_request(path, data))
with check (private.can_save_ai_organizer_request(path, data));

drop policy if exists docs_insert_ai_organizer_project_brief on public.docs;
create policy docs_insert_ai_organizer_project_brief on public.docs for insert to authenticated
with check (private.can_update_ai_organizer_project_brief(path, data));

drop policy if exists docs_update_ai_organizer_project_brief on public.docs;
create policy docs_update_ai_organizer_project_brief on public.docs for update to authenticated
using (private.can_update_ai_organizer_project_brief(path, data))
with check (private.can_update_ai_organizer_project_brief(path, data));

drop policy if exists docs_insert_ai_organizer_milestones on public.docs;
create policy docs_insert_ai_organizer_milestones on public.docs for insert to authenticated
with check (private.can_insert_ai_organizer_milestone(path, data));

notify pgrst, 'reload schema';
