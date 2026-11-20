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
      'actorId', coalesce(new.data->>'authorId',''),
      'entityType', 'idea'
    );
  elsif new.path ~ '^standaloneProjects/[^/]+$' and tg_op = 'INSERT' then
    trigger_name := 'workspace.created';
    event_payload := event_payload || jsonb_build_object(
      'projectId', split_part(new.path, '/', 2),
      'title', coalesce(new.data->>'title',''),
      'summary', coalesce(new.data->>'summary',''),
      'actorId', coalesce(new.data->>'createdBy',''),
      'workspaceId', split_part(new.path, '/', 2),
      'entityType', 'workspace'
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
      'actorId', coalesce(new.data->>'updatedBy',new.data->>'createdBy',''),
      'entityType', 'workspace'
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
        'actorId', coalesce(new.data->>'updatedBy',new.data->>'createdBy',new.data->>'assigneeId',''),
        'entityType', 'task'
      );
    end if;
  elsif new.path ~ '^milestones/[^/]+$' and tg_op = 'UPDATE'
    and old.data->>'status' = 'todo' and new.data->>'status' = 'in_progress' then
    trigger_name := 'milestone.started';
    event_payload := event_payload || jsonb_build_object(
      'projectId', coalesce(new.data->>'projectId',''),
      'title', coalesce(new.data->>'title',''),
      'summary', coalesce(new.data->>'acceptanceCriteria',new.data->>'description',''),
      'actorId', coalesce(new.data->>'updatedBy',new.data->>'assigneeId',''),
      'entityType', 'milestone'
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
        'workspaceId', coalesce(new.data->>'projectId',''),
        'taskId', coalesce(new.data->>'taskId',''),
        'title', coalesce(new.data->>'summary','Evidence submitted'),
        'summary', coalesce(new.data->>'summary',''),
        'status', coalesce(new.data->>'status','submitted'),
        'actorId', coalesce(new.data->>'reviewedBy',new.data->>'submittedBy',''),
        'entityType', 'evidence'
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
        'actorId', coalesce(new.data->>'reviewedBy',new.data->>'submittedBy',''),
        'entityType', 'evidence'
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
