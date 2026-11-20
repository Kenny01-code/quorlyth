-- Workspace and task metadata changes are first-class automation events.
-- The trigger derives record identity from docs.path and access from active project membership.
ALTER TABLE private.automation_event_queue
  DROP CONSTRAINT IF EXISTS automation_event_queue_trigger_type_check;

ALTER TABLE private.automation_event_queue
  ADD CONSTRAINT automation_event_queue_trigger_type_check
  CHECK (trigger_type IN (
    'idea.created',
    'task.started',
    'task.updated',
    'task.completed',
    'workspace.created',
    'workspace.updated',
    'milestone.started',
    'evidence.submitted',
    'evidence.reviewed',
    'deadline.reached'
  ));

CREATE OR REPLACE FUNCTION private.enqueue_automation_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
  elsif new.path ~ '^standaloneProjects/[^/]+$' and tg_op = 'UPDATE'
    and (
      old.data->>'title' is distinct from new.data->>'title'
      or old.data->>'summary' is distinct from new.data->>'summary'
      or old.data->>'dueAt' is distinct from new.data->>'dueAt'
      or old.data->>'status' is distinct from new.data->>'status'
    ) then
    trigger_name := 'workspace.updated';
    event_payload := event_payload || jsonb_build_object(
      'projectId', split_part(new.path, '/', 2),
      'workspaceId', split_part(new.path, '/', 2),
      'title', coalesce(new.data->>'title',''),
      'summary', coalesce(new.data->>'summary',''),
      'status', coalesce(new.data->>'status','active'),
      'dueAt', new.data->'dueAt',
      'actorId', coalesce(new.data->>'updatedBy',new.data->>'createdBy','')
    );
  elsif new.path ~ '^standaloneTasks/[^/]+$' and tg_op = 'UPDATE' then
    if old.data->>'status' = 'todo' and new.data->>'status' = 'in_progress' then
      trigger_name := 'task.started';
    elsif coalesce(old.data->>'status','') <> 'done' and new.data->>'status' = 'done' then
      trigger_name := 'task.completed';
    elsif (
      old.data->>'title' is distinct from new.data->>'title'
      or old.data->>'description' is distinct from new.data->>'description'
      or old.data->>'acceptanceCriteria' is distinct from new.data->>'acceptanceCriteria'
      or old.data->>'dueAt' is distinct from new.data->>'dueAt'
      or old.data->>'assigneeId' is distinct from new.data->>'assigneeId'
      or old.data->'assigneeIds' is distinct from new.data->'assigneeIds'
      or old.data->>'status' is distinct from new.data->>'status'
    ) then
      trigger_name := 'task.updated';
    end if;
    if trigger_name is not null then
      event_payload := event_payload || jsonb_build_object(
        'taskId', split_part(new.path, '/', 2),
        'projectId', coalesce(new.data->>'projectId',''),
        'workspaceId', coalesce(new.data->>'projectId',''),
        'title', coalesce(new.data->>'title',''),
        'summary', coalesce(new.data->>'description',''),
        'status', coalesce(new.data->>'status','todo'),
        'dueAt', new.data->'dueAt',
        'assigneeId', coalesce(new.data->>'assigneeId',''),
        'assigneeIds', coalesce(new.data->'assigneeIds','[]'::jsonb),
        'actorId', coalesce(new.data->>'updatedBy',new.data->>'createdBy',new.data->>'assigneeId','')
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
$function$;

CREATE OR REPLACE FUNCTION public.automation_user_can_receive_event(p_user_id uuid, p_trigger_type text, p_source_path text, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
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
  elsif p_trigger_type in ('workspace.created','workspace.updated') then
    if p_source_path !~ '^standaloneProjects/[^/]+$' then return false; end if;
    project_id := split_part(p_source_path, '/', 2);
    return private.automation_user_is_standalone_project_member(p_user_id, project_id);
  elsif p_trigger_type in ('task.started','task.completed','task.updated') then
    if p_source_path !~ '^standaloneTasks/[^/]+$' then return false; end if;
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
$function$;
