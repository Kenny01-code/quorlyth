-- Consolidate the overlapping public.docs policies into the existing
-- caller-aware predicate functions. This removes repeated permissive-policy
-- evaluation while preserving the same data boundaries for each operation.

create or replace function private.can_read_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
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
    return private.can_view_community(private.idea_community_id(split_part(p_path,'/',2)))
      or private.is_idea_author(split_part(p_path,'/',2));
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
      or (private.can_view_community(cid) and outcome_status in ('selected','promoted'));
  elsif p_path ~ '^milestones/[^/]+$' then
    select data->>'ideaId' into cid
    from public.docs where path = 'projects/' || (p_data->>'projectId');
    if cid is null then return false; end if;
    select data->>'status' into outcome_status from public.docs where path = 'ideaOutcomes/' || cid;
    return private.can_manage_community(private.idea_community_id(cid))
      or private.is_idea_author(cid)
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
$function$;

create or replace function private.can_insert_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  item record;
  cid text;
  project_idea text;
  review_status text;
begin
  if uid is null or p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  if p_path ~ '^communityJoinRequests/[^/]+$' then
    return private.can_request_community_join(p_path, p_data);
  end if;
  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then return true; end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$' then return false; end if;
  if p_path = 'config/owner' then return false; end if;

  if p_path ~ '^profiles/[^/]+$' then
    return split_part(p_path,'/',2) = uid;
  elsif p_path ~ '^members/[^/]+$' then
    if split_part(p_path,'/',2) <> uid or jsonb_typeof(coalesce(p_data->'c','{}'::jsonb)) <> 'object' then return false; end if;
    for item in select key,value from jsonb_each(coalesce(p_data->'c','{}'::jsonb)) loop
      if item.value not in ('true'::jsonb,'false'::jsonb) then return false; end if;
      if item.value = 'true'::jsonb and (
        (
          not exists (select 1 from public.docs c where c.path = 'communities/' || item.key
            and coalesce(c.data->>'arch','false') <> 'true')
          and not exists (select 1 from public.docs previous
            where previous.path = p_path and previous.data->'c'->>item.key = 'true')
        )
        or not private.can_view_community(item.key)
      ) then return false; end if;
    end loop;
    return true;
  elsif p_path ~ '^votes/[^/]+$' then
    if split_part(p_path,'/',2) <> uid or jsonb_typeof(coalesce(p_data->'ideas','{}'::jsonb)) <> 'object' then return false; end if;
    for item in select key,value from jsonb_each(coalesce(p_data->'ideas','{}'::jsonb)) loop
      if item.value not in ('true'::jsonb,'false'::jsonb) then return false; end if;
      if item.value = 'true'::jsonb then
        cid := private.idea_community_id(item.key);
        if cid is null or not private.can_view_community(cid) then return false; end if;
      end if;
    end loop;
    return true;
  elsif p_path ~ '^requests/[^/]+$' then
    return split_part(p_path,'/',2) = uid;
  elsif p_path ~ '^decisions/[^/]+$' then
    return private.is_platform_admin() and p_data->>'status' in ('approved','declined');
  end if;

  if p_path ~ '^ideaOutcomes/[^/]+$' then return false; end if;
  if private.is_platform_admin() then return true; end if;
  if p_path ~ '^communities/[^/]+$' then
    return p_data->>'ownerId' = uid and p_data->>'createdBy' = uid;
  elsif p_path ~ '^ideas/[^/]+$' then
    return p_data->>'authorId' = uid and private.can_post_to_community(p_data->>'cid');
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    return p_data->>'authorId' = uid
      and (
        private.can_post_to_community(private.idea_community_id(split_part(p_path,'/',2)))
        or private.is_collaboration_workspace_participant(split_part(p_path,'/',2))
      );
  elsif p_path ~ '^reviews/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^volunteers/[^/]+$' then
    cid := private.idea_community_id(p_data->>'ideaId');
    return (
      p_data->>'applicantId' = uid and coalesce(p_data->>'status','pending') = 'pending'
      and exists (select 1 from public.docs c where c.path = 'communities/' || cid
        and coalesce(c.data->>'arch','false') <> 'true')
      and (private.is_member_of_community(cid) or private.can_manage_community(cid))
    ) or (
      exists (select 1 from public.docs existing
        where existing.path = p_path
          and existing.data->>'ideaId' = p_data->>'ideaId'
          and existing.data->>'applicantId' = p_data->>'applicantId'
          and existing.data->>'at' = p_data->>'at')
      and private.can_manage_community(cid)
      and coalesce(p_data->>'status','pending') in ('pending','accepted','declined')
    );
  elsif p_path ~ '^projects/[^/]+$' then
    project_idea := split_part(p_path,'/',2);
    select data->>'status' into review_status from public.docs where path = 'reviews/' || project_idea;
    return p_data->>'ideaId' = project_idea and p_data->>'createdBy' = uid
      and private.can_manage_community(private.idea_community_id(project_idea))
      and review_status in ('selected','promoted');
  elsif p_path ~ '^milestones/[^/]+$' then
    return private.can_write_collaboration_milestone(p_path, p_data);
  elsif p_path ~ '^promotions/[^/]+$' then
    select data->>'status' into review_status from public.docs where path = 'reviews/' || (p_data->>'ideaId');
    return p_data->>'by' = uid and coalesce(p_data->>'status','draft') = 'draft'
      and review_status in ('selected','promoted')
      and private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path = 'settings/space' or p_path like 'settings/%' then
    return false;
  elsif p_path ~ '^conversations/[^/]+$' then
    return p_data->>'createdBy' = uid and jsonb_typeof(p_data->'members') = 'array'
      and (p_data->'members') ? uid
      and (
        (p_data->>'type' = 'direct' and jsonb_array_length(p_data->'members') = 2)
        or (p_data->>'type' = 'group' and jsonb_array_length(p_data->'members') between 3 and 100
          and length(trim(coalesce(p_data->>'title',''))) between 1 and 60)
      );
  elsif p_path ~ '^messages/[^/]+$' then
    return p_data->>'senderId' = uid
      and length(trim(coalesce(p_data->>'text',''))) between 1 and 4000
      and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatReads/[^/]+$' then
    return p_data->>'userId' = uid and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatPreferences/[^/]+$' or p_path ~ '^chatMessageHides/[^/]+$'
     or p_path ~ '^chatMessageReactions/[^/]+$' then
    return p_data->>'userId' = uid and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatMessageEdits/[^/]+$' or p_path ~ '^chatMessageTombstones/[^/]+$' then
    return p_data->>'senderId' = uid and private.is_chat_message_sender(split_part(p_path,'/',2))
      and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^calls/[^/]+$' then
    return p_data->>'callerId' <> p_data->>'calleeId'
      and private.is_chat_member(p_data->>'conversationId')
      and private.is_chat_user_member(p_data->>'conversationId', nullif(p_data->>'calleeId','')::uuid)
      and (
        p_data->>'callerId' = uid
        or exists (
          select 1 from public.docs existing
          where existing.path = p_path
            and existing.data->>'callerId' = p_data->>'callerId'
            and existing.data->>'calleeId' = p_data->>'calleeId'
            and existing.data->>'conversationId' = p_data->>'conversationId'
            and existing.data->>'mode' = p_data->>'mode'
            and existing.data->>'createdAt' = p_data->>'createdAt'
            and private.is_chat_call_participant(split_part(p_path,'/',2))
        )
      );
  elsif p_path ~ '^callSignals/[^/]+$' then
    return p_data->>'fromId' = uid
      and p_data->>'toId' <> uid
      and private.is_chat_call_in_conversation(p_data->>'callId',p_data->>'conversationId')
      and exists (
        select 1 from public.docs c where c.path = 'calls/' || (p_data->>'callId')
          and ((c.data->>'callerId' = uid and c.data->>'calleeId' = p_data->>'toId')
            or (c.data->>'calleeId' = uid and c.data->>'callerId' = p_data->>'toId'))
      );
  end if;
  return false;
