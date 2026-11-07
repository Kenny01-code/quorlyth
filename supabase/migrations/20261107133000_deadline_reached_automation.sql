-- Deliver one durable deadline event when an active project or unfinished work item reaches dueAt.
-- Deadlines create a workflow event; they do not silently complete, delete, or close the work item.

alter table private.automation_event_queue
  drop constraint if exists automation_event_queue_trigger_type_check;

alter table private.automation_event_queue
  add constraint automation_event_queue_trigger_type_check
  check (trigger_type in (
    'idea.created',
    'task.started',
    'task.completed',
    'workspace.created',
    'milestone.started',
    'evidence.submitted',
    'evidence.reviewed',
    'deadline.reached'
  ));

create table if not exists private.automation_deadline_dispatches (
  event_key text primary key,
  source_path text not null,
  deadline_at_ms bigint not null,
  event_id uuid not null,
  dispatched_at timestamptz not null default now()
);

alter table private.automation_deadline_dispatches enable row level security;
revoke all on private.automation_deadline_dispatches from public, anon, authenticated, service_role;

create index if not exists automation_deadline_dispatches_source_idx
  on private.automation_deadline_dispatches (source_path, deadline_at_ms);

create index if not exists docs_due_automation_idx
  on public.docs (
    (case when data->>'dueAt' ~ '^[0-9]{10,16}$' then (data->>'dueAt')::bigint end),
    path
  )
  where path ~ '^(standaloneProjects|standaloneTasks|milestones|projects)/[^/]+$';

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
  elsif p_trigger_type = 'deadline.reached' then
    if p_source_path ~ '^standaloneProjects/[^/]+$' then
      if source_data->>'status' <> 'active' then return false; end if;
      project_id := split_part(p_source_path, '/', 2);
      return private.automation_user_is_standalone_project_member(p_user_id, project_id);
    elsif p_source_path ~ '^standaloneTasks/[^/]+$' then
      if source_data->>'status' not in ('todo','in_progress') then return false; end if;
      project_id := source_data->>'projectId';
      return private.automation_user_is_standalone_project_member(p_user_id, project_id);
    elsif p_source_path ~ '^milestones/[^/]+$' then
      if source_data->>'status' not in ('todo','in_progress') then return false; end if;
      project_id := source_data->>'projectId';
      select project.data into project_data
      from public.docs project where project.path = 'projects/' || project_id;
      idea_id := project_data->>'ideaId';
      return idea_id is not null and private.automation_user_can_access_work_idea(p_user_id, idea_id);
    elsif p_source_path ~ '^projects/[^/]+$' then
      if source_data->>'status' <> 'active' then return false; end if;
      idea_id := source_data->>'ideaId';
      return idea_id is not null and private.automation_user_can_access_work_idea(p_user_id, idea_id);
    end if;
  end if;

  return false;
end;
$fn$;

create or replace function public.enqueue_due_automation_events(p_limit integer default 5)
returns integer
language plpgsql volatile security definer
set search_path = '' set row_security = 'off'
as $fn$
declare
  candidate record;
  candidate_event_id uuid;
  candidate_key text;
  inserted_count integer := 0;
  safe_limit integer;
  now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not exists (
    select 1 from private.automation_worker_settings settings
    where settings.singleton = true and settings.enabled = true
  ) then
    return 0;
  end if;

  safe_limit := least(greatest(coalesce(p_limit, 5), 1), 25);

  for candidate in
    select
      d.path as source_path,
      d.data as source_data,
      (d.data->>'dueAt')::bigint as deadline_at_ms,
      split_part(d.path, '/', 1) as collection_name,
      split_part(d.path, '/', 2) as record_id,
      case
        when split_part(d.path, '/', 1) in ('standaloneProjects','projects') then 'project'
        when split_part(d.path, '/', 1) = 'standaloneTasks' then 'task'
        else 'milestone'
      end as entity_type,
      case
        when split_part(d.path, '/', 1) in ('standaloneProjects','projects')
          then coalesce(nullif(d.data->>'id',''), split_part(d.path, '/', 2))
        when split_part(d.path, '/', 1) = 'standaloneTasks'
          then coalesce(d.data->>'projectId','')
        when split_part(d.path, '/', 1) = 'milestones'
          then coalesce(d.data->>'projectId','')
        else ''
      end as project_id
    from public.docs d
    where d.path ~ '^(standaloneProjects|standaloneTasks|milestones|projects)/[^/]+$'
      and d.data->>'dueAt' ~ '^[0-9]{10,16}$'
      and (d.data->>'dueAt')::bigint <= now_ms
      and (
        (split_part(d.path, '/', 1) in ('standaloneProjects','projects') and d.data->>'status' = 'active')
        or
        (split_part(d.path, '/', 1) in ('standaloneTasks','milestones') and d.data->>'status' in ('todo','in_progress'))
      )
      and not exists (
        select 1
        from private.automation_deadline_dispatches sent
        where sent.source_path = d.path
          and sent.deadline_at_ms = (d.data->>'dueAt')::bigint
      )
    order by (d.data->>'dueAt')::bigint asc, d.path asc
    limit safe_limit
  loop
    candidate_key := candidate.source_path || ':' || candidate.deadline_at_ms::text;
    candidate_event_id := gen_random_uuid();

    insert into private.automation_deadline_dispatches (
      event_key, source_path, deadline_at_ms, event_id
    )
    values (
      candidate_key, candidate.source_path, candidate.deadline_at_ms, candidate_event_id
    )
    on conflict (event_key) do nothing;

    if found then
      insert into private.automation_event_queue (
        id, trigger_type, source_path, payload
      )
      values (
        candidate_event_id,
        'deadline.reached',
        candidate.source_path,
        jsonb_build_object(
          'id', candidate.record_id,
          'title', coalesce(
            nullif(candidate.source_data->>'title',''),
            nullif(candidate.source_data->>'summary',''),
            case candidate.entity_type
              when 'project' then 'Project deadline'
              when 'task' then 'Task deadline'
              else 'Milestone deadline'
            end
          ),
          'body', coalesce(candidate.source_data->>'description', candidate.source_data->>'summary', ''),
          'summary', candidate.entity_type || ' deadline reached',
          'entityType', candidate.entity_type,
          'projectId', nullif(candidate.project_id,''),
          'taskId', case when candidate.entity_type = 'task' then candidate.record_id else null end,
          'milestoneId', case when candidate.entity_type = 'milestone' then candidate.record_id else null end,
          'ownerId', coalesce(candidate.source_data->>'createdBy', candidate.source_data->>'ownerId', ''),
          'deadlineAt', candidate.deadline_at_ms,
          'at', now_ms
        )
      );
      inserted_count := inserted_count + 1;
    end if;
  end loop;

  return inserted_count;
end;
$fn$;

revoke all on function public.enqueue_due_automation_events(integer) from public, anon, authenticated;
grant execute on function public.enqueue_due_automation_events(integer) to service_role;
