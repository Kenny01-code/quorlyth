-- Durable, server-side Quorlyth automation execution.
-- The worker remains disabled until the matching app build is live, preventing duplicate execution.

create extension if not exists pg_net;

create table if not exists private.automation_worker_settings (
  singleton boolean primary key default true check (singleton = true),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table private.automation_worker_settings enable row level security;
revoke all on private.automation_worker_settings from public, anon, authenticated, service_role;
insert into private.automation_worker_settings (singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

create table if not exists private.automation_event_queue (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in (
    'idea.created','task.started','task.completed','workspace.created',
    'milestone.started','evidence.submitted','evidence.reviewed'
  )),
  source_path text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','dead')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table private.automation_event_queue enable row level security;
revoke all on private.automation_event_queue from public, anon, authenticated, service_role;
create index if not exists automation_event_queue_ready_idx
  on private.automation_event_queue (available_at, created_at)
  where status in ('queued','processing');

create or replace function private.automation_user_can_view_community(p_user_id uuid, p_community_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_community_id is not null and exists (
    select 1 from public.docs community
    where community.path = 'communities/' || p_community_id
      and (
        community.data->>'ownerId' = p_user_id::text
        or community.data->>'createdBy' = p_user_id::text
        or exists (
          select 1 from private.platform_roles role_row
          where role_row.user_id = p_user_id and role_row.role in ('owner','admin')
        )
        or exists (
          select 1 from public.docs member
          where member.path = 'members/' || p_user_id::text
            and coalesce(member.data->'c'->>p_community_id, 'false') = 'true'
        )
        or (
          coalesce(community.data->>'vis','listed') <> 'unlisted'
          and coalesce(community.data->>'arch','false') <> 'true'
        )
      )
  );
$fn$;

create or replace function private.automation_user_is_accepted_collaborator(p_user_id uuid, p_idea_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_idea_id is not null and exists (
    select 1 from public.docs volunteer
    where volunteer.path ~ '^volunteers/[^/]+$'
      and volunteer.data->>'ideaId' = p_idea_id
      and volunteer.data->>'applicantId' = p_user_id::text
      and volunteer.data->>'status' = 'accepted'
  );
$fn$;

create or replace function private.automation_user_is_idea_author(p_user_id uuid, p_idea_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_idea_id is not null and exists (
    select 1 from public.docs idea
    where idea.path = 'ideas/' || p_idea_id
      and idea.data->>'authorId' = p_user_id::text
  );
$fn$;

create or replace function private.automation_user_can_manage_community(p_user_id uuid, p_community_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_community_id is not null and (
    exists (
      select 1 from private.platform_roles role_row
      where role_row.user_id = p_user_id and role_row.role in ('owner','admin')
    )
    or exists (
      select 1 from public.docs community
      where community.path = 'communities/' || p_community_id
        and (
          community.data->>'ownerId' = p_user_id::text
          or community.data->>'createdBy' = p_user_id::text
        )
    )
  );
$fn$;

create or replace function private.automation_user_can_access_work_idea(p_user_id uuid, p_idea_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_idea_id is not null and (
    exists (
      select 1 from private.platform_roles role_row
      where role_row.user_id = p_user_id and role_row.role in ('owner','admin')
    )
    or private.automation_user_is_idea_author(p_user_id, p_idea_id)
    or private.automation_user_is_accepted_collaborator(p_user_id, p_idea_id)
    or exists (
      select 1 from public.docs idea
      where idea.path = 'ideas/' || p_idea_id
        and private.automation_user_can_manage_community(p_user_id, idea.data->>'cid')
    )
    or exists (
      select 1 from public.docs project
      where project.path = 'standaloneProjects/' || p_idea_id
        and (
          project.data->>'createdBy' = p_user_id::text
          or exists (
            select 1 from public.docs member
            where member.path = 'standaloneProjectMembers/' || p_idea_id || '__' || p_user_id::text
              and member.data->>'status' = 'active'
              and member.data->>'role' in ('owner','manager','contributor','viewer')
          )
        )
    )
  );
$fn$;

create or replace function private.automation_user_is_standalone_project_member(
  p_user_id uuid,
  p_project_id text,
  p_roles text[] default array['owner','manager','contributor','viewer']::text[]
)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_project_id is not null and exists (
    select 1 from public.docs project
    where project.path = 'standaloneProjects/' || p_project_id
      and project.data->>'id' = p_project_id
      and (
        project.data->>'createdBy' = p_user_id::text
        or exists (
          select 1 from public.docs member
          where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || p_user_id::text
            and member.data->>'projectId' = p_project_id
            and member.data->>'userId' = p_user_id::text
            and member.data->>'status' = 'active'
            and member.data->>'role' = any(p_roles)
        )
        or (
          not exists (
            select 1 from public.docs member
            where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || p_user_id::text
          )
          and nullif(project.data->>'linkedIdeaId','') is not null
          and p_roles && array['contributor','viewer']::text[]
          and private.automation_user_can_access_work_idea(p_user_id, project.data->>'linkedIdeaId')
        )
      )
  );
$fn$;

create or replace function public.automation_user_can_receive_event(
  p_user_id uuid,
  p_trigger_type text,
  p_source_path text,
  p_payload jsonb
)
returns boolean
language plpgsql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
declare
  source_data jsonb;
  project_id text;
  idea_id text;
  community_id text;
  project_data jsonb;
begin
  if p_user_id is null or p_source_path is null then return false; end if;
  select d.data into source_data from public.docs d where d.path = p_source_path;
  if source_data is null then return false; end if;

  if p_trigger_type = 'idea.created' then
    community_id := coalesce(p_payload->>'communityId', source_data->>'cid');
    idea_id := split_part(p_source_path, '/', 2);
    return source_data->>'authorId' = p_user_id::text
      or private.automation_user_can_view_community(p_user_id, community_id)
      or private.automation_user_is_accepted_collaborator(p_user_id, idea_id);
  elsif p_trigger_type = 'workspace.created' then
    project_id := coalesce(p_payload->>'projectId', split_part(p_source_path, '/', 2));
    return private.automation_user_is_standalone_project_member(p_user_id, project_id);
  elsif p_trigger_type in ('task.started','task.completed') then
    project_id := source_data->>'projectId';
    return private.automation_user_is_standalone_project_member(p_user_id, project_id);
  elsif p_trigger_type in ('evidence.submitted','evidence.reviewed')
    and p_source_path ~ '^standaloneArtifacts/[^/]+$' then
    return private.automation_user_is_standalone_project_member(p_user_id, source_data->>'projectId');
  elsif p_trigger_type = 'milestone.started' then
    project_id := source_data->>'projectId';
    select project.data into project_data
    from public.docs project where project.path = 'projects/' || project_id;
    idea_id := project_data->>'ideaId';
    return idea_id is not null and private.automation_user_can_access_work_idea(p_user_id, idea_id);
  elsif p_trigger_type in ('evidence.submitted','evidence.reviewed')
    and p_source_path ~ '^workSubmissions/[^/]+$' then
    idea_id := coalesce(source_data->>'ideaId', source_data->>'projectId');
    return idea_id is not null
      and private.automation_user_can_access_work_idea(p_user_id, idea_id)
      and exists (
        select 1 from public.docs project
        where project.path = 'projects/' || idea_id
          and project.data->>'ideaId' = idea_id
      )
      and exists (
        select 1 from public.docs milestone
        where milestone.path = 'milestones/' || (source_data->>'milestoneId')
          and milestone.data->>'projectId' = idea_id
      );
  end if;

  return false;
end;
$fn$;

create or replace function public.automation_user_can_create_task(p_user_id uuid, p_project_id text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select p_user_id is not null and p_project_id is not null and exists (
    select 1 from public.docs project
    where project.path = 'standaloneProjects/' || p_project_id
      and project.data->>'status' = 'active'
      and (
        project.data->>'createdBy' = p_user_id::text
        or exists (
          select 1 from public.docs member
          where member.path = 'standaloneProjectMembers/' || p_project_id || '__' || p_user_id::text
            and member.data->>'projectId' = p_project_id
            and member.data->>'userId' = p_user_id::text
            and member.data->>'status' = 'active'
            and member.data->>'role' in ('owner','manager')
        )
      )
  );
$fn$;

create or replace function public.verify_automation_worker_token(p_token text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = 'off'
as $fn$
  select coalesce(
    p_token is not null
    and exists (
      select 1 from vault.decrypted_secrets secret
      where secret.name = 'automation_worker_token'
        and extensions.digest(p_token, 'sha256') = extensions.digest(secret.decrypted_secret, 'sha256')
    ),
    false
  );
$fn$;

create or replace function public.claim_automation_events(p_limit integer default 5)
returns table (
  event_id uuid,
  trigger_type text,
  source_path text,
  payload jsonb,
  attempts integer,
  created_at timestamptz
)
language plpgsql volatile security definer
set search_path = '' set row_security = 'off'
as $fn$
begin
  if not exists (
    select 1 from private.automation_worker_settings settings
    where settings.singleton = true and settings.enabled = true
  ) then
    return;
  end if;

  return query
  with candidates as (
    select queue.id
    from private.automation_event_queue queue
    where (
      queue.status = 'queued' and queue.available_at <= now()
    ) or (
      queue.status = 'processing' and queue.locked_until < now()
    )
    order by queue.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 10))
  ),
  claimed as (
    update private.automation_event_queue queue
    set status = 'processing',
        attempts = queue.attempts + 1,
        locked_until = now() + interval '180 seconds',
        last_error = null
    from candidates
    where queue.id = candidates.id
    returning queue.*
  )
  select claimed.id, claimed.trigger_type, claimed.source_path,
         claimed.payload, claimed.attempts, claimed.created_at
  from claimed;
end;
$fn$;

create or replace function public.complete_automation_event(
  p_event_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql volatile security definer
set search_path = '' set row_security = 'off'
as $fn$
begin
  update private.automation_event_queue queue
  set status = case
        when p_success then 'completed'
        when queue.attempts >= 8 then 'dead'
        else 'queued'
      end,
      available_at = case
        when p_success or queue.attempts >= 8 then queue.available_at
        else now() + make_interval(secs => least(900, (15 * power(2, least(queue.attempts, 6)))::integer))
      end,
      locked_until = null,
      last_error = case when p_success then null else left(coalesce(p_error, 'Worker failed.'), 500) end,
      completed_at = case when p_success then now() else null end
  where queue.id = p_event_id and queue.status = 'processing';
end;
$fn$;

create or replace function public.append_automation_workflow_run(
  p_user_id uuid,
  p_workflow_id text,
  p_run jsonb
)
returns boolean
language plpgsql volatile security definer
set search_path = '' set row_security = 'off'
as $fn$
declare
  history jsonb;
  finished_at bigint;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if p_user_id is null or p_workflow_id is null or p_run is null
     or jsonb_typeof(p_run) <> 'object' or nullif(p_run->>'id','') is null then
    return false;
  end if;
  finished_at := coalesce(nullif(p_run->>'finishedAt','')::bigint, now_ms);

  update public.docs target
  set data = target.data || jsonb_build_object(
        'runHistory',
        (
          select coalesce(jsonb_agg(item order by sort_key), '[]'::jsonb)
          from (
            select p_run as item, 0::bigint as sort_key
            union all
            select previous.value as item, previous.ordinality as sort_key
            from jsonb_array_elements(
              case when jsonb_typeof(target.data->'runHistory') = 'array'
                then target.data->'runHistory' else '[]'::jsonb end
            ) with ordinality as previous(value, ordinality)
            where previous.value->>'id' is distinct from p_run->>'id'
            order by sort_key
            limit 20
          ) merged
        ),
        'lastRunAt', finished_at,
        'updatedAt', now_ms
      ),
      updated_at = now()
  where target.path = 'data/users/' || p_user_id::text || '/automations/' || p_workflow_id;

  return found;
end;
$fn$;

create or replace function private.enqueue_automation_event()
returns trigger
language plpgsql security definer
set search_path = '' set row_security = 'off'
as $fn$
declare
  trigger_name text;
  event_payload jsonb;
  event_at bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  enabled_now boolean := false;
begin
  select settings.enabled into enabled_now
  from private.automation_worker_settings settings
  where settings.singleton = true;
  if not coalesce(enabled_now, false) then return new; end if;

  trigger_name := null;
  event_payload := jsonb_build_object(
    'id', split_part(new.path, '/', 2),
    'at', event_at
  );

  if new.path ~ '^ideas/[^/]+$' and tg_op = 'INSERT' then
    trigger_name := 'idea.created';
    event_payload := event_payload || jsonb_build_object(
      'title', coalesce(new.data->>'title',''),
      'body', coalesce(new.data->>'body',''),
      'communityId', coalesce(new.data->>'cid',''),
      'actorId', coalesce(new.data->>'authorId','')
    );
  elsif new.path ~ '^standaloneProjects/[^/]+$' and tg_op = 'INSERT' then
    trigger_name := 'workspace.created';
    event_payload := event_payload || jsonb_build_object(
      'projectId', split_part(new.path, '/', 2),
      'title', coalesce(new.data->>'title',''),
      'summary', coalesce(new.data->>'summary',''),
      'actorId', coalesce(new.data->>'createdBy','')
    );
  elsif new.path ~ '^standaloneTasks/[^/]+$' and tg_op = 'UPDATE' then
    if old.data->>'status' = 'todo' and new.data->>'status' = 'in_progress' then
      trigger_name := 'task.started';
    elsif coalesce(old.data->>'status','') <> 'done' and new.data->>'status' = 'done' then
      trigger_name := 'task.completed';
    end if;
    if trigger_name is not null then
      event_payload := event_payload || jsonb_build_object(
        'taskId', split_part(new.path, '/', 2),
        'projectId', coalesce(new.data->>'projectId',''),
        'title', coalesce(new.data->>'title',''),
        'summary', coalesce(new.data->>'description',''),
        'actorId', coalesce(new.data->>'updatedBy',new.data->>'assigneeId','')
      );
    end if;
  elsif new.path ~ '^milestones/[^/]+$' and tg_op = 'UPDATE'
    and old.data->>'status' = 'todo' and new.data->>'status' = 'in_progress' then
    trigger_name := 'milestone.started';
    event_payload := event_payload || jsonb_build_object(
      'projectId', coalesce(new.data->>'projectId',''),
      'title', coalesce(new.data->>'title',''),
      'summary', coalesce(new.data->>'acceptanceCriteria',new.data->>'description',''),
      'actorId', coalesce(new.data->>'updatedBy',new.data->>'assigneeId','')
    );
  elsif new.path ~ '^standaloneArtifacts/[^/]+$' then
    if tg_op = 'INSERT' and coalesce(new.data->>'status','submitted') = 'submitted' then
      trigger_name := 'evidence.submitted';
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'submitted'
      and new.data->>'status' in ('approved','changes_requested') then
      trigger_name := 'evidence.reviewed';
    end if;
    if trigger_name is not null then
      event_payload := event_payload || jsonb_build_object(
        'projectId', coalesce(new.data->>'projectId',''),
        'taskId', coalesce(new.data->>'taskId',''),
        'title', coalesce(new.data->>'summary','Evidence submitted'),
        'summary', coalesce(new.data->>'summary',''),
        'status', coalesce(new.data->>'status','submitted'),
        'actorId', coalesce(new.data->>'reviewedBy',new.data->>'submittedBy','')
      );
    end if;
  elsif new.path ~ '^workSubmissions/[^/]+$' then
    if tg_op = 'INSERT' and coalesce(new.data->>'status','submitted') = 'submitted' then
      trigger_name := 'evidence.submitted';
    elsif tg_op = 'UPDATE' and old.data->>'status' = 'submitted'
      and new.data->>'status' in ('approved','changes_requested') then
      trigger_name := 'evidence.reviewed';
    end if;
    if trigger_name is not null then
      event_payload := event_payload || jsonb_build_object(
        'projectId', coalesce(new.data->>'projectId',''),
        'milestoneId', coalesce(new.data->>'milestoneId',''),
        'title', coalesce(new.data->>'summary','Milestone evidence submitted'),
        'summary', coalesce(new.data->>'summary',''),
        'status', coalesce(new.data->>'status','submitted'),
        'actorId', coalesce(new.data->>'reviewedBy',new.data->>'submittedBy','')
      );
    end if;
  end if;

  if trigger_name is null then return new; end if;

  insert into private.automation_event_queue (trigger_type, source_path, payload)
  values (trigger_name, new.path, event_payload);

  -- Immediate wake-up; the scheduled poll below is the durable recovery path.
  begin
    perform net.http_post(
      url := 'https://tujvptxjmkihwrqbqmyk.supabase.co/functions/v1/automation-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select secret.decrypted_secret from vault.decrypted_secrets secret where secret.name = 'automation_worker_publishable_key'),
        'Authorization', 'Bearer ' || (select secret.decrypted_secret from vault.decrypted_secrets secret where secret.name = 'automation_worker_token')
      ),
      body := jsonb_build_object('source', 'docs-trigger'),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- The 30-second Cron worker will recover queued events.
    null;
  end;

  return new;
end;
$fn$;

drop trigger if exists docs_automation_event_enqueue on public.docs;
create trigger docs_automation_event_enqueue
after insert or update of data on public.docs
for each row
when (new.path ~ '^(ideas|standaloneProjects|standaloneTasks|milestones|standaloneArtifacts|workSubmissions)/[^/]+$')
execute function private.enqueue_automation_event();

revoke all on function private.automation_user_can_view_community(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.automation_user_is_accepted_collaborator(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.automation_user_is_idea_author(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.automation_user_can_manage_community(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.automation_user_can_access_work_idea(uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.automation_user_is_standalone_project_member(uuid,text,text[]) from public, anon, authenticated, service_role;
revoke all on function private.enqueue_automation_event() from public, anon, authenticated, service_role;

revoke all on function public.automation_user_can_receive_event(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.automation_user_can_create_task(uuid,text) from public, anon, authenticated;
revoke all on function public.verify_automation_worker_token(text) from public, anon, authenticated;
revoke all on function public.claim_automation_events(integer) from public, anon, authenticated;
revoke all on function public.complete_automation_event(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.append_automation_workflow_run(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.automation_user_can_receive_event(uuid,text,text,jsonb) to service_role;
grant execute on function public.automation_user_can_create_task(uuid,text) to service_role;
grant execute on function public.verify_automation_worker_token(text) to service_role;
grant execute on function public.claim_automation_events(integer) to service_role;
grant execute on function public.complete_automation_event(uuid,boolean,text) to service_role;
grant execute on function public.append_automation_workflow_run(uuid,text,jsonb) to service_role;

do $vault$
begin
  if not exists (select 1 from vault.secrets where name = 'automation_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(48), 'hex'), 'automation_worker_token', 'Internal Quorlyth automation worker authentication token');
  end if;
  if not exists (select 1 from vault.secrets where name = 'automation_worker_publishable_key') then
    perform vault.create_secret('sb_publishable_X4y2G2J5bw2JKu9_YV6J1g_4bLL9LPA', 'automation_worker_publishable_key', 'Public Supabase API key used by the internal scheduled worker request');
  end if;
end
$vault$;

select cron.schedule(
  'quorlyth-automation-worker',
  '30 seconds',
  $job$
    select net.http_post(
      url := 'https://tujvptxjmkihwrqbqmyk.supabase.co/functions/v1/automation-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select secret.decrypted_secret from vault.decrypted_secrets secret where secret.name = 'automation_worker_publishable_key'),
        'Authorization', 'Bearer ' || (select secret.decrypted_secret from vault.decrypted_secrets secret where secret.name = 'automation_worker_token')
      ),
      body := jsonb_build_object('source', 'cron'),
      timeout_milliseconds := 10000
    );
  $job$
);
