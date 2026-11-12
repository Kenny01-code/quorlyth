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
      when p_resource_type = 'idea' then exists (
        select 1
        from public.docs idea
        join public.docs community
          on community.path = 'communities/' || (idea.data->>'cid')
        where idea.path = 'ideas/' || p_resource_id
          and (
            community.data->>'ownerId' = (select auth.uid())::text
            or community.data->>'createdBy' = (select auth.uid())::text
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
  v_community_id text;
begin
  if v_uid is null
    or p_path is null
    or p_data is null
    or jsonb_typeof(p_data) <> 'object'
    or v_type is null
    or v_type not in ('community', 'workspace', 'idea')
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

  if v_type = 'idea' then
    select idea.data->>'cid' into v_community_id
    from public.docs idea
    where idea.path = 'ideas/' || v_resource_id;

    if v_community_id is null then return false; end if;

    select community.data into v_resource
    from public.docs community
    where community.path = 'communities/' || v_community_id;

    return v_resource is not null
      and coalesce(v_resource->>'vis', 'listed') = 'unlisted'
      and coalesce(v_resource->>'arch', 'false') <> 'true'
      and v_resource->>'ownerId' is distinct from v_uid
      and v_resource->>'createdBy' is distinct from v_uid
      and not private.is_member_of_community(v_community_id);
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
    and p_data->>'resourceType' in ('community', 'workspace', 'idea')
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
    path ~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}$'
    and private.can_read_resource_access_request(path, data)
  );

drop policy if exists docs_resource_access_insert on public.docs;
create policy docs_resource_access_insert
  on public.docs for insert to authenticated
  with check (
    path ~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}$'
    and private.can_request_resource_access(path, data)
  );

drop policy if exists docs_resource_access_update on public.docs;
drop policy if exists docs_resource_access_read_guard on public.docs;
create policy docs_resource_access_read_guard
  on public.docs as restrictive for select to authenticated
  using (
    path !~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}
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
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

  -- Do not turn a pending invitation into an accepted membership, and do not
  -- reactivate an already-active membership through this secondary access path.
  -- Removed memberships are deliberately restored as Viewer so revocation cannot
  -- silently restore prior manager/contributor permissions.
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

revoke all on function public.review_resource_access_request(text, text, uuid, text) from public, anon;
grant execute on function public.review_resource_access_request(text, text, uuid, text) to authenticated;

-- All submissions and resubmissions pass through one authenticated function.
-- This avoids relying on a client-side upsert to safely retry a declined request.
create or replace function public.submit_resource_access_request(
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
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

revoke all on function public.submit_resource_access_request(text, text, text) from public, anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;

    or private.can_read_resource_access_request(path, data)
  );

drop policy if exists docs_resource_access_insert_guard on public.docs;
create policy docs_resource_access_insert_guard
  on public.docs as restrictive for insert to authenticated
  with check (
    path !~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}
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
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

-- All submissions and resubmissions pass through one authenticated function.
-- This avoids relying on a client-side upsert to safely retry a declined request.
create or replace function public.submit_resource_access_request(
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
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

revoke all on function public.submit_resource_access_request(text, text, text) from public, anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;

    or private.can_request_resource_access(path, data)
  );

-- Resource request status changes happen only through the authenticated,
-- SECURITY DEFINER submit/review RPCs below. Browser clients cannot edit or
-- delete request records directly, including platform administrators.
drop policy if exists docs_resource_access_update_guard on public.docs;
create policy docs_resource_access_update_guard
  on public.docs as restrictive for update to authenticated
  using (path !~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}
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
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

-- All submissions and resubmissions pass through one authenticated function.
-- This avoids relying on a client-side upsert to safely retry a declined request.
create or replace function public.submit_resource_access_request(
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
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

revoke all on function public.submit_resource_access_request(text, text, text) from public, anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;
)
  with check (path !~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}
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
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

-- All submissions and resubmissions pass through one authenticated function.
-- This avoids relying on a client-side upsert to safely retry a declined request.
create or replace function public.submit_resource_access_request(
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
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

revoke all on function public.submit_resource_access_request(text, text, text) from public, anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;
);

