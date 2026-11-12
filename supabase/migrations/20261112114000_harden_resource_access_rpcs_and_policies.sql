-- Harden the resource-access RPC boundary and consolidate docs RLS policies.
-- Public RPC wrappers are SECURITY INVOKER; privileged writes run only in private
-- SECURITY DEFINER functions with auth.uid()-based reviewer/requester checks.

create or replace function private.submit_resource_access_request(
  p_resource_type text,
  p_resource_id text,
  p_message text default ''
)
returns void
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_path text;
  v_resource jsonb;
  v_previous jsonb;
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_message text := left(btrim(coalesce(p_message, '')), 500);
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null
    or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or length(p_resource_id) < 1
    or length(p_resource_id) > 120
    or p_resource_id ~ '[^A-Za-z0-9_-]'
    or length(coalesce(p_message, '')) > 500 then
    raise exception 'Invalid resource access request' using errcode = '22023';
  end if;

  if p_resource_type in ('community', 'idea') then
    if p_resource_type = 'community' then
      v_community_id := p_resource_id;
    else
      select idea.data->>'cid' into v_community_id
      from public.docs idea
      where idea.path = 'ideas/' || p_resource_id;
    end if;

    select community.data into v_resource
    from public.docs community
    where community.path = 'communities/' || v_community_id;

    if v_resource is null
      or coalesce(v_resource->>'vis', 'listed') <> 'unlisted'
      or coalesce(v_resource->>'arch', 'false') = 'true'
      or v_resource->>'ownerId' = v_uid::text
      or v_resource->>'createdBy' = v_uid::text
      or private.is_member_of_community(v_community_id) then
      raise exception 'This community or idea is not accepting a resource access request' using errcode = '42501';
    end if;
  else
    select resource.data into v_resource
    from public.docs resource
    where resource.path = 'standaloneProjects/' || p_resource_id
      and resource.data->>'id' = p_resource_id;

    if v_resource is null
      or coalesce(v_resource->>'status', 'active') <> 'active'
      or coalesce(v_resource->>'linkedIdeaId', '') <> ''
      or v_resource->>'createdBy' = v_uid::text
      or exists (
        select 1
        from public.docs member
        where member.path = 'standaloneProjectMembers/' || p_resource_id || '__' || v_uid::text
          and member.data->>'projectId' = p_resource_id
          and member.data->>'userId' = v_uid::text
          and member.data->>'status' in ('active', 'invited')
      ) then
      raise exception 'This standalone workspace is not accepting a resource access request' using errcode = '42501';
    end if;
  end if;

  v_path := 'resourceAccessRequests/' || p_resource_type || '__' ||
    p_resource_id || '__' || v_uid::text;

  select request.data into v_previous
  from public.docs request
  where request.path = v_path
  for update;

  if v_previous->>'status' = 'pending' then
    raise exception 'Your access request is already waiting for review' using errcode = '23505';
  end if;
  if v_previous->>'status' = 'approved' then
    raise exception 'Your access to this resource has already been approved' using errcode = '23505';
  end if;

  v_payload := jsonb_build_object(
    'resourceType', p_resource_type,
    'resourceId', p_resource_id,
    'userId', v_uid::text,
    'message', v_message,
    'status', 'pending',
    'requestedAt', v_now_ms
  );

  if v_previous is null then
    insert into public.docs(path, data) values (v_path, v_payload);
  else
    update public.docs
    set data = v_payload,
        updated_at = now()
    where path = v_path;
  end if;
end;
$function$;