end;
$function$;

create or replace function private.can_update_doc(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  idea_id text;
  cid text;
  item record;
begin
  if uid is null or p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;
  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then return true; end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$' or p_path = 'config/owner' or p_path ~ '^ideaOutcomes/[^/]+$' then return false; end if;
  if p_path ~ '^members/[^/]+$' then
    if split_part(p_path,'/',2) <> uid or jsonb_typeof(coalesce(p_data->'c','{}'::jsonb)) <> 'object' then return false; end if;
    for item in select key,value from jsonb_each(coalesce(p_data->'c','{}'::jsonb)) loop
      if item.value not in ('true'::jsonb,'false'::jsonb) then return false; end if;
      if item.value = 'true'::jsonb and not private.can_view_community(item.key) then return false; end if;
    end loop;
    return true;
  elsif p_path ~ '^profiles/[^/]+$' or p_path ~ '^votes/[^/]+$' or p_path ~ '^requests/[^/]+$' then
    return split_part(p_path,'/',2) = uid;
  elsif p_path ~ '^decisions/[^/]+$' then
    return private.is_platform_admin() and p_data->>'status' in ('approved','declined');
  elsif p_path ~ '^communityJoinRequests/[^/]+$' then
    cid := coalesce(p_data->>'cid', '');
    return p_path = 'communityJoinRequests/' || cid || '__' || coalesce(p_data->>'userId', '')
      and (
        private.can_manage_community(cid)
        or (p_data->>'userId' = uid and p_data->>'status' = 'declined')
        or private.can_request_community_join(p_path, p_data)
      );
  elsif p_path = 'settings/space' or p_path like 'settings/%' then
    return private.is_platform_admin();
  end if;

  if private.is_platform_admin() then return true; end if;
  if p_path ~ '^communities/[^/]+$' then
    return private.can_manage_community(split_part(p_path,'/',2));
  elsif p_path ~ '^ideas/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    return private.can_manage_community(private.idea_community_id(idea_id))
      or (private.is_idea_author(idea_id) and private.can_view_community(private.idea_community_id(idea_id)));
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    return private.can_manage_community(private.idea_community_id(idea_id)) or p_data->>'authorId' = uid;
  elsif p_path ~ '^reviews/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^volunteers/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^projects/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^milestones/[^/]+$' then
    return private.can_write_collaboration_milestone(p_path, p_data);
  elsif p_path ~ '^promotions/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^chatReads/[^/]+$' then
    return p_data->>'userId' = uid and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatPreferences/[^/]+$' or p_path ~ '^chatMessageHides/[^/]+$'
     or p_path ~ '^chatMessageReactions/[^/]+$' then
    return p_data->>'userId' = uid and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^chatMessageEdits/[^/]+$' or p_path ~ '^chatMessageTombstones/[^/]+$' then
    return p_data->>'senderId' = uid and private.is_chat_message_sender(split_part(p_path,'/',2))
      and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^calls/[^/]+$' then
    return private.is_chat_call_participant(split_part(p_path,'/',2));
  elsif p_path ~ '^callSignals/[^/]+$' then
    return false; -- ICE signals are append-only; each signal has a unique ID.
  end if;
  return false;
end;
$function$;

-- Keep one row-level policy per operation. The predicate functions above preserve
-- the scopes previously expressed by the additive community/collaboration policies.
drop policy if exists community_join_requests_read_scoped on public.docs;
drop policy if exists docs_read_accepted_collaborator_team on public.docs;
drop policy if exists docs_read_accepted_collaborator_workspace on public.docs;
drop policy if exists docs_read_collaboration_idea_author_applications on public.docs;
drop policy if exists docs_read_collaboration_idea_author_workspace on public.docs;

drop policy if exists community_join_requests_insert_scoped on public.docs;
drop policy if exists docs_insert_accepted_collaborator_workspace on public.docs;

drop policy if exists community_join_requests_update_scoped on public.docs;
drop policy if exists docs_update_accepted_collaborator_milestones on public.docs;
drop policy if exists docs_update_collaboration_participant_milestones on public.docs;

comment on policy docs_read_scoped on public.docs is
  'Single consolidated read policy enforcing public visibility plus caller-scoped community, private-vault, chat, join-request, and collaboration access.';
comment on policy docs_insert_scoped on public.docs is
  'Single consolidated insert policy enforcing caller-scoped document creation, community join requests, and collaboration writes.';
comment on policy docs_update_scoped on public.docs is
  'Single consolidated update policy enforcing caller-scoped document updates, join-request transitions, and collaboration milestone identity.';
