-- Fix insert-returning/upsert RLS checks for a newly created idea.
-- The row being returned may not yet be discoverable via nested docs lookups.
-- Use its candidate cid and authorId while still verifying the community's view permissions.
-- Insert policy still requires the caller as author and can_post_to_community; idea identity
-- fields are immutable after creation.

CREATE OR REPLACE FUNCTION private.can_read_doc(p_path text, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  item record;
  cid text;
  outcome_status text;
begin
  if p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then
    return uid is not null;
  end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$' then
    return false;
  end if;
  if p_path ~ '^requests/[^/]+$' or p_path ~ '^decisions/[^/]+$' then
    return (uid is not null and split_part(p_path,'/',2) = uid) or private.is_platform_admin();
  end if;
  if p_path = 'config/owner' then
    return private.is_platform_owner();
  end if;

  if p_path ~ '^communities/[^/]+$' then
    return private.can_view_community(split_part(p_path,'/',2));
  elsif p_path ~ '^ideas/[^/]+$' then
    -- During INSERT ... RETURNING, the new row may not be discoverable by nested queries.
    -- Prefer the candidate row for authorship while preserving community visibility.
    cid := coalesce(nullif(p_data->>'cid', ''), private.idea_community_id(split_part(p_path,'/',2)));
    return p_data->>'authorId' = uid
      or private.can_view_community(cid)
      or private.is_accepted_collaborator(split_part(p_path,'/',2));
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    return private.can_view_community(private.idea_community_id(split_part(p_path,'/',2)))
      or private.is_idea_author(split_part(p_path,'/',2));
  elsif p_path ~ '^profiles/[^/]+$' then
    return true; -- Profiles are intentionally public; private fields belong in data/users/{uid}.
  end if;

  if uid is null then return false; end if;
  if private.is_platform_admin() then return true; end if;

  if p_path ~ '^communityJoinRequests/[^/]+$' then
    cid := coalesce(p_data->>'cid', '');
    return p_path = 'communityJoinRequests/' || cid || '__' || coalesce(p_data->>'userId', '')
      and (
        p_data->>'userId' = uid
        or private.can_manage_community(cid)
      );
  elsif p_path ~ '^members/[^/]+$' then
    if split_part(p_path,'/',2) = uid then return true; end if;
    if jsonb_typeof(coalesce(p_data->'c','{}'::jsonb)) <> 'object' then return false; end if;
    for item in select key,value from jsonb_each(coalesce(p_data->'c','{}'::jsonb)) loop
      if item.value = 'true'::jsonb and not private.can_view_community(item.key) then
        return false;
      end if;
    end loop;
    return true;
  elsif p_path ~ '^votes/[^/]+$' then
    if split_part(p_path,'/',2) = uid then return true; end if;
    if jsonb_typeof(coalesce(p_data->'ideas','{}'::jsonb)) <> 'object' then return false; end if;
    for item in select key,value from jsonb_each(coalesce(p_data->'ideas','{}'::jsonb)) loop
      if item.value = 'true'::jsonb then
        cid := private.idea_community_id(item.key);
        if cid is null or not private.can_view_community(cid) then return false; end if;
      end if;
    end loop;
    return true;
  elsif p_path ~ '^reviews/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^ideaOutcomes/[^/]+$' then
    return private.can_view_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^projects/[^/]+$' then
    cid := private.idea_community_id(split_part(p_path,'/',2));
    select data->>'status' into outcome_status
    from public.docs where path = 'ideaOutcomes/' || split_part(p_path,'/',2);
    return private.can_manage_community(cid)
      or private.is_idea_author(split_part(p_path,'/',2))
      or private.is_accepted_collaborator(split_part(p_path,'/',2))
      or (private.can_view_community(cid) and outcome_status in ('selected','promoted'));
  elsif p_path ~ '^milestones/[^/]+$' then
    select data->>'ideaId' into cid
    from public.docs where path = 'projects/' || (p_data->>'projectId');
    if cid is null then return false; end if;
    select data->>'status' into outcome_status from public.docs where path = 'ideaOutcomes/' || cid;
    return private.can_manage_community(private.idea_community_id(cid))
      or private.is_idea_author(cid)
      or private.is_accepted_collaborator(cid)
      or (private.can_view_community(private.idea_community_id(cid)) and outcome_status in ('selected','promoted'));
  elsif p_path ~ '^promotions/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^volunteers/[^/]+$' then
    cid := p_data->>'ideaId';
    return p_data->>'applicantId' = uid
      or private.can_manage_community(private.idea_community_id(cid))
      or private.is_idea_author(cid)
      or (
        p_data->>'status' = 'accepted'
        and private.is_accepted_collaborator(cid)
      );
  elsif p_path = 'settings/space' then
    return true; -- Read-only public feature flags/settings; writes are owner-controlled.
  elsif p_path like 'settings/%' then
    return private.is_platform_admin();
  elsif p_path ~ '^messages/[^/]+$' then
    return private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatReads/[^/]+$' then
    return p_data->>'userId' = uid;
  elsif p_path ~ '^chatPreferences/[^/]+$' or p_path ~ '^chatMessageHides/[^/]+$' then
    return p_data->>'userId' = uid and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatMessageReactions/[^/]+$'
     or p_path ~ '^chatMessageEdits/[^/]+$'
     or p_path ~ '^chatMessageTombstones/[^/]+$' then
    return private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^calls/[^/]+$' then
    return private.is_chat_call_participant(split_part(p_path,'/',2));
  elsif p_path ~ '^callSignals/[^/]+$' then
    return p_data->>'toId' = uid
      and private.is_chat_call_in_conversation(p_data->>'callId',p_data->>'conversationId');
  end if;
  return false;
end;
$function$
;

notify pgrst, 'reload schema';