drop policy if exists docs_resource_access_delete_guard on public.docs;
create policy docs_resource_access_delete_guard
  on public.docs as restrictive for delete to authenticated
  using (path !~ '^resourceAccessRequests/(community|workspace|idea)__[A-Za-z0-9_-]{1,120}__[0-9a-fA-F-]{36}
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
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

-- All submissions and resubmissions pass through one authenticated function.
-- This avoids relying on a client-side upsert to safely retry a declined request.
create or replace function public.submit_resource_access_request(
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
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

revoke all on function public.submit_resource_access_request(text, text, text) from public, anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;
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
  v_community_id text;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

-- All submissions and resubmissions pass through one authenticated function.
-- This avoids relying on a client-side upsert to safely retry a declined request.
create or replace function public.submit_resource_access_request(
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
  if p_resource_type is null or p_resource_type not in ('community', 'workspace', 'idea')
    or p_resource_id is null
    or p_resource_id !~ '^[A-Za-z0-9_-]{1,120}$'
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

revoke all on function public.submit_resource_access_request(text, text, text) from public, anon;
grant execute on function public.submit_resource_access_request(text, text, text) to authenticated;


-- Owner-only request and requester decision notifications.
CREATE OR REPLACE FUNCTION private.notify_quorlyth_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  v_actor text;
  v_actor_name text;
  v_recipient text;
  v_idea_id text;
  v_idea jsonb;
  v_cid text;
  v_community jsonb;
  v_title text;
  v_community_name text;
  v_status text;
  v_old_status text;
  v_at bigint;
  v_event text;
  v_parent_author text;
  v_conversation_id text;
  v_conversation jsonb;
  v_project_id text;
  v_project jsonb;
  v_milestone_title text;
  v_announcement text;
  v_old_announcement text;
  v_member record;
  v_recipients record;
begin
  -- Idea submitted: notify the creator, members of that community, and platform
  -- administrators. A single helper handles recipient deduplication and self-filtering.
  if new.path ~ '^ideas/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := split_part(new.path, '/', 2);
    v_cid := new.data->>'cid';
    v_actor := new.data->>'authorId';
    v_title := coalesce(nullif(new.data->>'title', ''), 'an idea');
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'a community');
    select coalesce(p.data->>'name', p.data->>'authName', 'A member')
      into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
    v_actor_name := coalesce(v_actor_name, 'A member');

    for v_recipient in
      select distinct recipient_id
      from (
        select v_community->>'ownerId' as recipient_id
        union all select v_community->>'createdBy'
        union all
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$'
          and m.data->'c'->>v_cid = 'true'
        union all
        select r.user_id::text from private.platform_roles r where r.role in ('owner', 'admin')
      ) recipients
      where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'idea:' || new.path || ':' || txid_current(),
        'idea', 'idea', v_actor_name || ' shared "' || v_title || '"',
        v_idea_id, v_idea_id, v_at
      );
    end loop;

  -- Comments, replies, and direct mentions on ideas.
  elsif new.path ~ '^ideas/[^/]+/comments/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := split_part(new.path, '/', 2);
    v_actor := new.data->>'authorId';
    v_idea_id := split_part(new.path, '/', 2);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
    select coalesce(p.data->>'name', p.data->>'authName', 'A member')
      into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
    v_actor_name := coalesce(v_actor_name, 'A member');
    v_parent_author := null;
    if coalesce(new.data->>'parentId', '') <> '' then
      select c.data->>'authorId' into v_parent_author
      from public.docs c
      where c.path = 'ideas/' || v_idea_id || '/comments/' || (new.data->>'parentId');
    end if;
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;

    for v_recipients in
      select recipient_id, bool_or(is_mention) as was_mentioned
      from (
        select v_idea->>'authorId' as recipient_id, false as is_mention
        union all select v_parent_author, false
        union all
        select jsonb_array_elements_text(
          case when jsonb_typeof(new.data->'mentionedUserIds') = 'array'
            then new.data->'mentionedUserIds' else '[]'::jsonb end
        ), true
      ) people
      where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      group by recipient_id
    loop
      perform private.emit_quorlyth_notification(
        v_recipients.recipient_id,
        'comment:' || new.path || ':' || txid_current() || ':' || v_recipients.recipient_id,
        'comment', case when v_recipients.was_mentioned then 'mention' else 'message' end,
        case when v_recipients.was_mentioned
          then v_actor_name || ' mentioned you in a comment on "' || v_title || '"'
          else v_actor_name || ' commented on "' || v_title || '"' end,
        split_part(new.path, '/', 4), v_idea_id, v_at
      );
    end loop;

  -- A new backing/vote should reach the idea author and the community creator.
  elsif new.path ~ '^votes/[^/]+$' and (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as idea_id
      from jsonb_each(coalesce(new.data->'ideas', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'ideas'->>entry.key, 'false') <> 'true'
    loop
      v_idea_id := v_member.idea_id;
      select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
      if v_idea is null then continue; end if;
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'your idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;

      for v_recipient in
        select distinct recipient_id from (
          select v_idea->>'authorId' as recipient_id
          union all select v_community->>'ownerId'
          union all select v_community->>'createdBy'
        ) r
        where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'vote:' || new.path || ':' || v_idea_id || ':' || txid_current(),
          'vote', 'approve', v_actor_name || ' backed your idea "' || v_title || '"',
          v_idea_id || '_' || v_actor, v_idea_id, v_at
        );
      end loop;
    end loop;

  -- Notify the idea author when review status moves out of the initial review state.
  elsif new.path ~ '^reviews/[^/]+$'
    and (tg_op = 'INSERT' or old.data->>'status' is distinct from new.data->>'status') then
    v_idea_id := split_part(new.path, '/', 2);
    v_status := new.data->>'status';
    if v_status in ('selected', 'held', 'declined', 'promoted') then
      select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
      if v_idea is not null then
        v_title := coalesce(nullif(v_idea->>'title', ''), 'your idea');
        v_status := case v_status when 'promoted' then 'prepared for sharing' else v_status end;
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_idea->>'authorId', 'review:' || new.path || ':' || txid_current(),
          'idea', case new.data->>'status'
            when 'promoted' then 'publish' when 'selected' then 'select'
            when 'held' then 'hold' else 'decline' end,
          'Your idea "' || v_title || '" was ' || v_status,
          v_idea_id, v_idea_id, v_at
        );
      end if;
    end if;

  -- Platform access requests are reviewed by the global platform roles.
  elsif new.path ~ '^requests/[^/]+$'
    and (tg_op = 'INSERT' or old.data->>'at' is distinct from new.data->>'at') then
    v_actor := split_part(new.path, '/', 2);
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    select coalesce(p.data->>'name', p.data->>'authName', 'A member')
      into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
    v_actor_name := coalesce(v_actor_name, 'A member');
    for v_recipient in
      select r.user_id::text from private.platform_roles r where r.role in ('owner', 'admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'access-request:' || new.path || ':' || txid_current(),
        'settings', 'invite', v_actor_name || ' requested access',
        v_actor, null, v_at
      );
    end loop;

  -- Notify the requester after a platform access decision changes.
  elsif new.path ~ '^decisions/[^/]+$'
    and (tg_op = 'INSERT' or old.data->>'status' is distinct from new.data->>'status'
      or old.data->>'at' is distinct from new.data->>'at') then
    v_actor := split_part(new.path, '/', 2);
    v_status := new.data->>'status';
    if v_status in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'access-decision:' || new.path || ':' || txid_current(),
        'access', case v_status when 'approved' then 'approve' else 'alert' end,
        'Your access request was ' || v_status, null, null, v_at
      );
    end if;

  -- Resource-scoped access requests: notify only the resource's real managers,
  -- not the platform-wide queue. Idea access is routed through its parent community.
  elsif new.path ~ '^resourceAccessRequests/(community|workspace|idea)__[^/]+__[^/]+
    v_cid := coalesce(new.data->>'cid', split_part(split_part(new.path, '/', 2), '__', 1));
    v_actor := new.data->>'userId';
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'the community');
    if new.data->>'status' = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-join-request:' || new.path || ':' || txid_current(),
          'join', 'member', v_actor_name || ' requested to join ' || v_community_name,
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'community-join-decision:' || new.path || ':' || txid_current(),
        'community', case new.data->>'status' when 'approved' then 'approve' else 'decline' end,
        'Your request to join ' || v_community_name || ' was ' || (new.data->>'status'),
        v_cid, v_cid, v_at
      );
    end if;

  -- Community memberships created directly or by approval are visible to the
  -- creator and platform administrators, but no self-notification is sent.
  elsif new.path ~ '^members/[^/]+$' then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') <> 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' joined ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

    -- Notify community managers and platform admins when a member leaves.
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'false'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') = 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member-left:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' left ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

  -- Collaboration applications and their review decisions.
  elsif new.path ~ '^volunteers/[^/]+$' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'applicantId';
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if new.data->>'status' = 'pending'
        and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        for v_recipient in
          select distinct recipient_id from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
            union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
          ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient, 'collab-application:' || new.path || ':' || txid_current(),
            'collab-request', 'collab', v_actor_name || ' applied to collaborate on "' || v_title || '"',
            split_part(new.path, '/', 2), v_idea_id, v_at
          );
        end loop;
      elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
        and new.data->>'status' in ('accepted', 'declined') then
        v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'reviewedAt')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_actor, 'collab-decision:' || new.path || ':' || txid_current(),
          'collaboration', case new.data->>'status' when 'accepted' then 'approve' else 'decline' end,
          'Your collaboration application for "' || v_title || '" was ' || (new.data->>'status'),
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end if;
    end if;

  -- Direct messages: persist one account notification per incoming message, respecting mute.
  elsif new.path ~ '^messages/[^/]+$' and tg_op = 'INSERT' then
    v_actor := new.data->>'senderId';
    v_conversation_id := new.data->>'conversationId';
    select c.data into v_conversation from public.docs c where c.path = 'conversations/' || v_conversation_id;
    if jsonb_typeof(v_conversation->'members') = 'array' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select distinct jsonb_array_elements_text(v_conversation->'members')
      loop
        if v_recipient = coalesce(v_actor, '') then continue; end if;
        if exists (
          select 1 from public.docs pref
          where pref.path ~ '^chatPreferences/[^/]+$'
            and pref.data->>'userId' = v_recipient
            and pref.data->>'conversationId' = v_conversation_id
            and coalesce(pref.data->>'muted', 'false') = 'true'
        ) then continue; end if;
        perform private.emit_quorlyth_notification(
          v_recipient, 'message:' || new.path || ':' || txid_current(),
          'message', 'message', 'New message from ' || v_actor_name,
          split_part(new.path, '/', 2), v_conversation_id, v_at
        );
      end loop;
    end if;

  -- Notify people credited in a promotion draft prepared from their idea.
  elsif new.path ~ '^promotions/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'by';
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    if jsonb_typeof(new.data->'credits') = 'array' then
      for v_recipient in select jsonb_array_elements_text(new.data->'credits')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'promotion-credit:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'promo', 'publish', 'You were credited in a post prepared to share',
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- Collaboration workspace is ready or changed: notify the idea author and accepted
  -- collaborators, while avoiding a notification to the person who made the change.
  elsif new.path ~ '^projects/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := split_part(new.path, '/', 2);
    v_idea_id := coalesce(new.data->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'project-change:' || new.path || ':' || txid_current(),
          'project', 'collab', 'The collaboration workspace for "' || v_title || '" was updated',
          v_project_id, v_idea_id, v_at
        );
      end loop;
    end if;

  -- Milestones: notify the idea author and accepted contributors of newly added/updated work.
  elsif new.path ~ '^milestones/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := new.data->>'projectId';
    select p.data into v_project from public.docs p where p.path = 'projects/' || v_project_id;
    v_idea_id := coalesce(v_project->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_milestone_title := coalesce(nullif(new.data->>'title', ''), 'a milestone');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'milestone-change:' || new.path || ':' || txid_current(),
          'milestone', 'collab',
          case when tg_op = 'INSERT'
            then 'Milestone "' || v_milestone_title || '" was added to "' || v_title || '"'
            else 'Milestone "' || v_milestone_title || '" was updated on "' || v_title || '"' end,
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- New community and meaningful community setting changes.
  elsif new.path ~ '^communities/[^/]+$' then
    v_cid := split_part(new.path, '/', 2);
    v_actor := coalesce(new.data->>'ownerId', new.data->>'createdBy');
    v_community_name := coalesce(new.data->>'name', 'a community');
    if tg_op = 'INSERT' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-created:' || new.path || ':' || txid_current(),
          'community', 'community', v_actor_name || ' created the community "' || v_community_name || '"',
          v_cid, v_cid, v_at
        );
      end loop;
    elsif
      (old.data->>'name' is distinct from new.data->>'name')
      or (old.data->>'purpose' is distinct from new.data->>'purpose')
      or (old.data->>'rules' is distinct from new.data->>'rules')
      or (old.data->>'welcome' is distinct from new.data->>'welcome')
      or (old.data->>'vis' is distinct from new.data->>'vis')
      or (old.data->>'post' is distinct from new.data->>'post')
      or (old.data->>'joinApproval' is distinct from new.data->>'joinApproval')
      or (old.data->>'arch' is distinct from new.data->>'arch') then
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$' and m.data->'c'->>v_cid = 'true'
        union
        select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-update:' || new.path || ':' || txid_current(),
          'community', 'community', 'The community "' || v_community_name || '" was updated',
          v_cid, v_cid, v_at
        );
      end loop;
    end if;

  -- Platform announcement changed: tell community members and platform administrators.
  elsif new.path = 'settings/space'
    and old.data->>'ann' is distinct from new.data->>'ann'
    and coalesce(new.data->>'ann', '') <> '' then
    v_announcement := left(new.data->>'ann', 240);
    v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    for v_recipient in
      select split_part(m.path, '/', 2)
      from public.docs m
      where m.path ~ '^members/[^/]+$'
        and jsonb_typeof(coalesce(m.data->'c', '{}'::jsonb)) = 'object'
        and exists (select 1 from jsonb_each(coalesce(m.data->'c', '{}'::jsonb)) c where c.value = 'true'::jsonb)
      union
      select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'announcement:' || new.path || ':' || txid_current(),
        'announcement', 'spark', 'New Quorlyth announcement: ' || v_announcement,
        'announcement', null, v_at
      );
    end loop;
  end if;

  return new;
