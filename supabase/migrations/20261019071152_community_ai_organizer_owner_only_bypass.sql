-- Community owners are the only users with automatic AI organizer access.
-- Platform owners/admins can review requests but must be approved to organize communities they do not own.
-- Restrictive RLS checks and a project-summary trigger keep platform-admin document privileges from bypassing approval.

CREATE OR REPLACE FUNCTION private.owns_community(p_cid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select p_cid is not null and exists (
    select 1 from public.docs c
    where c.path = 'communities/' || p_cid
      and (
        (nullif(c.data->>'ownerId', '') is not null and c.data->>'ownerId' = (select auth.uid())::text)
        or (nullif(c.data->>'ownerId', '') is null and nullif(c.data->>'createdBy', '') is not null and c.data->>'createdBy' = (select auth.uid())::text)
        or (nullif(c.data->>'ownerId', '') is null and nullif(c.data->>'createdBy', '') is null and private.is_platform_owner())
      )
  );
$function$;

CREATE OR REPLACE FUNCTION private.can_organize_idea_with_ai(p_idea_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select p_idea_id is not null and (
    private.owns_community(private.idea_community_id(p_idea_id))
    or (
      (
        private.is_idea_author(p_idea_id)
        or private.is_accepted_collaborator(p_idea_id)
        or private.is_platform_admin()
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
$function$;

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
$function$;

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
begin
  if not private.valid_community_ai_organizer_request(p_path, p_data) then return false; end if;
  select d.data into previous from public.docs d where d.path = p_path;

  -- A community manager may review someone else's pending request, never their own.
  if private.can_manage_community(cid) and uid is distinct from user_id then
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
     or private.owns_community(cid)
     or p_data->>'status' <> 'pending'
     or exists (
       select 1 from public.docs c
       where c.path = 'communities/' || cid
         and coalesce(c.data->>'arch', 'false') = 'true'
     )
     or not (
       private.is_idea_author(idea_id)
       or private.is_accepted_collaborator(idea_id)
       or private.is_platform_admin()
     ) then
    return false;
  end if;

  if previous is null then return true; end if;

  return previous->>'status' = 'declined'
    and previous->>'cid' = cid
    and previous->>'userId' = uid
    and not (p_data ? 'reviewedBy')
    and not (p_data ? 'reviewedAt');
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_update_ai_organizer_request(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
begin
  if not private.valid_community_ai_organizer_request(p_path, p_data) then return false; end if;

  if p_data->>'userId' = uid then
    return not private.owns_community(p_data->>'cid')
      and p_data->>'status' = 'declined';
  end if;

  return private.can_manage_community(p_data->>'cid')
    and p_data->>'status' = 'pending';
end;
$function$;

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

  -- A declined requester may resubmit, but cannot approve their own request.
  if uid is not null and user_id = uid and not private.owns_community(cid)
     and previous->>'status' = 'declined'
     and p_data->>'status' = 'pending'
     and p_data->>'cid' = previous->>'cid'
     and p_data->>'userId' = previous->>'userId'
     and not (p_data ? 'reviewedBy')
     and not (p_data ? 'reviewedAt')
     and (
       private.is_idea_author(idea_id)
       or private.is_accepted_collaborator(idea_id)
       or private.is_platform_admin()
     ) then
    return true;
  end if;

  if private.can_manage_community(cid) and uid is distinct from user_id then
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

  return false;
end;
$function$;

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
     or p_data->>'aiOrganizerGenerated' is distinct from 'true'
     or length(trim(coalesce(p_data->>'summary', ''))) < 1
     or length(coalesce(p_data->>'summary', '')) > 1200
     or coalesce(p_data->>'updatedAt', '') !~ '^[0-9]{10,16}$'
     or not private.can_organize_idea_with_ai(idea_id) then
    return false;
  end if;

  select d.data into current_data from public.docs d where d.path = p_path;
  if current_data is null then return false; end if;

  -- Only the summary and updatedAt timestamp may change under this narrow grant.
  return (p_data - 'summary' - 'updatedAt' - 'aiOrganizerGenerated')
    is not distinct from (current_data - 'summary' - 'updatedAt' - 'aiOrganizerGenerated');
end;
$function$;

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
     or p_data->>'aiOrganized' is distinct from 'true'
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
$function$;

CREATE OR REPLACE FUNCTION private.enforce_ai_organizer_summary_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  idea_id text;
begin
  if old.path ~ '^projects/[^/]+$'
     and new.path = old.path
     and (old.data->>'aiOrganizerGenerated' = 'true' or new.data->>'aiOrganizerGenerated' = 'true')
     and (new.data->>'summary') is distinct from (old.data->>'summary') then
    idea_id := coalesce(new.data->>'ideaId', old.data->>'ideaId');
    if not private.can_organize_idea_with_ai(idea_id) then
      raise exception 'AI organizer approval required from this community owner or a platform administrator before applying the generated project brief.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.owns_community(text) from public, anon;
revoke all on function private.valid_community_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_organize_idea_with_ai(text) from public, anon;
revoke all on function private.can_read_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_create_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_update_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_save_ai_organizer_request(text, jsonb) from public, anon;
revoke all on function private.can_update_ai_organizer_project_brief(text, jsonb) from public, anon;
revoke all on function private.can_insert_ai_organizer_milestone(text, jsonb) from public, anon;
revoke all on function private.enforce_ai_organizer_summary_approval() from public, anon;
grant execute on function private.owns_community(text) to authenticated;
grant execute on function private.valid_community_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_organize_idea_with_ai(text) to authenticated;
grant execute on function private.can_read_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_create_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_update_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_save_ai_organizer_request(text, jsonb) to authenticated;
grant execute on function private.can_update_ai_organizer_project_brief(text, jsonb) to authenticated;
grant execute on function private.can_insert_ai_organizer_milestone(text, jsonb) to authenticated;
grant execute on function private.enforce_ai_organizer_summary_approval() to authenticated;

drop trigger if exists enforce_ai_organizer_summary_approval on public.docs;
create trigger enforce_ai_organizer_summary_approval
before update on public.docs
for each row execute function private.enforce_ai_organizer_summary_approval();

drop policy if exists docs_guard_ai_organizer_requests_insert on public.docs;
create policy docs_guard_ai_organizer_requests_insert on public.docs
as restrictive for insert to authenticated
with check (
  path !~ '^communityAiOrganizerRequests/[^/]+$'
  or private.can_create_ai_organizer_request(path, data)
);

drop policy if exists docs_guard_ai_organizer_requests_update on public.docs;
create policy docs_guard_ai_organizer_requests_update on public.docs
as restrictive for update to authenticated
using (
  path !~ '^communityAiOrganizerRequests/[^/]+$'
  or private.can_update_ai_organizer_request(path, data)
)
with check (
  path !~ '^communityAiOrganizerRequests/[^/]+$'
  or private.can_save_ai_organizer_request(path, data)
);

drop policy if exists docs_guard_ai_organizer_milestones_insert on public.docs;
create policy docs_guard_ai_organizer_milestones_insert on public.docs
as restrictive for insert to authenticated
with check (
  path !~ '^milestones/[^/]+$'
  or data->>'aiOrganized' is distinct from 'true'
  or private.can_insert_ai_organizer_milestone(path, data)
);

notify pgrst, 'reload schema';
