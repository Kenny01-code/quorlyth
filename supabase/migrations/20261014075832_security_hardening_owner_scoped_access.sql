-- Quorlyth security hardening.
-- Preserve the existing docs(path,data) model and records while applying least privilege.
-- Authorization predicates live in the unexposed private schema; policy decisions are
-- performed against server-owned identity, ownership, membership, and related records.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists private.platform_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table private.platform_roles enable row level security;
revoke all on private.platform_roles from public, anon, authenticated, service_role;

-- Hourly write budgets provide database-enforced abuse protection even when callers bypass
-- the UI. A rejected statement rolls back its counter increment with the transaction.
create table if not exists private.write_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('idea_submission','collaboration_application')),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (user_id, action, window_started_at)
);
alter table private.write_rate_limits enable row level security;
revoke all on private.write_rate_limits from public, anon, authenticated, service_role;

create or replace function private.enforce_write_rate_limit(p_action text, p_limit integer)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $fn$
declare uid uuid := (select auth.uid()); bucket timestamptz := date_trunc('hour', now()); n integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into private.write_rate_limits(user_id, action, window_started_at, attempts)
  values (uid, p_action, bucket, 1)
  on conflict (user_id, action, window_started_at) do update
    set attempts = private.write_rate_limits.attempts + 1
    where private.write_rate_limits.attempts < p_limit
  returning attempts into n;
  if n is null then raise exception 'Write rate limit reached. Please try again later.' using errcode = 'P0001'; end if;
  delete from private.write_rate_limits where window_started_at < now() - interval '1 day';
end;
$fn$;


-- Preserve the existing, already claimed owner identity without relying on an email.
-- This seed only accepts the ID in the existing one-time claim and a confirmed Auth user.
insert into private.platform_roles(user_id, role)
select u.id, 'owner'
from public.docs d
join auth.users u on u.id =
  case when coalesce(d.data->>'id','') ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (d.data->>'id')::uuid else null end
where d.path = 'config/owner' and u.email_confirmed_at is not null
on conflict (user_id) do update set role = 'owner';

create or replace function private.is_platform_owner()
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from private.platform_roles r
    where r.user_id = (select auth.uid()) and r.role = 'owner'
  );
$fn$;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from private.platform_roles r
    where r.user_id = (select auth.uid()) and r.role in ('owner','admin')
  );
$fn$;

create or replace function private.is_member_of_community(p_cid text, p_uid uuid default null)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select p_cid is not null and exists (
    select 1 from public.docs m
    where m.path = 'members/' || coalesce(p_uid,(select auth.uid()))::text
      and coalesce(m.data->'c'->>p_cid,'false') = 'true'
  );
$fn$;