end;
$function$
 then
    v_actor := new.data->>'userId';
    v_status := new.data->>'status';
    v_at := case when coalesce(new.data->>'requestedAt', new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}
    v_cid := coalesce(new.data->>'cid', split_part(split_part(new.path, '/', 2), '__', 1));
    v_actor := new.data->>'userId';
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'the community');
    if new.data->>'status' = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-join-request:' || new.path || ':' || txid_current(),
          'join', 'member', v_actor_name || ' requested to join ' || v_community_name,
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'community-join-decision:' || new.path || ':' || txid_current(),
        'community', case new.data->>'status' when 'approved' then 'approve' else 'decline' end,
        'Your request to join ' || v_community_name || ' was ' || (new.data->>'status'),
        v_cid, v_cid, v_at
      );
    end if;

  -- Community memberships created directly or by approval are visible to the
  -- creator and platform administrators, but no self-notification is sent.
  elsif new.path ~ '^members/[^/]+$' then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') <> 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' joined ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

    -- Notify community managers and platform admins when a member leaves.
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'false'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') = 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member-left:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' left ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

  -- Collaboration applications and their review decisions.
  elsif new.path ~ '^volunteers/[^/]+$' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'applicantId';
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if new.data->>'status' = 'pending'
        and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        for v_recipient in
          select distinct recipient_id from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
            union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
          ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient, 'collab-application:' || new.path || ':' || txid_current(),
            'collab-request', 'collab', v_actor_name || ' applied to collaborate on "' || v_title || '"',
            split_part(new.path, '/', 2), v_idea_id, v_at
          );
        end loop;
      elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
        and new.data->>'status' in ('accepted', 'declined') then
        v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'reviewedAt')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_actor, 'collab-decision:' || new.path || ':' || txid_current(),
          'collaboration', case new.data->>'status' when 'accepted' then 'approve' else 'decline' end,
          'Your collaboration application for "' || v_title || '" was ' || (new.data->>'status'),
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end if;
    end if;

  -- Direct messages: persist one account notification per incoming message, respecting mute.
  elsif new.path ~ '^messages/[^/]+$' and tg_op = 'INSERT' then
    v_actor := new.data->>'senderId';
    v_conversation_id := new.data->>'conversationId';
    select c.data into v_conversation from public.docs c where c.path = 'conversations/' || v_conversation_id;
    if jsonb_typeof(v_conversation->'members') = 'array' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select distinct jsonb_array_elements_text(v_conversation->'members')
      loop
        if v_recipient = coalesce(v_actor, '') then continue; end if;
        if exists (
          select 1 from public.docs pref
          where pref.path ~ '^chatPreferences/[^/]+$'
            and pref.data->>'userId' = v_recipient
            and pref.data->>'conversationId' = v_conversation_id
            and coalesce(pref.data->>'muted', 'false') = 'true'
        ) then continue; end if;
        perform private.emit_quorlyth_notification(
          v_recipient, 'message:' || new.path || ':' || txid_current(),
          'message', 'message', 'New message from ' || v_actor_name,
          split_part(new.path, '/', 2), v_conversation_id, v_at
        );
      end loop;
    end if;

  -- Notify people credited in a promotion draft prepared from their idea.
  elsif new.path ~ '^promotions/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'by';
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    if jsonb_typeof(new.data->'credits') = 'array' then
      for v_recipient in select jsonb_array_elements_text(new.data->'credits')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'promotion-credit:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'promo', 'publish', 'You were credited in a post prepared to share',
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- Collaboration workspace is ready or changed: notify the idea author and accepted
  -- collaborators, while avoiding a notification to the person who made the change.
  elsif new.path ~ '^projects/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := split_part(new.path, '/', 2);
    v_idea_id := coalesce(new.data->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'project-change:' || new.path || ':' || txid_current(),
          'project', 'collab', 'The collaboration workspace for "' || v_title || '" was updated',
          v_project_id, v_idea_id, v_at
        );
      end loop;
    end if;

  -- Milestones: notify the idea author and accepted contributors of newly added/updated work.
  elsif new.path ~ '^milestones/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := new.data->>'projectId';
    select p.data into v_project from public.docs p where p.path = 'projects/' || v_project_id;
    v_idea_id := coalesce(v_project->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_milestone_title := coalesce(nullif(new.data->>'title', ''), 'a milestone');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'milestone-change:' || new.path || ':' || txid_current(),
          'milestone', 'collab',
          case when tg_op = 'INSERT'
            then 'Milestone "' || v_milestone_title || '" was added to "' || v_title || '"'
            else 'Milestone "' || v_milestone_title || '" was updated on "' || v_title || '"' end,
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- New community and meaningful community setting changes.
  elsif new.path ~ '^communities/[^/]+$' then
    v_cid := split_part(new.path, '/', 2);
    v_actor := coalesce(new.data->>'ownerId', new.data->>'createdBy');
    v_community_name := coalesce(new.data->>'name', 'a community');
    if tg_op = 'INSERT' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-created:' || new.path || ':' || txid_current(),
          'community', 'community', v_actor_name || ' created the community "' || v_community_name || '"',
          v_cid, v_cid, v_at
        );
      end loop;
    elsif
      (old.data->>'name' is distinct from new.data->>'name')
      or (old.data->>'purpose' is distinct from new.data->>'purpose')
      or (old.data->>'rules' is distinct from new.data->>'rules')
      or (old.data->>'welcome' is distinct from new.data->>'welcome')
      or (old.data->>'vis' is distinct from new.data->>'vis')
      or (old.data->>'post' is distinct from new.data->>'post')
      or (old.data->>'joinApproval' is distinct from new.data->>'joinApproval')
      or (old.data->>'arch' is distinct from new.data->>'arch') then
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$' and m.data->'c'->>v_cid = 'true'
        union
        select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-update:' || new.path || ':' || txid_current(),
          'community', 'community', 'The community "' || v_community_name || '" was updated',
          v_cid, v_cid, v_at
        );
      end loop;
    end if;

  -- Platform announcement changed: tell community members and platform administrators.
  elsif new.path = 'settings/space'
    and old.data->>'ann' is distinct from new.data->>'ann'
    and coalesce(new.data->>'ann', '') <> '' then
    v_announcement := left(new.data->>'ann', 240);
    v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    for v_recipient in
      select split_part(m.path, '/', 2)
      from public.docs m
      where m.path ~ '^members/[^/]+$'
        and jsonb_typeof(coalesce(m.data->'c', '{}'::jsonb)) = 'object'
        and exists (select 1 from jsonb_each(coalesce(m.data->'c', '{}'::jsonb)) c where c.value = 'true'::jsonb)
      union
      select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'announcement:' || new.path || ':' || txid_current(),
        'announcement', 'spark', 'New Quorlyth announcement: ' || v_announcement,
        'announcement', null, v_at
      );
    end loop;
  end if;

  return new;
