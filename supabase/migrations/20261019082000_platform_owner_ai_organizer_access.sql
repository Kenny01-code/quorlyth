-- Platform owners have automatic AI organizer access across all communities.
-- Community owners retain automatic access only in communities they own.
-- Platform admins who are not platform owners must still be approved before organizing.

CREATE OR REPLACE FUNCTION private.can_organize_idea_with_ai(p_idea_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select p_idea_id is not null and (
    private.is_platform_owner()
    or private.owns_community(private.idea_community_id(p_idea_id))
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

  -- A manager may review someone else's pending request, but never their own.
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

  -- Platform owners and community owners already have access and must not
  -- create approval requests for themselves.
  if uid is null or user_id is distinct from uid
     or private.is_platform_owner()
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

revoke all on function private.can_organize_idea_with_ai(text) from public, anon;
revoke all on function private.can_create_ai_organizer_request(text, jsonb) from public, anon;
grant execute on function private.can_organize_idea_with_ai(text) to authenticated;
grant execute on function private.can_create_ai_organizer_request(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
