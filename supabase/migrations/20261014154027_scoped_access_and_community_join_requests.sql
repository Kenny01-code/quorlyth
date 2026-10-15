-- Keep platform-wide access review separate from community membership review.
-- Platform owners and explicitly assigned platform admins can review global access requests.
drop policy if exists access_requests_owner_review on public.access_requests;
create policy access_requests_platform_admin_review
  on public.access_requests for update to authenticated
  using (private.is_platform_admin())
  with check (
    private.is_platform_admin()
    and status in ('pending', 'approved', 'declined')
  );

drop policy if exists access_requests_read_scoped on public.access_requests;
create policy access_requests_read_scoped
  on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());

drop policy if exists workspace_members_read_scoped on public.workspace_members;
create policy workspace_members_read_scoped
  on public.workspace_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    or private.is_platform_admin()
  );

create or replace function private.review_quorlyth_access_request(request_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  req public.access_requests%rowtype;
  matched_uid uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform administrators can review requests' using errcode = '42501';
  end if;
  if next_status not in ('approved', 'declined') then
    raise exception 'Invalid request status' using errcode = '22023';
  end if;

  update public.access_requests
  set status = next_status
  where id = request_id
  returning * into req;

  if not found then
    raise exception 'Access request not found' using errcode = 'P0002';
  end if;

  select id into matched_uid
  from auth.users
  where lower(email) = lower(req.email)
  limit 1;

  insert into public.workspace_members(email, full_name, status, user_id, updated_at)
  values(lower(req.email), req.full_name, next_status, coalesce(req.user_id, matched_uid), now())
  on conflict(email) do update set
    full_name = excluded.full_name,
    status = excluded.status,
    user_id = coalesce(excluded.user_id, public.workspace_members.user_id),
    updated_at = excluded.updated_at;

  if coalesce(req.user_id, matched_uid) is not null then
    insert into public.workspace_records(collection_path, record_id, data)
    values(
      'decisions',
      coalesce(req.user_id, matched_uid)::text,
      jsonb_build_object('status', next_status, 'at', extract(epoch from now()) * 1000)
    )
    on conflict(collection_path, record_id) do update
    set data = excluded.data, updated_at = now();
  end if;
end;
$function$;

-- Public, non-sensitive role probe for the UI. The database policies remain authoritative.
create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select auth.uid()) is not null and private.is_platform_admin();
$function$;
revoke all on function public.current_user_is_platform_admin() from public, anon;
grant execute on function public.current_user_is_platform_admin() to authenticated;