end;
$function$

      then coalesce(new.data->>'requestedAt', new.data->>'reviewedAt')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;

    if v_status = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');

      if new.data->>'resourceType' in ('community', 'idea') then
        if new.data->>'resourceType' = 'community' then
          v_cid := new.data->>'resourceId';
        else
          select i.data->>'cid' into v_cid
          from public.docs i where i.path = 'ideas/' || (new.data->>'resourceId');
        end if;
        select c.data into v_community
        from public.docs c where c.path = 'communities/' || v_cid;
        v_community_name := coalesce(v_community->>'name', 'a private community');
        for v_recipient in
          select distinct recipient_id
          from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
          ) managers
          where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient,
            'resource-access-request:' || new.path || ':' || txid_current() || ':' || v_recipient,
            'resource-access', 'invite',
            v_actor_name || ' requested access to ' || v_community_name,
            new.data->>'resourceId', '/communities/' || v_cid || '?tab=access-requests', v_at
          );
        end loop;
      elsif new.data->>'resourceType' = 'workspace' then
        v_project_id := new.data->>'resourceId';
        select p.data into v_project
        from public.docs p
        where p.path = 'standaloneProjects/' || v_project_id
          and coalesce(p.data->>'linkedIdeaId', '') = '';
        v_title := coalesce(nullif(v_project->>'title', ''), 'a private workspace');

        for v_recipient in
          select distinct recipient_id
          from (
            select v_project->>'createdBy' as recipient_id
            union all
            select member.data->>'userId'
            from public.docs member
            where member.path ~ '^standaloneProjectMembers/[^/]+
    v_cid := coalesce(new.data->>'cid', split_part(split_part(new.path, '/', 2), '__', 1));
    v_actor := new.data->>'userId';
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'the community');
    if new.data->>'status' = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-join-request:' || new.path || ':' || txid_current(),
          'join', 'member', v_actor_name || ' requested to join ' || v_community_name,
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'community-join-decision:' || new.path || ':' || txid_current(),
        'community', case new.data->>'status' when 'approved' then 'approve' else 'decline' end,
        'Your request to join ' || v_community_name || ' was ' || (new.data->>'status'),
        v_cid, v_cid, v_at
      );
    end if;

  -- Community memberships created directly or by approval are visible to the
  -- creator and platform administrators, but no self-notification is sent.
  elsif new.path ~ '^members/[^/]+$' then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') <> 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' joined ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

    -- Notify community managers and platform admins when a member leaves.
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'false'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') = 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member-left:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' left ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

  -- Collaboration applications and their review decisions.
  elsif new.path ~ '^volunteers/[^/]+$' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'applicantId';
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if new.data->>'status' = 'pending'
        and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        for v_recipient in
          select distinct recipient_id from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
            union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
          ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient, 'collab-application:' || new.path || ':' || txid_current(),
            'collab-request', 'collab', v_actor_name || ' applied to collaborate on "' || v_title || '"',
            split_part(new.path, '/', 2), v_idea_id, v_at
          );
        end loop;
      elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
        and new.data->>'status' in ('accepted', 'declined') then
        v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'reviewedAt')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_actor, 'collab-decision:' || new.path || ':' || txid_current(),
          'collaboration', case new.data->>'status' when 'accepted' then 'approve' else 'decline' end,
          'Your collaboration application for "' || v_title || '" was ' || (new.data->>'status'),
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end if;
    end if;

  -- Direct messages: persist one account notification per incoming message, respecting mute.
  elsif new.path ~ '^messages/[^/]+$' and tg_op = 'INSERT' then
    v_actor := new.data->>'senderId';
    v_conversation_id := new.data->>'conversationId';
    select c.data into v_conversation from public.docs c where c.path = 'conversations/' || v_conversation_id;
    if jsonb_typeof(v_conversation->'members') = 'array' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select distinct jsonb_array_elements_text(v_conversation->'members')
      loop
        if v_recipient = coalesce(v_actor, '') then continue; end if;
        if exists (
          select 1 from public.docs pref
          where pref.path ~ '^chatPreferences/[^/]+$'
            and pref.data->>'userId' = v_recipient
            and pref.data->>'conversationId' = v_conversation_id
            and coalesce(pref.data->>'muted', 'false') = 'true'
        ) then continue; end if;
        perform private.emit_quorlyth_notification(
          v_recipient, 'message:' || new.path || ':' || txid_current(),
          'message', 'message', 'New message from ' || v_actor_name,
          split_part(new.path, '/', 2), v_conversation_id, v_at
        );
      end loop;
    end if;

  -- Notify people credited in a promotion draft prepared from their idea.
  elsif new.path ~ '^promotions/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'by';
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    if jsonb_typeof(new.data->'credits') = 'array' then
      for v_recipient in select jsonb_array_elements_text(new.data->'credits')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'promotion-credit:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'promo', 'publish', 'You were credited in a post prepared to share',
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- Collaboration workspace is ready or changed: notify the idea author and accepted
  -- collaborators, while avoiding a notification to the person who made the change.
  elsif new.path ~ '^projects/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := split_part(new.path, '/', 2);
    v_idea_id := coalesce(new.data->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'project-change:' || new.path || ':' || txid_current(),
          'project', 'collab', 'The collaboration workspace for "' || v_title || '" was updated',
          v_project_id, v_idea_id, v_at
        );
      end loop;
    end if;

  -- Milestones: notify the idea author and accepted contributors of newly added/updated work.
  elsif new.path ~ '^milestones/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := new.data->>'projectId';
    select p.data into v_project from public.docs p where p.path = 'projects/' || v_project_id;
    v_idea_id := coalesce(v_project->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_milestone_title := coalesce(nullif(new.data->>'title', ''), 'a milestone');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'milestone-change:' || new.path || ':' || txid_current(),
          'milestone', 'collab',
          case when tg_op = 'INSERT'
            then 'Milestone "' || v_milestone_title || '" was added to "' || v_title || '"'
            else 'Milestone "' || v_milestone_title || '" was updated on "' || v_title || '"' end,
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- New community and meaningful community setting changes.
  elsif new.path ~ '^communities/[^/]+$' then
    v_cid := split_part(new.path, '/', 2);
    v_actor := coalesce(new.data->>'ownerId', new.data->>'createdBy');
    v_community_name := coalesce(new.data->>'name', 'a community');
    if tg_op = 'INSERT' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-created:' || new.path || ':' || txid_current(),
          'community', 'community', v_actor_name || ' created the community "' || v_community_name || '"',
          v_cid, v_cid, v_at
        );
      end loop;
    elsif
      (old.data->>'name' is distinct from new.data->>'name')
      or (old.data->>'purpose' is distinct from new.data->>'purpose')
      or (old.data->>'rules' is distinct from new.data->>'rules')
      or (old.data->>'welcome' is distinct from new.data->>'welcome')
      or (old.data->>'vis' is distinct from new.data->>'vis')
      or (old.data->>'post' is distinct from new.data->>'post')
      or (old.data->>'joinApproval' is distinct from new.data->>'joinApproval')
      or (old.data->>'arch' is distinct from new.data->>'arch') then
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$' and m.data->'c'->>v_cid = 'true'
        union
        select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-update:' || new.path || ':' || txid_current(),
          'community', 'community', 'The community "' || v_community_name || '" was updated',
          v_cid, v_cid, v_at
        );
      end loop;
    end if;

  -- Platform announcement changed: tell community members and platform administrators.
  elsif new.path = 'settings/space'
    and old.data->>'ann' is distinct from new.data->>'ann'
    and coalesce(new.data->>'ann', '') <> '' then
    v_announcement := left(new.data->>'ann', 240);
    v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    for v_recipient in
      select split_part(m.path, '/', 2)
      from public.docs m
      where m.path ~ '^members/[^/]+$'
        and jsonb_typeof(coalesce(m.data->'c', '{}'::jsonb)) = 'object'
        and exists (select 1 from jsonb_each(coalesce(m.data->'c', '{}'::jsonb)) c where c.value = 'true'::jsonb)
      union
      select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'announcement:' || new.path || ':' || txid_current(),
        'announcement', 'spark', 'New Quorlyth announcement: ' || v_announcement,
        'announcement', null, v_at
      );
    end loop;
  end if;

  return new;