create or replace function private.review_resource_access_request(
  p_resource_type text,
  p_resource_id text,
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_path text;
  v_request jsonb;
  v_resource jsonb;
  v_membership jsonb;
  v_community_id text;
  v_role text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null
    or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or length(p_resource_id) < 1
    or length(p_resource_id) > 120
    or p_resource_id ~ '[^A-Za-z0-9_-]'
    or p_user_id is null
    or p_status is null
    or p_status not in ('approved', 'declined') then
    raise exception 'Invalid resource access decision' using errcode = '22023';
  end if;
  if not private.can_review_resource_access(p_resource_type, p_resource_id) then
    raise exception 'Only this resource owner or an active workspace manager can review its access requests'
      using errcode = '42501';
  end if;

  v_path := 'resourceAccessRequests/' || p_resource_type || '__' ||
    p_resource_id || '__' || p_user_id::text;

  select request.data into v_request
  from public.docs request
  where request.path = v_path
    and request.data->>'resourceType' = p_resource_type
    and request.data->>'resourceId' = p_resource_id
    and request.data->>'userId' = p_user_id::text
    and request.data->>'status' = 'pending'
  for update;

  if v_request is null then
    raise exception 'Pending access request not found' using errcode = 'P0002';
  end if;
  if p_user_id = v_actor then
    raise exception 'You cannot approve your own access request' using errcode = '42501';
  end if;

  update public.docs
  set data = v_request || jsonb_build_object(
    'status', p_status,
    'reviewedBy', v_actor::text,
    'reviewedAt', v_now_ms
  ),
  updated_at = now()
  where path = v_path;

  if p_status <> 'approved' then
    return;
  end if;

  if p_resource_type in ('community', 'idea') then
    if p_resource_type = 'community' then
      v_community_id := p_resource_id;
    else
      select idea.data->>'cid' into v_community_id
      from public.docs idea
      where idea.path = 'ideas/' || p_resource_id;
    end if;

    select community.data into v_resource
    from public.docs community
    where community.path = 'communities/' || v_community_id;

    if v_resource is null or coalesce(v_resource->>'arch', 'false') = 'true' then
      raise exception 'This community is no longer available for access approval' using errcode = 'P0002';
    end if;

    insert into public.docs as existing(path, data)
    values (
      'members/' || p_user_id::text,
      jsonb_build_object('c', jsonb_build_object(v_community_id, true))
    )
    on conflict(path) do update
    set data = jsonb_set(
      coalesce(existing.data, '{}'::jsonb),
      '{c}',
      coalesce(existing.data->'c', '{}'::jsonb) || jsonb_build_object(v_community_id, true),
      true
    ),
    updated_at = now();
    return;
  end if;

  select resource.data into v_resource
  from public.docs resource
  where resource.path = 'standaloneProjects/' || p_resource_id
    and resource.data->>'id' = p_resource_id
    and coalesce(resource.data->>'status', 'active') = 'active'
    and coalesce(resource.data->>'linkedIdeaId', '') = '';

  if v_resource is null then
    raise exception 'This standalone workspace is no longer available for access approval' using errcode = 'P0002';
  end if;

  select member.data into v_membership
  from public.docs member
  where member.path = 'standaloneProjectMembers/' || p_resource_id || '__' || p_user_id::text;

  if v_membership->>'status' in ('active', 'invited') then
    raise exception 'This user already has active access or a pending invitation. Use the existing membership or invitation flow.'
      using errcode = '23505';
  end if;
  v_role := 'viewer';

  insert into public.docs as existing(path, data)
  values (
    'standaloneProjectMembers/' || p_resource_id || '__' || p_user_id::text,
    jsonb_build_object(
      'id', p_resource_id || '__' || p_user_id::text,
      'projectId', p_resource_id,
      'userId', p_user_id::text,
      'role', v_role,
      'status', 'active',
      'invitedBy', v_actor::text,
      'at', v_now_ms,
      'updatedAt', v_now_ms
    )
  )
  on conflict(path) do update
  set data = coalesce(existing.data, '{}'::jsonb) || jsonb_build_object(
    'role', v_role,
    'status', 'active',
    'updatedAt', v_now_ms
  ),
  updated_at = now();
end;
$function$;

revoke all on function private.submit_resource_access_request(text, text, text) from PUBLIC, anon;
revoke all on function private.review_resource_access_request(text, text, uuid, text) from PUBLIC, anon;
grant execute on function private.submit_resource_access_request(text, text, text) to authenticated;
grant execute on function private.review_resource_access_request(text, text, uuid, text) to authenticated;

-- Keep the names expected by the frontend while making the exposed functions
-- invoker-security wrappers. They can only reach the private definer functions
-- after authenticated EXECUTE grants have been checked.
create or replace function public.submit_resource_access_request(
  p_resource_type text,
  p_resource_id text,
  p_message text default ''
)
returns void
language sql
security invoker
set search_path to ''
as $function$
  select private.submit_resource_access_request(p_resource_type, p_resource_id, p_message);
$function$;

create or replace function public.review_resource_access_request(
  p_resource_type text,
  p_resource_id text,
  p_user_id uuid,
  p_status text
)
returns void
language sql
security invoker
set search_path to ''
as $function$
  select private.review_resource_access_request(p_resource_type, p_resource_id, p_user_id, p_status);
$function$;

revoke all on function public.submit_resource_access_request(text, text, text) from PUBLIC;
revoke all on function public.submit_resource_access_request(text, text, text) from anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;
revoke all on function public.review_resource_access_request(text, text, uuid, text) from PUBLIC;
revoke all on function public.review_resource_access_request(text, text, uuid, text) from anon;
grant execute on function public.review_resource_access_request(text, text, uuid, text) to authenticated;

-- Fold the new resource-read and request-insert predicates into the established
-- docs policies instead of adding parallel permissive policies.
alter policy docs_read_scoped on public.docs
using (
  (select private.can_read_doc(docs.path, docs.data))
  or (select private.can_read_conversation_doc(docs.path, docs.data))
  or (select private.can_read_ai_organizer_request(docs.path, docs.data))
  or (select private.can_read_collaboration_application(docs.path, docs.data))
  or (select private.can_read_work_submission(docs.path, docs.data))
  or (select private.can_read_standalone_doc(docs.path, docs.data))
  or (select private.can_read_resource_access_request(docs.path, docs.data))
);

alter policy docs_insert_scoped on public.docs
with check (
  (select private.can_insert_doc(docs.path, docs.data))
  or (select private.can_create_ai_organizer_request(docs.path, docs.data))
  or (select private.can_insert_ai_organizer_milestone(docs.path, docs.data))
  or (select private.can_insert_work_submission(docs.path, docs.data))
  or (select private.can_insert_standalone_doc(docs.path, docs.data))
  or (select private.can_request_resource_access(docs.path, docs.data))
);

drop policy if exists docs_resource_access_read on public.docs;
drop policy if exists docs_resource_access_insert on public.docs;
