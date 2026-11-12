-- Preserve community-level approval checks while allowing an explicit, approved
-- resource access request to satisfy membership approval for its exact community.
create or replace function private.enforce_community_join_approval()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  authenticated_uid text := (select auth.uid())::text;
  member_uid text;
  previous_communities jsonb := '{}'::jsonb;
  entry record;
  community_data jsonb;
  request_data jsonb;
begin
  if new.path !~ '^members/[^/]+
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

revoke all on function private.can_review_resource_access(text, text) from public, anon;
revoke all on function private.can_request_resource_access(text, jsonb) from public, anon;
revoke all on function private.can_read_resource_access_request(text, jsonb) from public, anon;
grant execute on function private.can_review_resource_access(text, text) to authenticated;
grant execute on function private.can_request_resource_access(text, jsonb) to authenticated;
grant execute on function private.can_read_resource_access_request(text, jsonb) to authenticated;

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


-- Dedicated notifications for resource-access requests. Keep the shared site-wide
-- activity notification function unchanged.
create or replace function private.notify_resource_access_request()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  v_actor text := new.data->>'userId';
  v_actor_name text;
  v_type text := new.data->>'resourceType';
  v_resource_id text := new.data->>'resourceId';
  v_cid text;
  v_community jsonb;
  v_workspace jsonb;
  v_title text;
  v_recipient text;
  v_at bigint;
begin
  if new.path !~ '^resourceAccessRequests/(community|workspace|idea)__[^/]+__[^/]+$' then
    return new;
  end if;

  if new.data->>'status' = 'pending'
    and (tg_op = 'INSERT' or old.data->>'status' is distinct from 'pending') then
    v_at := case when coalesce(new.data->>'requestedAt', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'requestedAt')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;

    select coalesce(p.data->>'name', p.data->>'authName', 'A member')
      into v_actor_name
      from public.docs p
     where p.path = 'profiles/' || v_actor;
    v_actor_name := coalesce(v_actor_name, 'A member');

    if v_type in ('community', 'idea') then
      if v_type = 'community' then
        v_cid := v_resource_id;
      else
        select i.data->>'cid' into v_cid
          from public.docs i
         where i.path = 'ideas/' || v_resource_id;
      end if;

      select c.data into v_community
        from public.docs c
       where c.path = 'communities/' || v_cid;
      v_title := coalesce(nullif(v_community->>'name', ''), 'a private community');

      for v_recipient in
        select distinct manager_id
        from (
          select v_community->>'ownerId' as manager_id
          union all
          select v_community->>'createdBy'
        ) managers
        where manager_id is not null
          and manager_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient,
          'resource-access-request:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'resource-access',
          'invite',
          v_actor_name || ' requested access to ' || v_title,
          v_resource_id,
          '/communities/' || v_cid || '?tab=access-requests',
          v_at
        );
      end loop;

    elsif v_type = 'workspace' then
      select p.data into v_workspace
        from public.docs p
       where p.path = 'standaloneProjects/' || v_resource_id
         and coalesce(p.data->>'linkedIdeaId', '') = '';
      v_title := coalesce(nullif(v_workspace->>'title', ''), 'a private workspace');

      for v_recipient in
        select distinct manager_id
        from (
          select v_workspace->>'createdBy' as manager_id
          union all
          select member.data->>'userId'
            from public.docs member
           where member.path ~ '^standaloneProjectMembers/[^/]+$'
             and member.data->>'projectId' = v_resource_id
             and member.data->>'status' = 'active'
             and member.data->>'role' in ('owner', 'manager')
        ) managers
        where manager_id is not null
          and manager_id <> coalesce(v_actor, '')
      loop
        perform private.emit_quorlyth_notification(
          v_recipient,
          'resource-access-request:' || new.path || ':' || txid_current() || ':' || v_recipient,
          'resource-access',
          'invite',
          v_actor_name || ' requested access to ' || v_title,
          v_resource_id,
          '/workspaces/' || v_resource_id || '?tab=team',
          v_at
        );
      end loop;
    end if;

  elsif tg_op = 'UPDATE'
    and old.data->>'status' = 'pending'
    and new.data->>'status' in ('approved', 'declined') then
    v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{1,15}$'
      then (new.data->>'reviewedAt')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;

    perform private.emit_quorlyth_notification(
      v_actor,
      'resource-access-decision:' || new.path || ':' || txid_current(),
      'resource-access',
      case new.data->>'status' when 'approved' then 'approve' else 'alert' end,
      'Your request for ' ||
        case v_type when 'community' then 'community' when 'idea' then 'idea' else 'workspace' end ||
        ' access was ' || (new.data->>'status'),
      v_resource_id,
      '/request-resource-access/' || v_type || '/' || v_resource_id,
      v_at
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.notify_resource_access_request() from public, anon;

drop trigger if exists docs_notify_resource_access_request on public.docs;
create trigger docs_notify_resource_access_request
  after insert or update on public.docs
  for each row
  when (new.path ~ '^resourceAccessRequests/(community|workspace|idea)__[^/]+__[^/]+$')
  execute function private.notify_resource_access_request();