end;
$function$

              and member.data->>'projectId' = v_project_id
              and member.data->>'status' = 'active'
              and member.data->>'role' in ('owner', 'manager')
          ) managers
          where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient,
            'resource-access-request:' || new.path || ':' || txid_current() || ':' || v_recipient,
            'resource-access', 'invite',
            v_actor_name || ' requested access to ' || v_title,
            v_project_id, '/workspaces/' || v_project_id || '?tab=team', v_at
          );
        end loop;
      end if;

    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}
    v_cid := coalesce(new.data->>'cid', split_part(split_part(new.path, '/', 2), '__', 1));
    v_actor := new.data->>'userId';
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'the community');
    if new.data->>'status' = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-join-request:' || new.path || ':' || txid_current(),
          'join', 'member', v_actor_name || ' requested to join ' || v_community_name,
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'community-join-decision:' || new.path || ':' || txid_current(),
        'community', case new.data->>'status' when 'approved' then 'approve' else 'decline' end,
        'Your request to join ' || v_community_name || ' was ' || (new.data->>'status'),
        v_cid, v_cid, v_at
      );
    end if;

  -- Community memberships created directly or by approval are visible to the
  -- creator and platform administrators, but no self-notification is sent.
  elsif new.path ~ '^members/[^/]+$' then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') <> 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' joined ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

    -- Notify community managers and platform admins when a member leaves.
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'false'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') = 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member-left:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' left ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

  -- Collaboration applications and their review decisions.
  elsif new.path ~ '^volunteers/[^/]+$' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'applicantId';
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if new.data->>'status' = 'pending'
        and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        for v_recipient in
          select distinct recipient_id from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
            union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
          ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient, 'collab-application:' || new.path || ':' || txid_current(),
            'collab-request', 'collab', v_actor_name || ' applied to collaborate on "' || v_title || '"',
            split_part(new.path, '/', 2), v_idea_id, v_at
          );
        end loop;
      elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
        and new.data->>'status' in ('accepted', 'declined') then
        v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'reviewedAt')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_actor, 'collab-decision:' || new.path || ':' || txid_current(),
          'collaboration', case new.data->>'status' when 'accepted' then 'approve' else 'decline' end,
          'Your collaboration application for "' || v_title || '" was ' || (new.data->>'status'),
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end if;
    end if;

  -- Direct messages: persist one account notification per incoming message, respecting mute.
  elsif new.path ~ '^messages/[^/]+$' and tg_op = 'INSERT' then
    v_actor := new.data->>'senderId';
    v_conversation_id := new.data->>'conversationId';
    select c.data into v_conversation from public.docs c where c.path = 'conversations/' || v_conversation_id;
    if jsonb_typeof(v_conversation->'members') = 'array' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select distinct jsonb_array_elements_text(v_conversation->'members')
      loop
        if v_recipient = coalesce(v_actor, '') then continue; end if;
        if exists (
          select 1 from public.docs pref
          where pref.path ~ '^chatPreferences/[^/]+$'
            and pref.data->>'userId' = v_recipient
            and pref.data->>'conversationId' = v_conversation_id
            and coalesce(pref.data->>'muted', 'false') = 'true'
        ) then continue; end if;
        perform private.emit_quorlyth_notification(
          v_recipient, 'message:' || new.path || ':' || txid_current(),
          'message', 'message', 'New message from ' || v_actor_name,
          split_part(new.path, '/', 2), v_conversation_id, v_at
        );
      end loop;
    end if;

  -- Notify people credited in a promotion draft prepared from their idea.
  elsif new.path ~ '^promotions/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'by';
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    if jsonb_typeof(new.data->'credits') = 'array' then
      for v_recipient in select jsonb_array_elements_text(new.data->'credits')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'promotion-credit:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'promo', 'publish', 'You were credited in a post prepared to share',
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- Collaboration workspace is ready or changed: notify the idea author and accepted
  -- collaborators, while avoiding a notification to the person who made the change.
  elsif new.path ~ '^projects/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := split_part(new.path, '/', 2);
    v_idea_id := coalesce(new.data->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'project-change:' || new.path || ':' || txid_current(),
          'project', 'collab', 'The collaboration workspace for "' || v_title || '" was updated',
          v_project_id, v_idea_id, v_at
        );
      end loop;
    end if;

  -- Milestones: notify the idea author and accepted contributors of newly added/updated work.
  elsif new.path ~ '^milestones/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := new.data->>'projectId';
    select p.data into v_project from public.docs p where p.path = 'projects/' || v_project_id;
    v_idea_id := coalesce(v_project->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_milestone_title := coalesce(nullif(new.data->>'title', ''), 'a milestone');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'milestone-change:' || new.path || ':' || txid_current(),
          'milestone', 'collab',
          case when tg_op = 'INSERT'
            then 'Milestone "' || v_milestone_title || '" was added to "' || v_title || '"'
            else 'Milestone "' || v_milestone_title || '" was updated on "' || v_title || '"' end,
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- New community and meaningful community setting changes.
  elsif new.path ~ '^communities/[^/]+$' then
    v_cid := split_part(new.path, '/', 2);
    v_actor := coalesce(new.data->>'ownerId', new.data->>'createdBy');
    v_community_name := coalesce(new.data->>'name', 'a community');
    if tg_op = 'INSERT' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-created:' || new.path || ':' || txid_current(),
          'community', 'community', v_actor_name || ' created the community "' || v_community_name || '"',
          v_cid, v_cid, v_at
        );
      end loop;
    elsif
      (old.data->>'name' is distinct from new.data->>'name')
      or (old.data->>'purpose' is distinct from new.data->>'purpose')
      or (old.data->>'rules' is distinct from new.data->>'rules')
      or (old.data->>'welcome' is distinct from new.data->>'welcome')
      or (old.data->>'vis' is distinct from new.data->>'vis')
      or (old.data->>'post' is distinct from new.data->>'post')
      or (old.data->>'joinApproval' is distinct from new.data->>'joinApproval')
      or (old.data->>'arch' is distinct from new.data->>'arch') then
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$' and m.data->'c'->>v_cid = 'true'
        union
        select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-update:' || new.path || ':' || txid_current(),
          'community', 'community', 'The community "' || v_community_name || '" was updated',
          v_cid, v_cid, v_at
        );
      end loop;
    end if;

  -- Platform announcement changed: tell community members and platform administrators.
  elsif new.path = 'settings/space'
    and old.data->>'ann' is distinct from new.data->>'ann'
    and coalesce(new.data->>'ann', '') <> '' then
    v_announcement := left(new.data->>'ann', 240);
    v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    for v_recipient in
      select split_part(m.path, '/', 2)
      from public.docs m
      where m.path ~ '^members/[^/]+$'
        and jsonb_typeof(coalesce(m.data->'c', '{}'::jsonb)) = 'object'
        and exists (select 1 from jsonb_each(coalesce(m.data->'c', '{}'::jsonb)) c where c.value = 'true'::jsonb)
      union
      select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'announcement:' || new.path || ':' || txid_current(),
        'announcement', 'spark', 'New Quorlyth announcement: ' || v_announcement,
        'announcement', null, v_at
      );
    end loop;
  end if;

  return new;