-- A single request per community/user prevents duplicate pending submissions.
create or replace function private.can_request_community_join(p_path text, p_data jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  uid text := (select auth.uid())::text;
  cid text := p_data->>'cid';
  user_id text := p_data->>'userId';
  community_data jsonb;
begin
  if uid is null or p_path is null or p_data is null
     or jsonb_typeof(p_data) <> 'object'
     or cid is null or cid !~ '^[A-Za-z0-9_-]{1,120}$'
     or user_id is distinct from uid
     or p_path <> 'communityJoinRequests/' || cid || '__' || uid
     or p_data->>'status' <> 'pending'
     or length(coalesce(p_data->>'message', '')) > 500 then
    return false;
  end if;

  select d.data into community_data
  from public.docs d
  where d.path = 'communities/' || cid;

  if community_data is null
     or coalesce(community_data->>'arch', 'false') = 'true'
     or coalesce(community_data->>'joinApproval', 'false') <> 'true'
     or private.can_manage_community(cid)
     or private.is_member_of_community(cid) then
    return false;
  end if;

  if exists (
    select 1 from public.docs r
    where r.path = p_path and r.data->>'status' = 'pending'
  ) then
    return false;
  end if;

  return true;
end;
$function$;
revoke all on function private.can_request_community_join(text, jsonb) from public, anon;
grant execute on function private.can_request_community_join(text, jsonb) to authenticated;

-- Community join requests are readable only by the requester and that community's manager.
drop policy if exists community_join_requests_read_scoped on public.docs;
create policy community_join_requests_read_scoped
  on public.docs for select to authenticated
  using (
    path ~ '^communityJoinRequests/[^/]+$'
    and path = 'communityJoinRequests/' || coalesce(data->>'cid', '') || '__' || coalesce(data->>'userId', '')
    and (
      data->>'userId' = (select auth.uid())::text
      or private.can_manage_community(data->>'cid')
    )
  );

drop policy if exists community_join_requests_insert_scoped on public.docs;
create policy community_join_requests_insert_scoped
  on public.docs for insert to authenticated
  with check (private.can_request_community_join(path, data));

drop policy if exists community_join_requests_update_scoped on public.docs;
create policy community_join_requests_update_scoped
  on public.docs for update to authenticated
  using (
    path ~ '^communityJoinRequests/[^/]+$'
    and path = 'communityJoinRequests/' || coalesce(data->>'cid', '') || '__' || coalesce(data->>'userId', '')
    and (
      (data->>'userId' = (select auth.uid())::text and data->>'status' = 'declined')
      or private.can_manage_community(data->>'cid')
    )
  )
  with check (
    path ~ '^communityJoinRequests/[^/]+$'
    and path = 'communityJoinRequests/' || coalesce(data->>'cid', '') || '__' || coalesce(data->>'userId', '')
    and (
      private.can_manage_community(data->>'cid')
      or private.can_request_community_join(path, data)
    )
  );

-- Even a direct write to members/{uid} cannot bypass a community's approval setting.
create or replace function private.guard_community_join_approval()
returns trigger
language plpgsql
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  target_uid text;
  actor_uid text := (select auth.uid())::text;
  previous_memberships jsonb := '{}'::jsonb;
  entry record;
  community_data jsonb;
begin
  if new.path !~ '^members/[^/]+$' or jsonb_typeof(coalesce(new.data->'c', '{}'::jsonb)) <> 'object' then
    return new;
  end if;

  target_uid := split_part(new.path, '/', 2);
  if tg_op = 'UPDATE' then
    previous_memberships := coalesce(old.data->'c', '{}'::jsonb);
  end if;

  for entry in
    select key, value from jsonb_each(coalesce(new.data->'c', '{}'::jsonb))
  loop
    if entry.value = 'true'::jsonb
       and coalesce(previous_memberships->>entry.key, 'false') <> 'true'
       and actor_uid = target_uid
       and not private.can_manage_community(entry.key) then
      select d.data into community_data
      from public.docs d where d.path = 'communities/' || entry.key;

      if coalesce(community_data->>'joinApproval', 'false') = 'true' then
        raise exception 'This community requires approval before joining'
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists docs_guard_community_join_approval on public.docs;
create trigger docs_guard_community_join_approval
  before insert or update on public.docs
  for each row execute function private.guard_community_join_approval();

-- Review and membership grant happen together; only a manager of this community
-- (or a platform administrator) can approve or decline its pending requests.
create or replace function public.review_community_join_request(
  p_cid text,
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
  request_path text;
  request_data jsonb;
  reviewed_at_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_cid is null or p_cid !~ '^[A-Za-z0-9_-]{1,120}$' or p_user_id is null then
    raise exception 'Invalid community or user ID' using errcode = '22023';
  end if;
  if p_status not in ('approved', 'declined') then
    raise exception 'Invalid join request status' using errcode = '22023';
  end if;
  if not private.can_manage_community(p_cid) then
    raise exception 'Only this community owner or a platform administrator can review its join requests'
      using errcode = '42501';
  end if;

  request_path := 'communityJoinRequests/' || p_cid || '__' || p_user_id::text;

  select d.data into request_data
  from public.docs d
  where d.path = request_path
    and d.data->>'cid' = p_cid
    and d.data->>'userId' = p_user_id::text
    and d.data->>'status' = 'pending'
  for update;

  if not found then
    raise exception 'Pending community join request not found' using errcode = 'P0002';
  end if;

  update public.docs
  set data = jsonb_set(
    jsonb_set(
      jsonb_set(request_data, '{status}', to_jsonb(p_status), true),
      '{reviewedBy}', to_jsonb((select auth.uid())::text), true
    ),
    '{reviewedAt}', to_jsonb(reviewed_at_ms), true
  ),
  updated_at = now()
  where path = request_path;

  if p_status = 'approved' then
    insert into public.docs(path, data)
    values ('members/' || p_user_id::text, jsonb_build_object('c', jsonb_build_object(p_cid, true)))
    on conflict(path) do update
    set data = jsonb_set(
      coalesce(public.docs.data, '{}'::jsonb),
      '{c}',
      coalesce(public.docs.data->'c', '{}'::jsonb) || jsonb_build_object(p_cid, true),
      true
    ),
    updated_at = now();
  end if;
end;
$function$;
revoke all on function public.review_community_join_request(text, uuid, text) from public, anon;
grant execute on function public.review_community_join_request(text, uuid, text) to authenticated;
