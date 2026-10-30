-- Quorlyth Growth & Activation event ledger.
-- Database triggers capture durable product milestones. Client inserts are limited to
-- self-attributed onboarding, active-day, and invite-share signals by RLS.

create table if not exists public.growth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_name text not null check (event_name in (
    'account_created',
    'active_day',
    'onboarding_started',
    'onboarding_completed',
    'profile_completed',
    'community_created',
    'member_joined',
    'idea_submitted',
    'project_created',
    'invite_link_shared'
  )),
  event_key text not null default '',
  occurred_at timestamptz not null default now(),
  constraint growth_events_event_key_length check (char_length(event_key) <= 256),
  constraint growth_events_idempotency unique (user_id, event_name, event_key)
);

alter table public.growth_events enable row level security;
revoke all on table public.growth_events from public, anon, authenticated;
grant select, insert on table public.growth_events to authenticated;

drop policy if exists growth_events_platform_admin_read on public.growth_events;
create policy growth_events_platform_admin_read
on public.growth_events
for select
to authenticated
using (private.is_platform_admin());

drop policy if exists growth_events_self_service_insert on public.growth_events;
create policy growth_events_self_service_insert
on public.growth_events
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and actor_id = (select auth.uid())
  and event_name in ('active_day', 'onboarding_started', 'onboarding_completed', 'invite_link_shared')
  and char_length(event_key) <= 256
  and (
    event_name <> 'active_day'
    or event_key = to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD')
  )
);

create index if not exists growth_events_occurred_at_idx
  on public.growth_events (occurred_at desc);
create index if not exists growth_events_event_name_occurred_at_idx
  on public.growth_events (event_name, occurred_at desc);
create index if not exists growth_events_user_occurred_at_idx
  on public.growth_events (user_id, occurred_at desc);

create or replace function private.capture_growth_auth_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
begin
  insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
  values (new.id, new.id, 'account_created', '', coalesce(new.created_at, now()))
  on conflict (user_id, event_name, event_key) do nothing;
  return new;
end;
$function$;

revoke all on function private.capture_growth_auth_signup() from public, anon, authenticated;

drop trigger if exists growth_events_capture_auth_signup on auth.users;
create trigger growth_events_capture_auth_signup
after insert on auth.users
for each row execute function private.capture_growth_auth_signup();

create or replace function private.capture_growth_doc_event()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  event_user_id uuid;
  member_user_id uuid;
  owner_text text;
  event_time timestamptz := now();
  item record;
  prior_joined boolean;
begin
  if new.path is null or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;

  if (new.data->>'at') ~ '^[0-9]+([.][0-9]+)?$' then
    event_time := to_timestamp((new.data->>'at')::numeric / 1000);
  end if;

  if tg_op = 'INSERT' and new.path ~ '^communities/[^/]+$' then
    owner_text := coalesce(nullif(new.data->>'ownerId', ''), nullif(new.data->>'createdBy', ''));
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      event_user_id := owner_text::uuid;
      insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
      values (event_user_id, event_user_id, 'community_created', split_part(new.path, '/', 2), event_time)
      on conflict (user_id, event_name, event_key) do nothing;
    end if;

  elsif tg_op = 'INSERT' and new.path ~ '^ideas/[^/]+$' then
    owner_text := nullif(new.data->>'authorId', '');
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      event_user_id := owner_text::uuid;
      insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
      values (event_user_id, event_user_id, 'idea_submitted', split_part(new.path, '/', 2), event_time)
      on conflict (user_id, event_name, event_key) do nothing;
    end if;

  elsif tg_op = 'INSERT' and new.path ~ '^projects/[^/]+$' then
    owner_text := nullif(new.data->>'createdBy', '');
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      event_user_id := owner_text::uuid;
      insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
      values (event_user_id, event_user_id, 'project_created', split_part(new.path, '/', 2), event_time)
      on conflict (user_id, event_name, event_key) do nothing;
    end if;

  elsif new.path ~ '^profiles/[^/]+$' then
    owner_text := split_part(new.path, '/', 2);
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and length(trim(coalesce(new.data->>'name', ''))) > 0
      and (
        length(trim(coalesce(new.data->>'head', ''))) > 0
        or length(trim(coalesce(new.data->>'bio', ''))) > 0
      )
    then
      event_user_id := owner_text::uuid;
      insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
      values (event_user_id, event_user_id, 'profile_completed', '', event_time)
      on conflict (user_id, event_name, event_key) do nothing;
    end if;

  elsif new.path ~ '^members/[^/]+$' then
    owner_text := split_part(new.path, '/', 2);
    if owner_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return new;
    end if;
    member_user_id := owner_text::uuid;

    for item in
      select key, value
      from jsonb_each(coalesce(new.data->'c', '{}'::jsonb))
    loop
      prior_joined := false;
      if tg_op = 'UPDATE' then
        prior_joined := coalesce(old.data->'c'->>item.key, 'false') = 'true';
      end if;

      if item.value = 'true'::jsonb and not prior_joined then
        select coalesce(nullif(c.data->>'ownerId', ''), nullif(c.data->>'createdBy', ''))
          into owner_text
        from public.docs c
        where c.path = 'communities/' || item.key;

        if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          event_user_id := owner_text::uuid;
          if event_user_id <> member_user_id then
            insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
            values (event_user_id, member_user_id, 'member_joined', item.key || ':' || member_user_id::text, now())
            on conflict (user_id, event_name, event_key) do nothing;
          end if;
        end if;
      end if;
    end loop;
  end if;

  return new;