end;
$function$

        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      v_title := case new.data->>'resourceType'
        when 'community' then 'community'
        when 'idea' then 'idea'
        else 'workspace' end;
      perform private.emit_quorlyth_notification(
        v_actor,
        'resource-access-decision:' || new.path || ':' || txid_current(),
        'resource-access',
        case new.data->>'status' when 'approved' then 'approve' else 'alert' end,
        'Your request for ' || v_title || ' access was ' || new.data->>'status',
        new.data->>'resourceId',
        '/request-resource-access/' || new.data->>'resourceType' || '/' || new.data->>'resourceId',
        v_at
      );
    end if;

  -- Community join requests: notify community managers/admins on submission and
  -- the requester when their community access is approved or declined.
  elsif new.path ~ '^communityJoinRequests/[^/]+
    v_cid := coalesce(new.data->>'cid', split_part(split_part(new.path, '/', 2), '__', 1));
    v_actor := new.data->>'userId';
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'the community');
    if new.data->>'status' = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-join-request:' || new.path || ':' || txid_current(),
          'join', 'member', v_actor_name || ' requested to join ' || v_community_name,
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'community-join-decision:' || new.path || ':' || txid_current(),
        'community', case new.data->>'status' when 'approved' then 'approve' else 'decline' end,
        'Your request to join ' || v_community_name || ' was ' || (new.data->>'status'),
        v_cid, v_cid, v_at
      );
    end if;

  -- Community memberships created directly or by approval are visible to the
  -- creator and platform administrators, but no self-notification is sent.
  elsif new.path ~ '^members/[^/]+$' then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') <> 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' joined ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

    -- Notify community managers and platform admins when a member leaves.
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'false'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') = 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member-left:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' left ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

  -- Collaboration applications and their review decisions.
  elsif new.path ~ '^volunteers/[^/]+$' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'applicantId';
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if new.data->>'status' = 'pending'
        and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        for v_recipient in
          select distinct recipient_id from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
            union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
          ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient, 'collab-application:' || new.path || ':' || txid_current(),
            'collab-request', 'collab', v_actor_name || ' applied to collaborate on "' || v_title || '"',
            split_part(new.path, '/', 2), v_idea_id, v_at
          );
        end loop;
      elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
        and new.data->>'status' in ('accepted', 'declined') then
        v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'reviewedAt')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_actor, 'collab-decision:' || new.path || ':' || txid_current(),
          'collaboration', case new.data->>'status' when 'accepted' then 'approve' else 'decline' end,
          'Your collaboration application for "' || v_title || '" was ' || (new.data->>'status'),
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end if;
    end if;

  -- Direct messages: persist one account notification per incoming message, respecting mute.
  elsif new.path ~ '^messages/[^/]+$' and tg_op = 'INSERT' then
    v_actor := new.data->>'senderId';
    v_conversation_id := new.data->>'conversationId';
    select c.data into v_conversation from public.docs c where c.path = 'conversations/' || v_conversation_id;
    if jsonb_typeof(v_conversation->'members') = 'array' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select distinct jsonb_array_elements_text(v_conversation->'members')
      loop
        if v_recipient = coalesce(v_actor, '') then continue; end if;
        if exists (
          select 1 from public.docs pref
          where pref.path ~ '^chatPreferences/[^/]+$'
            and pref.data->>'userId' = v_recipient
            and pref.data->>'conversationId' = v_conversation_id
            and coalesce(pref.data->>'muted', 'false') = 'true'
        ) then continue; end if;
        perform private.emit_quorlyth_notification(
          v_recipient, 'message:' || new.path || ':' || txid_current(),
          'message', 'message', 'New message from ' || v_actor_name,
          split_part(new.path, '/', 2), v_conversation_id, v_at
        );
      end loop;
    end if;

  -- Notify people credited in a promotion draft prepared from their idea.
  elsif new.path ~ '^promotions/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'by';
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    if jsonb_typeof(new.data->'credits') = 'array' then
      for v_recipient in select jsonb_array_elements_text(new.data->'credits')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'promotion-credit:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'promo', 'publish', 'You were credited in a post prepared to share',
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- Collaboration workspace is ready or changed: notify the idea author and accepted
  -- collaborators, while avoiding a notification to the person who made the change.
  elsif new.path ~ '^projects/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := split_part(new.path, '/', 2);
    v_idea_id := coalesce(new.data->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'project-change:' || new.path || ':' || txid_current(),
          'project', 'collab', 'The collaboration workspace for "' || v_title || '" was updated',
          v_project_id, v_idea_id, v_at
        );
      end loop;
    end if;

  -- Milestones: notify the idea author and accepted contributors of newly added/updated work.
  elsif new.path ~ '^milestones/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := new.data->>'projectId';
    select p.data into v_project from public.docs p where p.path = 'projects/' || v_project_id;
    v_idea_id := coalesce(v_project->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_milestone_title := coalesce(nullif(new.data->>'title', ''), 'a milestone');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'milestone-change:' || new.path || ':' || txid_current(),
          'milestone', 'collab',
          case when tg_op = 'INSERT'
            then 'Milestone "' || v_milestone_title || '" was added to "' || v_title || '"'
            else 'Milestone "' || v_milestone_title || '" was updated on "' || v_title || '"' end,
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- New community and meaningful community setting changes.
  elsif new.path ~ '^communities/[^/]+$' then
    v_cid := split_part(new.path, '/', 2);
    v_actor := coalesce(new.data->>'ownerId', new.data->>'createdBy');
    v_community_name := coalesce(new.data->>'name', 'a community');
    if tg_op = 'INSERT' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-created:' || new.path || ':' || txid_current(),
          'community', 'community', v_actor_name || ' created the community "' || v_community_name || '"',
          v_cid, v_cid, v_at
        );
      end loop;
    elsif
      (old.data->>'name' is distinct from new.data->>'name')
      or (old.data->>'purpose' is distinct from new.data->>'purpose')
      or (old.data->>'rules' is distinct from new.data->>'rules')
      or (old.data->>'welcome' is distinct from new.data->>'welcome')
      or (old.data->>'vis' is distinct from new.data->>'vis')
      or (old.data->>'post' is distinct from new.data->>'post')
      or (old.data->>'joinApproval' is distinct from new.data->>'joinApproval')
      or (old.data->>'arch' is distinct from new.data->>'arch') then
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$' and m.data->'c'->>v_cid = 'true'
        union
        select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-update:' || new.path || ':' || txid_current(),
          'community', 'community', 'The community "' || v_community_name || '" was updated',
          v_cid, v_cid, v_at
        );
      end loop;
    end if;

  -- Platform announcement changed: tell community members and platform administrators.
  elsif new.path = 'settings/space'
    and old.data->>'ann' is distinct from new.data->>'ann'
    and coalesce(new.data->>'ann', '') <> '' then
    v_announcement := left(new.data->>'ann', 240);
    v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    for v_recipient in
      select split_part(m.path, '/', 2)
      from public.docs m
      where m.path ~ '^members/[^/]+$'
        and jsonb_typeof(coalesce(m.data->'c', '{}'::jsonb)) = 'object'
        and exists (select 1 from jsonb_each(coalesce(m.data->'c', '{}'::jsonb)) c where c.value = 'true'::jsonb)
      union
      select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'announcement:' || new.path || ':' || txid_current(),
        'announcement', 'spark', 'New Quorlyth announcement: ' || v_announcement,
        'announcement', null, v_at
      );
    end loop;
  end if;

  return new;
