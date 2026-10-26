-- Allow explicitly selected current community members to post in owner/moderator-only communities.
-- Moderator IDs are not global management grants. They permit posting only while the moderator
-- remains a community member, and all existing global account approval checks remain in force.
-- The owner and platform admins retain the existing can_manage_community bypass.

CREATE OR REPLACE FUNCTION private.can_post_to_community(p_cid text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare c jsonb; approval_required boolean := false;
begin
  if (select auth.uid()) is null then return false; end if;

  select data into c from public.docs where path = 'communities/' || p_cid;
  if c is null or coalesce(c->>'arch','false') = 'true' then return false; end if;
  if private.can_manage_community(p_cid) then return true; end if;

  select coalesce((data->>'appr')::boolean,false) into approval_required
  from public.docs where path = 'settings/space';
  if approval_required and not exists (
    select 1 from public.docs d
    where d.path = 'decisions/' || (select auth.uid())::text
      and d.data->>'status' = 'approved'
  ) then return false; end if;

  return coalesce(c->>'post','members') = 'anyone'
    or (coalesce(c->>'post','members') = 'members' and private.is_member_of_community(p_cid))
    or (c->>'post' = 'owner'
      and coalesce(c->'moderatorIds','[]'::jsonb) ? ((select auth.uid())::text)
      and private.is_member_of_community(p_cid));
end;
$function$
;

notify pgrst, 'reload schema';
