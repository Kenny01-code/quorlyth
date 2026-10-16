-- Keep PostgREST RPC entry points invoker-rights. The narrowly scoped
-- implementation remains in the private schema and performs its own authorization.
-- This preserves the frontend RPC names while removing unnecessary public
-- SECURITY DEFINER entry points.

-- The caller-bound role predicate can safely be called by an invoker-rights wrapper.
revoke all on function private.is_platform_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_platform_admin() to authenticated, service_role;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path to ''
as $function$
  select (select auth.uid()) is not null and private.is_platform_admin();
$function$;
revoke all on function public.current_user_is_platform_admin() from public, anon;
grant execute on function public.current_user_is_platform_admin() to authenticated, service_role;

-- Private implementation: list member IDs only after validating that the caller
-- is authenticated and belongs to or manages the requested community.
create or replace function private.list_community_member_ids(p_cid text)
returns table(user_id text)
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_cid is null
     or not (private.can_manage_community(p_cid) or private.is_member_of_community(p_cid)) then
    raise exception 'Only community members and managers can view this member list';
  end if;

  return query
    select split_part(d.path, '/', 2)::text
    from public.docs d
    where d.path ~ '^members/[^/]+$'
      and d.data->'c'->>p_cid = 'true'
    order by split_part(d.path, '/', 2);
end;
$function$;
revoke all on function private.list_community_member_ids(text) from public, anon, authenticated, service_role;
grant execute on function private.list_community_member_ids(text) to authenticated, service_role;

create or replace function public.list_community_member_ids(p_cid text)
returns table(user_id text)
language sql
stable
security invoker
set search_path to ''
as $function$
  select m.user_id from private.list_community_member_ids(p_cid) m;
$function$;
revoke all on function public.list_community_member_ids(text) from public, anon;
grant execute on function public.list_community_member_ids(text) to authenticated, service_role;

-- Private implementation: return aggregate contributor counts only to managers
-- of the requested community. Raw backing/member records never leave this helper.
create or replace function private.list_community_contributors(p_cid text)
returns table(user_id text, ideas_count integer, backings_count integer)
language plpgsql
stable
security definer
set search_path to ''
set row_security to 'off'
as $function$
declare
  v_owner_id text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_cid is null or not private.can_manage_community(p_cid) then
    raise exception 'Only community managers can view contributor analytics';
  end if;

  select coalesce(c.data->>'ownerId', c.data->>'createdBy', cfg.data->>'id')
    into v_owner_id
  from public.docs c
  left join public.docs cfg on cfg.path = 'config/owner'
  where c.path = 'communities/' || p_cid
  limit 1;

  return query
  with community_ideas as (
    select split_part(d.path, '/', 2) as idea_id,
           d.data->>'authorId' as author_id
    from public.docs d
    where d.path ~ '^ideas/[^/]+$'
      and d.data->>'cid' = p_cid
      and nullif(d.data->>'authorId', '') is not null
      and (v_owner_id is null or d.data->>'authorId' <> v_owner_id)
  ),
  idea_activity as (
    select ci.author_id,
           ci.idea_id,
           count(v.path)::integer as backing_count
    from community_ideas ci
    left join public.docs v
      on v.path ~ '^votes/[^/]+$'
     and v.data->'ideas'->>ci.idea_id = 'true'
    group by ci.author_id, ci.idea_id
  )
  select ia.author_id::text,
         count(*)::integer,
         coalesce(sum(ia.backing_count), 0)::integer
  from idea_activity ia
  group by ia.author_id
  order by count(*) desc, coalesce(sum(ia.backing_count), 0) desc, ia.author_id;
end;
$function$;
revoke all on function private.list_community_contributors(text) from public, anon, authenticated, service_role;
grant execute on function private.list_community_contributors(text) to authenticated, service_role;

create or replace function public.list_community_contributors(p_cid text)
returns table(user_id text, ideas_count integer, backings_count integer)
language sql
stable
security invoker
set search_path to ''
as $function$
  select c.user_id, c.ideas_count, c.backings_count
  from private.list_community_contributors(p_cid) c;
$function$;
revoke all on function public.list_community_contributors(text) from public, anon;
grant execute on function public.list_community_contributors(text) to authenticated, service_role;

-- Privileged state mutation lives in private schema. The public RPC is an
-- invoker-rights shim, so role checks, validation, and atomic writes remain
-- centralized in one audited function.
create or replace function private.review_community_join_request(
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
revoke all on function private.review_community_join_request(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.review_community_join_request(text, uuid, text) to authenticated, service_role;

create or replace function public.review_community_join_request(
  p_cid text,
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security invoker
set search_path to ''
as $function$
begin
  perform private.review_community_join_request(p_cid, p_user_id, p_status);
end;
$function$;
revoke all on function public.review_community_join_request(text, uuid, text) from public, anon;
grant execute on function public.review_community_join_request(text, uuid, text) to authenticated, service_role;