end;
$function$
 then
    v_cid := coalesce(new.data->>'cid', split_part(split_part(new.path, '/', 2), '__', 1));
    v_actor := new.data->>'userId';
    select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'the community');
    if new.data->>'status' = 'pending'
      and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-join-request:' || new.path || ':' || txid_current(),
          'join', 'member', v_actor_name || ' requested to join ' || v_community_name,
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
      and new.data->>'status' in ('approved', 'declined') then
      v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'reviewedAt')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      perform private.emit_quorlyth_notification(
        v_actor, 'community-join-decision:' || new.path || ':' || txid_current(),
        'community', case new.data->>'status' when 'approved' then 'approve' else 'decline' end,
        'Your request to join ' || v_community_name || ' was ' || (new.data->>'status'),
        v_cid, v_cid, v_at
      );
    end if;

  -- Community memberships created directly or by approval are visible to the
  -- creator and platform administrators, but no self-notification is sent.
  elsif new.path ~ '^members/[^/]+$' then
    v_actor := split_part(new.path, '/', 2);
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'true'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') <> 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' joined ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

    -- Notify community managers and platform admins when a member leaves.
    for v_member in
      select entry.key as community_id
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb)) entry
      where entry.value = 'false'::jsonb
        and coalesce(old.data->'c'->>entry.key, 'false') = 'true'
    loop
      v_cid := v_member.community_id;
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if v_community is null then continue; end if;
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select distinct recipient_id from (
          select v_community->>'ownerId' as recipient_id
          union all select v_community->>'createdBy'
          union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
        ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-member-left:' || new.path || ':' || v_cid || ':' || txid_current(),
          'join', 'member', v_actor_name || ' left ' || coalesce(v_community->>'name', 'your community'),
          v_cid || '__' || v_actor, v_cid, v_at
        );
      end loop;
    end loop;

  -- Collaboration applications and their review decisions.
  elsif new.path ~ '^volunteers/[^/]+$' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'applicantId';
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_cid := v_idea->>'cid';
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
      if new.data->>'status' = 'pending'
        and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
        v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'at')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        select coalesce(p.data->>'name', p.data->>'authName', 'A member')
          into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
        v_actor_name := coalesce(v_actor_name, 'A member');
        for v_recipient in
          select distinct recipient_id from (
            select v_community->>'ownerId' as recipient_id
            union all select v_community->>'createdBy'
            union all select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
          ) r where recipient_id is not null and recipient_id <> coalesce(v_actor, '')
        loop
          perform private.emit_quorlyth_notification(
            v_recipient, 'collab-application:' || new.path || ':' || txid_current(),
            'collab-request', 'collab', v_actor_name || ' applied to collaborate on "' || v_title || '"',
            split_part(new.path, '/', 2), v_idea_id, v_at
          );
        end loop;
      elsif tg_op = 'UPDATE' and old.data->>'status' = 'pending'
        and new.data->>'status' in ('accepted', 'declined') then
        v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
          then (new.data->>'reviewedAt')::bigint
          else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
        perform private.emit_quorlyth_notification(
          v_actor, 'collab-decision:' || new.path || ':' || txid_current(),
          'collaboration', case new.data->>'status' when 'accepted' then 'approve' else 'decline' end,
          'Your collaboration application for "' || v_title || '" was ' || (new.data->>'status'),
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end if;
    end if;

  -- Direct messages: persist one account notification per incoming message, respecting mute.
  elsif new.path ~ '^messages/[^/]+$' and tg_op = 'INSERT' then
    v_actor := new.data->>'senderId';
    v_conversation_id := new.data->>'conversationId';
    select c.data into v_conversation from public.docs c where c.path = 'conversations/' || v_conversation_id;
    if jsonb_typeof(v_conversation->'members') = 'array' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select distinct jsonb_array_elements_text(v_conversation->'members')
      loop
        if v_recipient = coalesce(v_actor, '') then continue; end if;
        if exists (
          select 1 from public.docs pref
          where pref.path ~ '^chatPreferences/[^/]+$'
            and pref.data->>'userId' = v_recipient
            and pref.data->>'conversationId' = v_conversation_id
            and coalesce(pref.data->>'muted', 'false') = 'true'
        ) then continue; end if;
        perform private.emit_quorlyth_notification(
          v_recipient, 'message:' || new.path || ':' || txid_current(),
          'message', 'message', 'New message from ' || v_actor_name,
          split_part(new.path, '/', 2), v_conversation_id, v_at
        );
      end loop;
    end if;

  -- Notify people credited in a promotion draft prepared from their idea.
  elsif new.path ~ '^promotions/[^/]+$' and tg_op = 'INSERT' then
    v_idea_id := new.data->>'ideaId';
    v_actor := new.data->>'by';
    v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'at')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
    if jsonb_typeof(new.data->'credits') = 'array' then
      for v_recipient in select jsonb_array_elements_text(new.data->'credits')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'promotion-credit:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'promo', 'publish', 'You were credited in a post prepared to share',
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- Collaboration workspace is ready or changed: notify the idea author and accepted
  -- collaborators, while avoiding a notification to the person who made the change.
  elsif new.path ~ '^projects/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := split_part(new.path, '/', 2);
    v_idea_id := coalesce(new.data->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'project-change:' || new.path || ':' || txid_current(),
          'project', 'collab', 'The collaboration workspace for "' || v_title || '" was updated',
          v_project_id, v_idea_id, v_at
        );
      end loop;
    end if;

  -- Milestones: notify the idea author and accepted contributors of newly added/updated work.
  elsif new.path ~ '^milestones/[^/]+$'
    and (tg_op = 'INSERT' or old.data - 'updatedAt' is distinct from new.data - 'updatedAt') then
    v_project_id := new.data->>'projectId';
    select p.data into v_project from public.docs p where p.path = 'projects/' || v_project_id;
    v_idea_id := coalesce(v_project->>'ideaId', v_project_id);
    select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
    if v_idea is not null then
      v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
      v_milestone_title := coalesce(nullif(new.data->>'title', ''), 'a milestone');
      v_at := case when coalesce(new.data->>'updatedAt', new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then coalesce(new.data->>'updatedAt', new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in
        select v_idea->>'authorId'
        union
        select d.data->>'applicantId' from public.docs d
        where d.path ~ '^volunteers/[^/]+$'
          and d.data->>'ideaId' = v_idea_id and d.data->>'status' = 'accepted'
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'milestone-change:' || new.path || ':' || txid_current(),
          'milestone', 'collab',
          case when tg_op = 'INSERT'
            then 'Milestone "' || v_milestone_title || '" was added to "' || v_title || '"'
            else 'Milestone "' || v_milestone_title || '" was updated on "' || v_title || '"' end,
          split_part(new.path, '/', 2), v_idea_id, v_at
        );
      end loop;
    end if;

  -- New community and meaningful community setting changes.
  elsif new.path ~ '^communities/[^/]+$' then
    v_cid := split_part(new.path, '/', 2);
    v_actor := coalesce(new.data->>'ownerId', new.data->>'createdBy');
    v_community_name := coalesce(new.data->>'name', 'a community');
    if tg_op = 'INSERT' then
      select coalesce(p.data->>'name', p.data->>'authName', 'A member')
        into v_actor_name from public.docs p where p.path = 'profiles/' || v_actor;
      v_actor_name := coalesce(v_actor_name, 'A member');
      v_at := case when coalesce(new.data->>'at', '') ~ '^[0-9]{1,15}$'
        then (new.data->>'at')::bigint
        else (extract(epoch from clock_timestamp()) * 1000)::bigint end;
      for v_recipient in select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-created:' || new.path || ':' || txid_current(),
          'community', 'community', v_actor_name || ' created the community "' || v_community_name || '"',
          v_cid, v_cid, v_at
        );
      end loop;
    elsif
      (old.data->>'name' is distinct from new.data->>'name')
      or (old.data->>'purpose' is distinct from new.data->>'purpose')
      or (old.data->>'rules' is distinct from new.data->>'rules')
      or (old.data->>'welcome' is distinct from new.data->>'welcome')
      or (old.data->>'vis' is distinct from new.data->>'vis')
      or (old.data->>'post' is distinct from new.data->>'post')
      or (old.data->>'joinApproval' is distinct from new.data->>'joinApproval')
      or (old.data->>'arch' is distinct from new.data->>'arch') then
      v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
      for v_recipient in
        select split_part(m.path, '/', 2)
        from public.docs m
        where m.path ~ '^members/[^/]+$' and m.data->'c'->>v_cid = 'true'
        union
        select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient, 'community-update:' || new.path || ':' || txid_current(),
          'community', 'community', 'The community "' || v_community_name || '" was updated',
          v_cid, v_cid, v_at
        );
      end loop;
    end if;

  -- Platform announcement changed: tell community members and platform administrators.
  elsif new.path = 'settings/space'
    and old.data->>'ann' is distinct from new.data->>'ann'
    and coalesce(new.data->>'ann', '') <> '' then
    v_announcement := left(new.data->>'ann', 240);
    v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    for v_recipient in
      select split_part(m.path, '/', 2)
      from public.docs m
      where m.path ~ '^members/[^/]+$'
        and jsonb_typeof(coalesce(m.data->'c', '{}'::jsonb)) = 'object'
        and exists (select 1 from jsonb_each(coalesce(m.data->'c', '{}'::jsonb)) c where c.value = 'true'::jsonb)
      union
      select r.user_id::text from private.platform_roles r where r.role in ('owner','admin')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient, 'announcement:' || new.path || ':' || txid_current(),
        'announcement', 'spark', 'New Quorlyth announcement: ' || v_announcement,
        'announcement', null, v_at
      );
    end loop;
  end if;

  return new;
end;
$function$