create or replace function private.can_manage_community(p_cid text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select p_cid is not null and (
    private.is_platform_admin()
    or exists (
      select 1 from public.docs c where c.path = 'communities/' || p_cid
        and (c.data->>'ownerId' = (select auth.uid())::text
          or c.data->>'createdBy' = (select auth.uid())::text)
    )
  );
$fn$;

create or replace function private.can_view_community(p_cid text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select p_cid is not null and (
    private.is_platform_admin()
    or exists (
      select 1 from public.docs c where c.path = 'communities/' || p_cid
        and (
          c.data->>'ownerId' = (select auth.uid())::text
          or c.data->>'createdBy' = (select auth.uid())::text
          or private.is_member_of_community(p_cid)
          or (
            coalesce(c.data->>'vis','listed') <> 'unlisted'
            and coalesce(c.data->>'arch','false') <> 'true'
          )
        )
    )
  );
$fn$;

create or replace function private.can_post_to_community(p_cid text)
returns boolean language plpgsql stable security definer
set search_path = '' set row_security = off
as $fn$
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

  return coalesce(c->>'post','anyone') = 'anyone'
    or (c->>'post' = 'members' and private.is_member_of_community(p_cid));
end;
$fn$;

create or replace function private.idea_community_id(p_idea_id text)
returns text language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select data->>'cid' from public.docs where path = 'ideas/' || p_idea_id;
$fn$;

create or replace function private.is_idea_author(p_idea_id text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select exists (select 1 from public.docs
    where path = 'ideas/' || p_idea_id
      and data->>'authorId' = (select auth.uid())::text);
$fn$;

create or replace function private.is_chat_member(p_conversation_id text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from public.docs c where c.path = 'conversations/' || p_conversation_id
      and jsonb_typeof(c.data->'members') = 'array'
      and (c.data->'members') ? (select auth.uid())::text
  );
$fn$;

create or replace function private.is_chat_user_member(p_conversation_id text, p_user_id uuid)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select p_user_id is not null and exists (
    select 1 from public.docs c where c.path = 'conversations/' || p_conversation_id
      and jsonb_typeof(c.data->'members') = 'array'
      and (c.data->'members') ? p_user_id::text
  );
$fn$;

create or replace function private.is_chat_call_in_conversation(p_call_id text, p_conversation_id text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select (select auth.uid()) is not null and exists (
    select 1 from public.docs c where c.path = 'calls/' || p_call_id
      and c.data->>'conversationId' = p_conversation_id
      and (c.data->>'callerId' = (select auth.uid())::text
        or c.data->>'calleeId' = (select auth.uid())::text)
      and private.is_chat_member(p_conversation_id)
  );
$fn$;

create or replace function private.is_chat_message_sender(p_message_id text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select exists (select 1 from public.docs
    where path = 'messages/' || p_message_id
      and data->>'senderId' = (select auth.uid())::text);
$fn$;

create or replace function private.is_chat_call_participant(p_call_id text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select exists (select 1 from public.docs c
    where c.path = 'calls/' || p_call_id
      and (c.data->>'callerId' = (select auth.uid())::text
        or c.data->>'calleeId' = (select auth.uid())::text)
      and private.is_chat_member(c.data->>'conversationId'));
$fn$;

create or replace function private.sanitize_plain_text(p_value text, p_max integer)
returns text language sql immutable
set search_path = ''
as $fn$
  select left(regexp_replace(
    regexp_replace(coalesce(p_value,''), '<[^>]*>', '', 'g'),
    '[[:cntrl:]]', ' ', 'g'
  ), greatest(0, least(coalesce(p_max,4000),20000)));
$fn$;

-- Read policy: explicitly decide by path. Private user vaults and requests are isolated;
-- reviews, promotion drafts and workspace settings are not readable by ordinary members.
create or replace function private.can_read_doc(p_path text, p_data jsonb)
returns boolean language plpgsql stable security definer
set search_path = '' set row_security = off
as $fn$
declare uid text := (select auth.uid())::text; item record; cid text; outcome_status text;
begin
  if p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;

  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then
    return uid is not null;
  end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$' then return false; end if;
  if p_path ~ '^requests/[^/]+$' or p_path ~ '^decisions/[^/]+$' then
    return (uid is not null and split_part(p_path,'/',2) = uid) or private.is_platform_admin();
  end if;
  if p_path = 'config/owner' then return private.is_platform_owner(); end if;

  if p_path ~ '^communities/[^/]+$' then
    return private.can_view_community(split_part(p_path,'/',2));
  elsif p_path ~ '^ideas/[^/]+$' then
    return private.can_view_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    return private.can_view_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^profiles/[^/]+$' then
    return true; -- Profiles are intentionally public; private fields belong in data/users/{uid}.
  end if;

  if uid is null then return false; end if;
  if private.is_platform_admin() then return true; end if;

  if p_path ~ '^members/[^/]+$' then
    if split_part(p_path,'/',2) = uid then return true; end if;
    if jsonb_typeof(coalesce(p_data->'c','{}'::jsonb)) <> 'object' then return false; end if;
    for item in select key,value from jsonb_each(coalesce(p_data->'c','{}'::jsonb)) loop
      if item.value = 'true'::jsonb and not private.can_view_community(item.key) then return false; end if;
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
    select data->>'status' into outcome_status from public.docs
      where path = 'ideaOutcomes/' || split_part(p_path,'/',2);
    return private.can_manage_community(cid)
      or (private.can_view_community(cid) and outcome_status in ('selected','promoted'));
  elsif p_path ~ '^milestones/[^/]+$' then
    select data->>'ideaId' into cid from public.docs
      where path = 'projects/' || (p_data->>'projectId');
    if cid is null then return false; end if;
    select data->>'status' into outcome_status from public.docs where path = 'ideaOutcomes/' || cid;
    return private.can_manage_community(private.idea_community_id(cid))
      or (private.can_view_community(private.idea_community_id(cid)) and outcome_status in ('selected','promoted'));
  elsif p_path ~ '^promotions/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^volunteers/[^/]+$' then
    return p_data->>'applicantId' = uid
      or private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path = 'settings/space' then
    return true; -- Read-only public feature flags/settings; writes are platform-owner only.
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
$fn$;

-- Insert policy: caller identity is derived from auth.uid(); IDs and evidence are not client-asserted.
create or replace function private.can_insert_doc(p_path text, p_data jsonb)
returns boolean language plpgsql stable security definer
set search_path = '' set row_security = off
as $fn$
declare uid text := (select auth.uid())::text; item record; cid text; project_idea text; review_status text;
begin
  if uid is null or p_path is null or p_data is null or jsonb_typeof(p_data) <> 'object' then return false; end if;
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
      and private.can_post_to_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^reviews/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^ideaOutcomes/[^/]+$' then
    return false; -- Created by the trusted status-sync trigger only.
  elsif p_path ~ '^volunteers/[^/]+$' then
    cid := private.idea_community_id(p_data->>'ideaId');
    return (
      p_data->>'applicantId' = uid and coalesce(p_data->>'status','pending') = 'pending'
      and exists (select 1 from public.docs c where c.path = 'communities/' || cid
        and coalesce(c.data->>'arch','false') <> 'true')
      and (private.is_member_of_community(cid) or private.can_manage_community(cid))
    ) or (
      -- The client store upserts mutable documents. Only the community creator may upsert
      -- a previously existing application to accept/decline it.
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
    select data->>'ideaId' into project_idea from public.docs where path = 'projects/' || (p_data->>'projectId');
    return project_idea is not null and p_data->>'createdBy' = uid
      and private.can_manage_community(private.idea_community_id(project_idea));
  elsif p_path ~ '^promotions/[^/]+$' then
    select data->>'status' into review_status from public.docs
      where path = 'reviews/' || (p_data->>'ideaId');
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
$fn$;

create or replace function private.can_update_doc(p_path text, p_data jsonb)
returns boolean language plpgsql stable security definer
set search_path = '' set row_security = off
as $fn$
declare uid text := (select auth.uid())::text; idea_id text; cid text; item record;
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
    select data->>'ideaId' into idea_id from public.docs where path = 'projects/' || (p_data->>'projectId');
    return idea_id is not null and private.can_manage_community(private.idea_community_id(idea_id));
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
$fn$;

create or replace function private.can_delete_doc(p_path text, p_data jsonb)
returns boolean language plpgsql stable security definer
set search_path = '' set row_security = off
as $fn$
declare uid text := (select auth.uid())::text; idea_id text; outcome_status text;
begin
  if uid is null or p_path is null or p_data is null then return false; end if;
  if p_path = 'data/users/' || uid or p_path like 'data/users/' || uid || '/%' then return true; end if;
  if p_path ~ '^data/users/[^/]+(/.*)?$' or p_path = 'config/owner' or p_path ~ '^ideaOutcomes/[^/]+$' then return false; end if;
  if p_path ~ '^profiles/[^/]+$' or p_path ~ '^members/[^/]+$'
     or p_path ~ '^votes/[^/]+$' or p_path ~ '^requests/[^/]+$' then
    return split_part(p_path,'/',2) = uid;
  end if;
  if private.is_platform_admin() then return true; end if;
  if p_path ~ '^communities/[^/]+$' then
    return private.can_manage_community(split_part(p_path,'/',2));
  elsif p_path ~ '^ideas/[^/]+$' then
    idea_id := split_part(p_path,'/',2);
    select data->>'status' into outcome_status from public.docs where path = 'ideaOutcomes/' || idea_id;
    return private.is_idea_author(idea_id) and coalesce(outcome_status,'review') not in ('selected','promoted')
      and not exists (select 1 from public.docs v where v.path ~ '^volunteers/[^/]+$' and v.data->>'ideaId' = idea_id);
  elsif p_path ~ '^ideas/[^/]+/comments/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2))) or p_data->>'authorId' = uid;
  elsif p_path ~ '^reviews/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(split_part(p_path,'/',2)));
  elsif p_path ~ '^volunteers/[^/]+$' then
    return p_data->>'applicantId' = uid and coalesce(p_data->>'status','pending') = 'pending';
  elsif p_path ~ '^projects/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^milestones/[^/]+$' then
    return private.can_manage_community(private.idea_community_id((select data->>'ideaId' from public.docs where path = 'projects/' || (p_data->>'projectId'))));
  elsif p_path ~ '^promotions/[^/]+$' then
    return private.can_manage_community(private.idea_community_id(p_data->>'ideaId'));
  elsif p_path ~ '^chatReads/[^/]+$' or p_path ~ '^chatPreferences/[^/]+$'
     or p_path ~ '^chatMessageHides/[^/]+$' or p_path ~ '^chatMessageReactions/[^/]+$' then
    return p_data->>'userId' = uid and private.is_chat_member(p_data->>'conversationId');
  elsif p_path ~ '^conversations/[^/]+$' then
    return private.is_chat_member(split_part(p_path,'/',2));
  end if;
  return false;
end;
$fn$;

-- These safe wrappers exist only for backwards compatibility; all ownership state is in
-- private.platform_roles, not JWT user_metadata and not a hardcoded email.
create or replace function public.is_owner()
returns boolean language sql stable security invoker set search_path = ''
as $fn$ select private.is_platform_owner(); $fn$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function private.is_platform_owner() to authenticated;

-- Replace EVERY previous docs policy because permissive policies are OR-combined.
do $drop_docs_policies$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'docs' loop
    execute format('drop policy if exists %I on public.docs', pol.policyname);
  end loop;
end
$drop_docs_policies$;

revoke all on table public.docs from public, anon, authenticated;
grant select on table public.docs to anon, authenticated;
grant insert, update, delete on table public.docs to authenticated;
alter table public.docs enable row level security;

create policy docs_read_scoped on public.docs for select to anon, authenticated
using ((select private.can_read_doc(path,data)));
create policy docs_insert_scoped on public.docs for insert to authenticated
with check ((select private.can_insert_doc(path,data)));
create policy docs_update_scoped on public.docs for update to authenticated
using ((select private.can_update_doc(path,data)))
with check ((select private.can_update_doc(path,data)));
create policy docs_delete_scoped on public.docs for delete to authenticated
using ((select private.can_delete_doc(path,data)));

-- Only the four policy predicates and helpers called by invoker wrappers need caller grants.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_read_doc(text,jsonb) to anon, authenticated;
grant execute on function private.can_insert_doc(text,jsonb) to authenticated;
grant execute on function private.can_update_doc(text,jsonb) to authenticated;
grant execute on function private.can_delete_doc(text,jsonb) to authenticated;
grant execute on function private.is_platform_owner() to authenticated;

-- Trigger-time validation sanitizes text and rejects invented IDs, invalid states, and changes
-- to identity/ownership fields even when a client bypasses the UI and calls PostgREST directly.
create or replace function private.validate_doc_record()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $fn$
declare entry record; old_data jsonb;
begin
  if NEW.path is null or length(NEW.path) > 500
    or NEW.path !~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$'
    or jsonb_typeof(NEW.data) is distinct from 'object'
    or pg_column_size(NEW.data) > 131072 then
    raise exception 'Invalid document path or payload' using errcode = '22023';
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.path is distinct from OLD.path then raise exception 'Document paths are immutable' using errcode = '42501'; end if;
    old_data := OLD.data;
  else
    -- createSupabaseStore uses ON CONFLICT upsert for mutable docs. Resolve an existing
    -- path here so update guards/rate budgets apply only to genuinely new records.
    select d.data into old_data from public.docs d where d.path = NEW.path;
    if old_data is null and NEW.path ~ '^ideas/[^/]+$' then
      perform private.enforce_write_rate_limit('idea_submission', 10);
    elsif old_data is null and NEW.path ~ '^volunteers/[^/]+$' then
      perform private.enforce_write_rate_limit('collaboration_application', 5);
    end if;
  end if;

  if NEW.path ~ '^communities/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{name}',to_jsonb(private.sanitize_plain_text(NEW.data->>'name',100)),true);
    NEW.data := jsonb_set(NEW.data,'{purpose}',to_jsonb(private.sanitize_plain_text(NEW.data->>'purpose',1200)),true);
    NEW.data := jsonb_set(NEW.data,'{welcome}',to_jsonb(private.sanitize_plain_text(NEW.data->>'welcome',1200)),true);
    NEW.data := jsonb_set(NEW.data,'{rules}',to_jsonb(private.sanitize_plain_text(NEW.data->>'rules',3000)),true);
    if length(trim(coalesce(NEW.data->>'name',''))) < 1
      or coalesce(NEW.data->>'vis','listed') not in ('listed','unlisted')
      or coalesce(NEW.data->>'post','anyone') not in ('anyone','members','owner') then
      raise exception 'Invalid community name, visibility, or posting rule' using errcode = '22023';
    end if;
    if old_data is not null and (old_data->>'ownerId' is distinct from NEW.data->>'ownerId'
      or old_data->>'createdBy' is distinct from NEW.data->>'createdBy') then
      raise exception 'Community ownership is immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^ideas/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{title}',to_jsonb(private.sanitize_plain_text(NEW.data->>'title',120)),true);
    NEW.data := jsonb_set(NEW.data,'{body}',to_jsonb(private.sanitize_plain_text(NEW.data->>'body',6000)),true);
    if length(trim(coalesce(NEW.data->>'title',''))) < 1
      or jsonb_typeof(coalesce(NEW.data->'tags','[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(NEW.data->'tags','[]'::jsonb)) > 20 then
      raise exception 'Invalid idea title, body, or tags' using errcode = '22023';
    end if;
    if old_data is not null and (old_data->>'authorId' is distinct from NEW.data->>'authorId'
      or old_data->>'cid' is distinct from NEW.data->>'cid' or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Idea author, community, and creation time are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^ideas/[^/]+/comments/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{text}',to_jsonb(private.sanitize_plain_text(NEW.data->>'text',4000)),true);
    if length(trim(coalesce(NEW.data->>'text',''))) < 1 then raise exception 'Comment cannot be empty' using errcode = '22023'; end if;
    if old_data is not null and (old_data->>'authorId' is distinct from NEW.data->>'authorId'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Comment authorship is immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^profiles/[^/]+$' then
    if NEW.data ? 'name' then NEW.data := jsonb_set(NEW.data,'{name}',to_jsonb(private.sanitize_plain_text(NEW.data->>'name',80)),true); end if;
    if NEW.data ? 'head' then NEW.data := jsonb_set(NEW.data,'{head}',to_jsonb(private.sanitize_plain_text(NEW.data->>'head',160)),true); end if;
    if NEW.data ? 'bio' then NEW.data := jsonb_set(NEW.data,'{bio}',to_jsonb(private.sanitize_plain_text(NEW.data->>'bio',1800)),true); end if;
  elsif NEW.path ~ '^members/[^/]+$' then
    if jsonb_typeof(coalesce(NEW.data->'c','{}'::jsonb)) <> 'object' then raise exception 'Invalid membership map' using errcode = '22023'; end if;
    for entry in select key,value from jsonb_each(coalesce(NEW.data->'c','{}'::jsonb)) loop
      if entry.value not in ('true'::jsonb,'false'::jsonb) then raise exception 'Invalid membership value' using errcode = '22023'; end if;
      if entry.value = 'true'::jsonb
        and not exists (select 1 from public.docs c
          where c.path = 'communities/' || entry.key and coalesce(c.data->>'arch','false') <> 'true')
        and coalesce(old_data->'c'->>entry.key,'false') <> 'true' then
        raise exception 'Membership must reference an existing, active community' using errcode = '22023';
      end if;
    end loop;
  elsif NEW.path ~ '^votes/[^/]+$' then
    if jsonb_typeof(coalesce(NEW.data->'ideas','{}'::jsonb)) <> 'object' then raise exception 'Invalid votes map' using errcode = '22023'; end if;
    for entry in select key,value from jsonb_each(coalesce(NEW.data->'ideas','{}'::jsonb)) loop
      if entry.value not in ('true'::jsonb,'false'::jsonb) then raise exception 'Invalid vote value' using errcode = '22023'; end if;
      if entry.value = 'true'::jsonb and not exists (select 1 from public.docs i
        where i.path = 'ideas/' || entry.key and private.can_view_community(i.data->>'cid')) then
        raise exception 'Vote must reference an existing, visible idea' using errcode = '22023';
      end if;
    end loop;
  elsif NEW.path ~ '^reviews/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{reason}',to_jsonb(private.sanitize_plain_text(NEW.data->>'reason',3000)),true);
    if coalesce(NEW.data->>'status','review') not in ('review','selected','held','declined','promoted') then
      raise exception 'Invalid review status' using errcode = '22023';
    end if;
    for entry in select key,value from jsonb_each(NEW.data) where key in ('score','f','o','r') loop
      if jsonb_typeof(entry.value) <> 'number' or (entry.value::text)::numeric < 0 or (entry.value::text)::numeric > 100 then
        raise exception 'Review scores must be numbers between 0 and 100' using errcode = '22023';
      end if;
    end loop;
  elsif NEW.path ~ '^volunteers/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{message}',to_jsonb(private.sanitize_plain_text(NEW.data->>'message',3000)),true);
    if coalesce(NEW.data->>'status','pending') not in ('pending','accepted','declined') then raise exception 'Invalid application status' using errcode = '22023'; end if;
    if old_data is not null then
      if old_data->>'applicantId' is distinct from NEW.data->>'applicantId'
        or old_data->>'ideaId' is distinct from NEW.data->>'ideaId'
        or old_data->>'at' is distinct from NEW.data->>'at' then
        raise exception 'Application owner, idea, and creation time are immutable' using errcode = '42501';
      end if;
      if old_data->>'status' in ('accepted','declined') and (
        old_data->>'status' is distinct from NEW.data->>'status'
        or old_data->>'reviewedBy' is distinct from NEW.data->>'reviewedBy'
        or old_data->>'reviewedAt' is distinct from NEW.data->>'reviewedAt'
      ) then
        raise exception 'Reviewed applications and their audit fields are immutable' using errcode = '22023';
      end if;
      if NEW.data->>'status' is distinct from old_data->>'status'
        and NEW.data->>'reviewedBy' is distinct from (select auth.uid())::text then
        raise exception 'A creator decision must identify its authenticated reviewer' using errcode = '42501';
      end if;
    end if;
  elsif NEW.path ~ '^projects/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{summary}',to_jsonb(private.sanitize_plain_text(NEW.data->>'summary',4000)),true);
    if NEW.data->>'ideaId' is distinct from split_part(NEW.path,'/',2)
      or length(trim(coalesce(NEW.data->>'summary',''))) < 1
      or coalesce(NEW.data->>'status','active') not in ('active','completed') then
      raise exception 'Invalid project fields or status' using errcode = '22023';
    end if;
    if old_data is not null and (old_data->>'ideaId' is distinct from NEW.data->>'ideaId'
      or old_data->>'createdBy' is distinct from NEW.data->>'createdBy'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Project ownership and idea association are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^milestones/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{title}',to_jsonb(private.sanitize_plain_text(NEW.data->>'title',120)),true);
    NEW.data := jsonb_set(NEW.data,'{description}',to_jsonb(private.sanitize_plain_text(NEW.data->>'description',2000)),true);
    if length(trim(coalesce(NEW.data->>'title',''))) < 1
      or coalesce(NEW.data->>'status','todo') not in ('todo','in_progress','completed')
      or coalesce(length(NEW.data->>'projectId'),0) < 1 then raise exception 'Invalid milestone fields' using errcode = '22023'; end if;
    if old_data is not null and (old_data->>'projectId' is distinct from NEW.data->>'projectId'
      or old_data->>'createdBy' is distinct from NEW.data->>'createdBy'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Milestone owner and project association are immutable' using errcode = '42501';
    end if;
    if old_data is not null and old_data->>'status' = 'completed' and NEW.data->>'status' <> 'completed' then
      raise exception 'Completed milestones cannot be reopened' using errcode = '22023';
    end if;
  elsif NEW.path ~ '^conversations/[^/]+$' then
    if TG_OP = 'INSERT' and NEW.data->>'createdBy' is distinct from (select auth.uid())::text then
      raise exception 'Conversation creator must be the authenticated caller' using errcode = '42501';
    end if;
    if coalesce(NEW.data->>'type','') not in ('direct','group')
      or jsonb_typeof(NEW.data->'members') <> 'array'
      or not ((NEW.data->'members') ? (select auth.uid())::text)
      or jsonb_array_length(NEW.data->'members') not between 2 and 100
      or (NEW.data->>'type' = 'direct' and jsonb_array_length(NEW.data->'members') <> 2)
      or (NEW.data->>'type' = 'group' and jsonb_array_length(NEW.data->'members') < 3)
      or (NEW.data->>'type' = 'group' and length(trim(coalesce(NEW.data->>'title',''))) not between 1 and 60) then
      raise exception 'Invalid conversation participants or title' using errcode = '22023';
    end if;
    if (select count(distinct member_id) from jsonb_array_elements_text(NEW.data->'members') as members(member_id))
       <> jsonb_array_length(NEW.data->'members') then
      raise exception 'Conversation participant IDs must be unique' using errcode = '22023';
    end if;
    for entry in select value from jsonb_array_elements(NEW.data->'members') as members(value) loop
      if jsonb_typeof(entry.value) <> 'string'
        or coalesce(entry.value #>> '{}','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or not exists (select 1 from auth.users u where u.id = (entry.value #>> '{}')::uuid) then
        raise exception 'Conversation participants must be real user IDs' using errcode = '22023';
      end if;
    end loop;
    if old_data is not null and (
      old_data->>'createdBy' is distinct from NEW.data->>'createdBy'
      or old_data->'members' is distinct from NEW.data->'members'
      or old_data->>'type' is distinct from NEW.data->>'type'
      or old_data->>'createdAt' is distinct from NEW.data->>'createdAt'
    ) then
      raise exception 'Conversation identity and membership are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^messages/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{text}',to_jsonb(private.sanitize_plain_text(NEW.data->>'text',4000)),true);
    if length(trim(coalesce(NEW.data->>'text',''))) < 1
      or length(coalesce(NEW.data->>'text','')) > 4000
      or NEW.data->>'senderId' is null
      or not private.is_chat_user_member(NEW.data->>'conversationId',(NEW.data->>'senderId')::uuid) then
      raise exception 'Invalid message or conversation membership' using errcode = '22023';
    end if;
    if old_data is not null and (
      old_data->>'senderId' is distinct from NEW.data->>'senderId'
      or old_data->>'conversationId' is distinct from NEW.data->>'conversationId'
      or old_data->>'at' is distinct from NEW.data->>'at'
    ) then
      raise exception 'Message authorship and destination are immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^calls/[^/]+$' then
    if NEW.data->>'id' is distinct from split_part(NEW.path,'/',2)
      or coalesce(NEW.data->>'mode','') not in ('voice','video')
      or coalesce(NEW.data->>'state','') not in ('preparing','ringing','accepted','declined','ended')
      or NEW.data->>'callerId' = NEW.data->>'calleeId'
      or NEW.data->>'callerId' is null or NEW.data->>'calleeId' is null
      or not private.is_chat_user_member(NEW.data->>'conversationId',(NEW.data->>'callerId')::uuid)
      or not private.is_chat_user_member(NEW.data->>'conversationId',(NEW.data->>'calleeId')::uuid) then
      raise exception 'Invalid call participants, conversation or state' using errcode = '22023';
    end if;
    if old_data is null and NEW.data->>'callerId' is distinct from (select auth.uid())::text then
      raise exception 'Only the authenticated caller can initiate a call' using errcode = '42501';
    end if;
    if old_data is not null then
      if old_data->>'id' is distinct from NEW.data->>'id'
        or old_data->>'callerId' is distinct from NEW.data->>'callerId'
        or old_data->>'calleeId' is distinct from NEW.data->>'calleeId'
        or old_data->>'conversationId' is distinct from NEW.data->>'conversationId'
        or old_data->>'mode' is distinct from NEW.data->>'mode'
        or old_data->>'createdAt' is distinct from NEW.data->>'createdAt' then
        raise exception 'Call identity and participants are immutable' using errcode = '42501';
      end if;
      if old_data->>'state' is distinct from NEW.data->>'state' and not (
        (old_data->>'state' = 'preparing' and NEW.data->>'state' in ('ringing','ended'))
        or (old_data->>'state' = 'ringing' and NEW.data->>'state' in ('accepted','declined','ended'))
        or (old_data->>'state' = 'accepted' and NEW.data->>'state' = 'ended')
      ) then
        raise exception 'Invalid call state transition' using errcode = '22023';
      end if;
      if old_data->'offer' is distinct from NEW.data->'offer'
        and not (old_data->>'state' = 'preparing' and NEW.data->>'state' = 'ringing') then
        raise exception 'Call offer cannot be replaced' using errcode = '42501';
      end if;
      if old_data->'answer' is distinct from NEW.data->'answer'
        and not (old_data->>'state' = 'ringing' and NEW.data->>'state' = 'accepted') then
        raise exception 'Call answer cannot be replaced' using errcode = '42501';
      end if;
    end if;
  elsif NEW.path ~ '^callSignals/[^/]+$' then
    if NEW.data->>'id' is distinct from split_part(NEW.path,'/',2)
      or NEW.data->>'fromId' is distinct from (select auth.uid())::text
      or NEW.data->>'toId' = NEW.data->>'fromId'
      or jsonb_typeof(NEW.data->'candidate') <> 'object'
      or not private.is_chat_call_in_conversation(NEW.data->>'callId',NEW.data->>'conversationId')
      or not exists (
        select 1 from public.docs c where c.path = 'calls/' || (NEW.data->>'callId')
          and ((c.data->>'callerId' = NEW.data->>'fromId' and c.data->>'calleeId' = NEW.data->>'toId')
            or (c.data->>'calleeId' = NEW.data->>'fromId' and c.data->>'callerId' = NEW.data->>'toId'))
      ) then
      raise exception 'Invalid call signal participants or conversation' using errcode = '42501';
    end if;
    if old_data is not null and (
      old_data->>'id' is distinct from NEW.data->>'id'
      or old_data->>'callId' is distinct from NEW.data->>'callId'
      or old_data->>'conversationId' is distinct from NEW.data->>'conversationId'
      or old_data->>'fromId' is distinct from NEW.data->>'fromId'
      or old_data->>'toId' is distinct from NEW.data->>'toId'
    ) then
      raise exception 'Call signal identity is immutable' using errcode = '42501';
    end if;
  elsif NEW.path ~ '^promotions/[^/]+$' then
    NEW.data := jsonb_set(NEW.data,'{text}',to_jsonb(private.sanitize_plain_text(NEW.data->>'text',10000)),true);
    if length(trim(coalesce(NEW.data->>'text',''))) < 1 or NEW.data ? 'publishedAt'
      or NEW.data ? 'externalPostId' or NEW.data->>'status' in ('published','posted') then
      raise exception 'Only non-empty drafts are supported; external publishing is not configured' using errcode = '22023';
    end if;
    NEW.data := NEW.data || jsonb_build_object('status','draft','published',false);
    if old_data is not null and (old_data->>'ideaId' is distinct from NEW.data->>'ideaId'
      or old_data->>'by' is distinct from NEW.data->>'by'
      or old_data->>'at' is distinct from NEW.data->>'at') then
      raise exception 'Draft author and idea are immutable' using errcode = '42501';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$fn$;

drop trigger if exists validate_doc_record on public.docs;
create trigger validate_doc_record before insert or update on public.docs
for each row execute function private.validate_doc_record();

-- Public-safe outcome projection makes idea status visible without exposing private review
-- rationale, score, or creator-only decision metadata.
create or replace function private.sync_idea_outcome()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $fn$
declare id text;
begin
  if TG_OP = 'DELETE' then
    id := split_part(OLD.path,'/',2);
    if OLD.path ~ '^reviews/[^/]+$' then
      delete from public.docs where path = 'ideaOutcomes/' || id;
    end if;
    return OLD;
  end if;
  id := split_part(NEW.path,'/',2);
  if NEW.path ~ '^reviews/[^/]+$' then
    insert into public.docs(path,data,updated_at)
    values ('ideaOutcomes/' || id, jsonb_build_object(
      'ideaId',id,
      'status',coalesce(NEW.data->>'status','review'),
      'at',coalesce(NEW.data->'at',to_jsonb((extract(epoch from now())*1000)::bigint))
    ),now())
    on conflict(path) do update set data=excluded.data, updated_at=now();
  end if;
  return NEW;
end;
$fn$;
drop trigger if exists sync_idea_outcome_insert on public.docs;
drop trigger if exists sync_idea_outcome_update on public.docs;
drop trigger if exists sync_idea_outcome_delete on public.docs;
create trigger sync_idea_outcome_insert after insert on public.docs
for each row when (NEW.path ~ '^reviews/[^/]+$') execute function private.sync_idea_outcome();
create trigger sync_idea_outcome_update after update on public.docs
for each row when (NEW.path ~ '^reviews/[^/]+$') execute function private.sync_idea_outcome();
create trigger sync_idea_outcome_delete after delete on public.docs
for each row when (OLD.path ~ '^reviews/[^/]+$') execute function private.sync_idea_outcome();

insert into public.docs(path,data,updated_at)
select 'ideaOutcomes/' || split_part(path,'/',2),
  jsonb_build_object('ideaId',split_part(path,'/',2),'status',coalesce(data->>'status','review'),
    'at',coalesce(data->'at',to_jsonb((extract(epoch from now())*1000)::bigint))),now()
from public.docs where path ~ '^reviews/[^/]+$'
on conflict(path) do update set data=excluded.data, updated_at=now();

-- Delete all prior broad policies on auxiliary data tables, then re-add scoped policies.
do $drop_aux_policies$
declare pol record;
begin
  for pol in select tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('access_requests','workspace_members','workspace_records')
  loop
    execute format('drop policy if exists %I on public.%I',pol.policyname,pol.tablename);
  end loop;
end
$drop_aux_policies$;

revoke all on table public.access_requests from public,anon,authenticated;
grant insert on table public.access_requests to anon,authenticated;
grant select,update on table public.access_requests to authenticated;
create policy access_requests_submit_pending on public.access_requests for insert to anon,authenticated
with check (status='pending' and (user_id is null or user_id=(select auth.uid()))
  and length(trim(full_name)) between 1 and 80 and length(trim(email)) between 3 and 320
  and length(trim(message)) between 1 and 1000);
create policy access_requests_read_scoped on public.access_requests for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_platform_owner()));
create policy access_requests_owner_review on public.access_requests for update to authenticated
using ((select private.is_platform_owner()))
with check ((select private.is_platform_owner()) and status in ('pending','approved','declined'));

revoke all on table public.workspace_members from public,anon,authenticated;
grant select on table public.workspace_members to authenticated;
create policy workspace_members_read_scoped on public.workspace_members for select to authenticated
using (user_id=(select auth.uid())
  or email=lower(coalesce((select auth.jwt())->>'email',''))
  or (select private.is_platform_owner()));

create or replace function private.is_member_of_quorlyth_workspace()
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select private.is_platform_admin()
    or exists (select 1 from public.workspace_records w
      where w.collection_path='decisions' and w.record_id=(select auth.uid())::text and w.data->>'status'='approved')
    or exists (select 1 from public.workspace_members m
      where m.user_id=(select auth.uid()) and m.status='approved');
$fn$;

create or replace function private.can_read_quorlyth_record(target_path text, target_id text)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select private.is_platform_admin()
    or (
      target_path in ('votes','members','data/users','decisions','requests')
      and target_id = (select auth.uid())::text
    )
    or (
      private.is_member_of_quorlyth_workspace()
      and (
        target_path = 'ideas'
        or target_path ~ '^ideas/[^/]+/comments$'
        or target_path = 'profiles'
      )
    );
$fn$;

create or replace function private.can_write_quorlyth_record(target_path text,target_id text,target_data jsonb)
returns boolean language sql stable security definer
set search_path = '' set row_security = off
as $fn$
  select private.is_platform_admin() or (
    private.is_member_of_quorlyth_workspace() and (
      (target_path='ideas' and target_data->>'authorId'=(select auth.uid())::text)
      or (target_path ~ '^ideas/[^/]+/comments$' and target_data->>'authorId'=(select auth.uid())::text)
      or (target_path='votes' and target_id=(select auth.uid())::text)
      or (target_path='members' and target_id=(select auth.uid())::text)
      or (target_path='data/users' and target_id=(select auth.uid())::text)
      or (target_path='profiles' and target_id=(select auth.uid())::text)
    )
  );
$fn$;

revoke all on table public.workspace_records from public,anon,authenticated;
grant select,insert,update,delete on table public.workspace_records to authenticated;
create policy workspace_records_read_scoped on public.workspace_records for select to authenticated
using ((select private.can_read_quorlyth_record(collection_path,record_id)));
create policy workspace_records_insert_scoped on public.workspace_records for insert to authenticated
with check ((select private.can_write_quorlyth_record(collection_path,record_id,data)));
create policy workspace_records_update_scoped on public.workspace_records for update to authenticated
using ((select private.can_write_quorlyth_record(collection_path,record_id,data)))
with check ((select private.can_write_quorlyth_record(collection_path,record_id,data)));
create policy workspace_records_delete_scoped on public.workspace_records for delete to authenticated
using ((select private.can_write_quorlyth_record(collection_path,record_id,data)));

-- Convert privileged public helpers to invoker wrappers or remove direct browser execution.
create or replace function public.is_owner()
returns boolean language sql stable security invoker set search_path=''
as $fn$ select private.is_platform_owner(); $fn$;
revoke all on function public.is_owner() from public,anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function private.is_platform_owner() to authenticated;

create or replace function private.admin_delete_community(p_cid text)
returns jsonb language plpgsql security definer
set search_path='' set row_security=off
as $fn$
declare idea_ids text[]; project_ids text[]; idea_count integer:=0; deleted_count integer:=0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_cid is null or p_cid !~ '^[A-Za-z0-9_-]{1,120}$' then raise exception 'Invalid community ID' using errcode='22023'; end if;
  if not private.can_manage_community(p_cid) then raise exception 'Only the community owner or platform administrator can delete this community' using errcode='42501'; end if;
  if not exists(select 1 from public.docs where path='communities/'||p_cid) then raise exception 'Community not found' using errcode='P0002'; end if;
  select coalesce(array_agg(split_part(path,'/',2)),array[]::text[]) into idea_ids
    from public.docs where path~'^ideas/[^/]+$' and data->>'cid'=p_cid;
  idea_count:=coalesce(array_length(idea_ids,1),0);
  select coalesce(array_agg(split_part(path,'/',2)),array[]::text[]) into project_ids
    from public.docs where path~'^projects/[^/]+$' and data->>'ideaId'=any(idea_ids);
  update public.docs set data=jsonb_set(data,'{c}',coalesce(data->'c','{}'::jsonb)-p_cid,true),updated_at=now()
    where path~'^members/[^/]+$' and coalesce(data->'c','{}'::jsonb)?p_cid;
  delete from public.docs d where d.path='communities/'||p_cid
    or exists(select 1 from unnest(idea_ids)i(id) where d.path='ideas/'||i.id or d.path like 'ideas/'||i.id||'/%')
    or exists(select 1 from unnest(idea_ids)i(id) where d.path in ('reviews/'||i.id,'ideaOutcomes/'||i.id,'projects/'||i.id))
    or (d.path~'^volunteers/[^/]+$' and d.data->>'ideaId'=any(idea_ids))
    or (d.path~'^promotions/[^/]+$' and d.data->>'ideaId'=any(idea_ids))
    or (d.path~'^milestones/[^/]+$' and d.data->>'projectId'=any(project_ids));
  get diagnostics deleted_count=row_count;
  return jsonb_build_object('ok',true,'deletedCommunity',p_cid,'deletedIdeas',idea_count,'deletedRecords',deleted_count);
end;
$fn$;
create or replace function public.admin_delete_community(p_cid text)
returns jsonb language sql security invoker set search_path=''
as $fn$ select private.admin_delete_community(p_cid); $fn$;
revoke all on function public.admin_delete_community(text) from public,anon;
grant execute on function public.admin_delete_community(text) to authenticated,service_role;
grant execute on function private.admin_delete_community(text) to authenticated,service_role;

create or replace function private.review_quorlyth_access_request(request_id uuid,next_status text)
returns void language plpgsql security definer
set search_path='' set row_security=off
as $fn$
declare req public.access_requests%rowtype; matched_uid uuid;
begin
  if not private.is_platform_owner() then raise exception 'Only the platform owner can review requests' using errcode='42501'; end if;
  if next_status not in ('approved','declined') then raise exception 'Invalid request status' using errcode='22023'; end if;
  update public.access_requests set status=next_status where id=request_id returning * into req;
  if not found then raise exception 'Access request not found' using errcode='P0002'; end if;
  select id into matched_uid from auth.users where lower(email)=lower(req.email) limit 1;
  insert into public.workspace_members(email,full_name,status,user_id,updated_at)
  values(lower(req.email),req.full_name,next_status,coalesce(req.user_id,matched_uid),now())
  on conflict(email) do update set full_name=excluded.full_name,status=excluded.status,
    user_id=coalesce(excluded.user_id,public.workspace_members.user_id),updated_at=excluded.updated_at;
  if coalesce(req.user_id,matched_uid) is not null then
    insert into public.workspace_records(collection_path,record_id,data)
    values('decisions',coalesce(req.user_id,matched_uid)::text,jsonb_build_object('status',next_status,'at',extract(epoch from now())*1000))
    on conflict(collection_path,record_id) do update set data=excluded.data,updated_at=now();
  end if;
end;
$fn$;
create or replace function public.review_quorlyth_access_request(request_id uuid,next_status text)
returns void language sql security invoker set search_path=''
as $fn$ select private.review_quorlyth_access_request(request_id,next_status); $fn$;
revoke all on function public.review_quorlyth_access_request(uuid,text) from public,anon;
grant execute on function public.review_quorlyth_access_request(uuid,text) to authenticated,service_role;
grant execute on function private.review_quorlyth_access_request(uuid,text) to authenticated,service_role;

-- Ensure legacy security-definer RPCs are not exposed as authorization shortcuts.
revoke all on function public.is_quorlyth_owner() from public,anon,authenticated;
revoke all on function public.is_quorlyth_member() from public,anon,authenticated;
revoke all on function public.can_manage_community(text) from public,anon,authenticated;
revoke all on function public.can_view_community(text) from public,anon,authenticated;
revoke all on function public.can_post_to_community(text) from public,anon,authenticated;
revoke all on function public.idea_community_id(text) from public,anon,authenticated;
revoke all on function public.is_idea_author(text) from public,anon,authenticated;
revoke all on function public.is_chat_call_participant(text) from public,anon,authenticated;
revoke all on function public.is_chat_member(text) from public,anon,authenticated;
revoke all on function public.is_chat_message_sender(text) from public,anon,authenticated;
revoke all on function public.can_read_quorlyth_record(text) from public,anon,authenticated;
revoke all on function public.can_write_quorlyth_record(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.owner_claim_exists() from public,anon,authenticated;

-- Close default EXECUTE-to-PUBLIC grants on every privileged helper, including triggers
-- and routines created later in this migration. Only RLS predicates and the two authenticated
-- maintenance RPC implementations are callable by API roles.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.can_read_doc(text,jsonb) to anon, authenticated;
grant execute on function private.can_insert_doc(text,jsonb) to authenticated;
grant execute on function private.can_update_doc(text,jsonb) to authenticated;
grant execute on function private.can_delete_doc(text,jsonb) to authenticated;
grant execute on function private.can_read_quorlyth_record(text,text) to authenticated;
grant execute on function private.can_write_quorlyth_record(text,text,jsonb) to authenticated;
grant execute on function private.is_platform_owner() to authenticated;
grant execute on function private.admin_delete_community(text) to authenticated, service_role;
grant execute on function private.review_quorlyth_access_request(uuid,text) to authenticated, service_role;
revoke all on function private.admin_delete_community(text) from public, anon;
revoke all on function private.review_quorlyth_access_request(uuid,text) from public, anon;

comment on policy docs_read_scoped on public.docs is
  'Reads only public content, visible community data, own private records, and creator-only rows for their owner.';
comment on policy docs_insert_scoped on public.docs is
  'Creates records only when caller identity, membership, authorship, or creator role permits the path.';
comment on policy docs_update_scoped on public.docs is
  'Updates only caller-owned records or creator-controlled records, validating the replacement row.';
comment on policy docs_delete_scoped on public.docs is
  'Deletes only caller-owned or community-creator-controlled records; private vaults remain self-scoped.';
comment on policy access_requests_submit_pending on public.access_requests is
  'Allows visitors to submit bounded pending requests only.';
comment on policy access_requests_read_scoped on public.access_requests is
  'Allows users to read their own requests and the platform owner to review all requests.';
comment on policy access_requests_owner_review on public.access_requests is
  'Allows only the platform owner to change access-request status.';
comment on policy workspace_members_read_scoped on public.workspace_members is
  'Exposes only the authenticated user’s own membership or owner-visible rows.';
comment on policy workspace_records_read_scoped on public.workspace_records is
  'Restricts legacy workspace records to approved members and platform administrators.';
comment on policy workspace_records_insert_scoped on public.workspace_records is
  'Allows approved workspace members to create only explicitly permitted personal/contribution records.';
comment on policy workspace_records_update_scoped on public.workspace_records is
  'Validates both existing and replacement legacy records against the authenticated caller’s scope.';
comment on policy workspace_records_delete_scoped on public.workspace_records is
  'Allows deletion only of legacy records that the authenticated caller may mutate.';

create unique index if not exists docs_one_active_volunteer_application
on public.docs ((data->>'ideaId'), (data->>'applicantId'))
where path ~ '^volunteers/[^/]+$' and coalesce(data->>'status','pending') <> 'declined';

create index if not exists access_requests_user_id_idx on public.access_requests(user_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

commit;
