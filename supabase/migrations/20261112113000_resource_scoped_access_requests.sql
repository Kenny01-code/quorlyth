-- Resource-scoped access requests for unlisted communities and standalone workspaces.
-- Requests are reviewed by the resource owner (or an active workspace manager),
-- never by the global platform queue. Collaboration-linked workspaces keep their
-- existing Apply to collaborate / accepted-collaborator flow.

create or replace function private.can_review_resource_access(
  p_resource_type text,
  p_resource_id text
)
returns boolean
language sql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
  select (select auth.uid()) is not null
    and case
      when p_resource_type = 'community' then exists (
        select 1
        from public.docs resource
        where resource.path = 'communities/' || p_resource_id
          and (
            resource.data->>'ownerId' = (select auth.uid())::text
            or resource.data->>'createdBy' = (select auth.uid())::text
          )
      )
      when p_resource_type = 'workspace' then exists (
        select 1
        from public.docs resource
        where resource.path = 'standaloneProjects/' || p_resource_id
          and resource.data->>'id' = p_resource_id
          and (
            resource.data->>'createdBy' = (select auth.uid())::text
            or exists (
              select 1
              from public.docs member
              where member.path = 'standaloneProjectMembers/' || p_resource_id || '__' || (select auth.uid())::text
                and member.data->>'projectId' = p_resource_id
                and member.data->>'userId' = (select auth.uid())::text
                and member.data->>'status' = 'active'
                and member.data->>'role' in ('owner', 'manager')
            )
          )
      )
      else false
    end;
$function$;