end;
$function$;

revoke all on function private.capture_growth_doc_event() from public, anon, authenticated;

drop trigger if exists growth_events_capture_doc_event on public.docs;
create trigger growth_events_capture_doc_event
after insert or update of data on public.docs
for each row execute function private.capture_growth_doc_event();

-- Backfill only durable milestones that already exist. Profile text, community names,
-- idea contents, and personal email addresses are not copied into the event ledger.
insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
select
  (coalesce(nullif(d.data->>'ownerId', ''), nullif(d.data->>'createdBy', '')))::uuid,
  (coalesce(nullif(d.data->>'ownerId', ''), nullif(d.data->>'createdBy', '')))::uuid,
  'community_created',
  split_part(d.path, '/', 2),
  case when (d.data->>'at') ~ '^[0-9]+([.][0-9]+)?$'
    then to_timestamp((d.data->>'at')::numeric / 1000)
    else d.updated_at end
from public.docs d
where d.path ~ '^communities/[^/]+$'
  and coalesce(nullif(d.data->>'ownerId', ''), nullif(d.data->>'createdBy', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (user_id, event_name, event_key) do nothing;

insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
select
  (d.data->>'authorId')::uuid,
  (d.data->>'authorId')::uuid,
  'idea_submitted',
  split_part(d.path, '/', 2),
  case when (d.data->>'at') ~ '^[0-9]+([.][0-9]+)?$'
    then to_timestamp((d.data->>'at')::numeric / 1000)
    else d.updated_at end
from public.docs d
where d.path ~ '^ideas/[^/]+$'
  and coalesce(d.data->>'authorId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (user_id, event_name, event_key) do nothing;

insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
select
  (d.data->>'createdBy')::uuid,
  (d.data->>'createdBy')::uuid,
  'project_created',
  split_part(d.path, '/', 2),
  case when (d.data->>'at') ~ '^[0-9]+([.][0-9]+)?$'
    then to_timestamp((d.data->>'at')::numeric / 1000)
    else d.updated_at end
from public.docs d
where d.path ~ '^projects/[^/]+$'
  and coalesce(d.data->>'createdBy', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (user_id, event_name, event_key) do nothing;

insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
select
  split_part(d.path, '/', 2)::uuid,
  split_part(d.path, '/', 2)::uuid,
  'profile_completed',
  '',
  case when (d.data->>'at') ~ '^[0-9]+([.][0-9]+)?$'
    then to_timestamp((d.data->>'at')::numeric / 1000)
    else d.updated_at end
from public.docs d
where d.path ~ '^profiles/[^/]+$'
  and split_part(d.path, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and length(trim(coalesce(d.data->>'name', ''))) > 0
  and (length(trim(coalesce(d.data->>'head', ''))) > 0 or length(trim(coalesce(d.data->>'bio', ''))) > 0)
on conflict (user_id, event_name, event_key) do nothing;

insert into public.growth_events (user_id, actor_id, event_name, event_key, occurred_at)
select u.id, u.id, 'account_created', '', u.created_at
from auth.users u
on conflict (user_id, event_name, event_key) do nothing;

notify pgrst, 'reload schema';