create or replace function private.can_request_resource_access(
  p_path text,
  p_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  v_uid text := (select auth.uid())::text;
  v_type text := p_data->>'resourceType';
  v_resource_id text := p_data->>'resourceId';
  v_user_id text := p_data->>'userId';
  v_resource jsonb;
begin
  if v_uid is null
    or p_path is null
    or p_data is null
    or jsonb_typeof(p_data) <> 'object'
    or v_type not in ('community', 'workspace')
    or v_resource_id is null
    or v_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
    or v_user_id is distinct from v_uid
    or p_path <> 'resourceAccessRequests/' || v_type || '__' || v_resource_id || '__' || v_uid
    or p_data->>'status' <> 'pending'
    or length(coalesce(p_data->>'message', '')) > 500
    or coalesce(p_data->>'requestedAt', '') !~ '^[0-9]{10,16}$'
    or p_data ? 'reviewedBy'
    or p_data ? 'reviewedAt' then
    return false;
  end if;

  if exists (
    select 1
    from public.docs existing
    where existing.path = p_path
      and existing.data->>'status' = 'pending'
  ) then
    return false;
  end if;

  if v_type = 'community' then
    select resource.data into v_resource
    from public.docs resource
    where resource.path = 'communities/' || v_resource_id;

    return v_resource is not null
      and coalesce(v_resource->>'vis', 'listed') = 'unlisted'
      and coalesce(v_resource->>'arch', 'false') <> 'true'
      and v_resource->>'ownerId' is distinct from v_uid
      and v_resource->>'createdBy' is distinct from v_uid
      and not private.is_member_of_community(v_resource_id);
  end if;

  select resource.data into v_resource
  from public.docs resource
  where resource.path = 'standaloneProjects/' || v_resource_id
    and resource.data->>'id' = v_resource_id;

  return v_resource is not null
    and coalesce(v_resource->>'status', 'active') = 'active'
    and coalesce(v_resource->>'linkedIdeaId', '') = ''
    and v_resource->>'createdBy' is distinct from v_uid
    and not exists (
      select 1
      from public.docs member
      where member.path = 'standaloneProjectMembers/' || v_resource_id || '__' || v_uid
        and member.data->>'projectId' = v_resource_id
        and member.data->>'userId' = v_uid
        and member.data->>'status' in ('active', 'invited')
    );
end;
$function$;

create or replace function private.can_read_resource_access_request(
  p_path text,
  p_data jsonb
)
returns boolean
language sql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
  select p_path is not null
    and p_data is not null
    and jsonb_typeof(p_data) = 'object'
    and p_data->>'resourceType' in ('community', 'workspace')
    and p_path = 'resourceAccessRequests/' ||
      (p_data->>'resourceType') || '__' ||
      coalesce(p_data->>'resourceId', '') || '__' ||
      coalesce(p_data->>'userId', '')
    and (
      p_data->>'userId' = (select auth.uid())::text
      or private.can_review_resource_access(p_data->>'resourceType', p_data->>'resourceId')
    );
$function$;

create or replace function private.can_update_resource_access_request(
  p_path text,
  p_data jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  v_uid text := (select auth.uid())::text;
  v_old jsonb;
begin
  if v_uid is null or p_path is null or p_data is null then
    return false;
  end if;

  select existing.data into v_old
  from public.docs existing
  where existing.path = p_path;

  if v_old is null
    or v_old->>'userId' is distinct from v_uid
    or v_old->>'resourceType' is distinct from p_data->>'resourceType'
    or v_old->>'resourceId' is distinct from p_data->>'resourceId'
    or p_path <> 'resourceAccessRequests/' ||
      coalesce(v_old->>'resourceType', '') || '__' ||
      coalesce(v_old->>'resourceId', '') || '__' || v_uid
    or p_data->>'userId' is distinct from v_uid
    or length(coalesce(p_data->>'message', '')) > 500 then
    return false;
  end if;

  -- The UPDATE USING expression receives the existing row. Permit that row to
  -- be selected only when it is no longer pending; the WITH CHECK expression
  -- then permits a fresh pending request. A pending request cannot be edited.
  if p_data->>'status' is not distinct from v_old->>'status'
    and v_old->>'status' in ('declined', 'withdrawn') then
    return true;
  end if;

  return v_old->>'status' in ('declined', 'withdrawn')
    and p_data->>'status' = 'pending'
    and coalesce(p_data->>'requestedAt', '') ~ '^[0-9]{10,16}$'
    and (p_data - 'status' - 'requestedAt' - 'message') =
        (v_old - 'status' - 'requestedAt' - 'message');
end;
$function$;

revoke all on function private.can_review_resource_access(text, text) from public, anon;
revoke all on function private.can_request_resource_access(text, jsonb) from public, anon;
revoke all on function private.can_read_resource_access_request(text, jsonb) from public, anon;
revoke all on function private.can_update_resource_access_request(text, jsonb) from public, anon;
grant execute on function private.can_review_resource_access(text, text) to authenticated;
grant execute on function private.can_request_resource_access(text, jsonb) to authenticated;
grant execute on function private.can_read_resource_access_request(text, jsonb) to authenticated;
grant execute on function private.can_update_resource_access_request(text, jsonb) to authenticated;

drop policy if exists docs_resource_access_read on public.docs;
create policy docs_resource_access_read
  on public.docs for select to authenticated
  using (
    path ~ '^resourceAccessRequests/(community|workspace)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}$'
    and private.can_read_resource_access_request(path, data)
  );

drop policy if exists docs_resource_access_insert on public.docs;
create policy docs_resource_access_insert
  on public.docs for insert to authenticated
  with check (
    path ~ '^resourceAccessRequests/(community|workspace)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}$'
    and private.can_request_resource_access(path, data)
  );

drop policy if exists docs_resource_access_update on public.docs;
create policy docs_resource_access_update
  on public.docs for update to authenticated
  using (
    path ~ '^resourceAccessRequests/(community|workspace)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}$'
    and private.can_update_resource_access_request(path, data)
  )
  with check (
    path ~ '^resourceAccessRequests/(community|workspace)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}$'
    and private.can_update_resource_access_request(path, data)
  );

create or replace function public.review_resource_access_request(
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
  v_role text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type not in ('community', 'workspace')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_user_id is null
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

  if p_resource_type = 'community' then
    select resource.data into v_resource
    from public.docs resource
    where resource.path = 'communities/' || p_resource_id;

    if v_resource is null or coalesce(v_resource->>'arch', 'false') = 'true' then
      raise exception 'This community is no longer available for access approval' using errcode = 'P0002';
    end if;

    insert into public.docs as existing(path, data)
    values (
      'members/' || p_user_id::text,
      jsonb_build_object('c', jsonb_build_object(p_resource_id, true))
    )
    on conflict(path) do update
    set data = jsonb_set(
      coalesce(existing.data, '{}'::jsonb),
      '{c}',
      coalesce(existing.data->'c', '{}'::jsonb) || jsonb_build_object(p_resource_id, true),
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

  -- Preserve any previous elevated role. A resource-access approval may add
  -- Viewer access, but must never downgrade an existing owner/manager/contributor.
  v_role := case
    when v_membership->>'role' in ('owner', 'manager', 'contributor') then v_membership->>'role'
    else 'viewer'
  end;

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

revoke all on function public.review_resource_access_request(text, text, uuid, text) from public, anon;
grant execute on function public.review_resource_access_request(text, text, uuid, text) to authenticated;
