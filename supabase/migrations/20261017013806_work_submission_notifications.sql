-- Durable submission/review notifications, stored in each recipient's existing
-- private user vault so the current notification panel receives them through Realtime.
create or replace function private.notify_quorlyth_work_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_idea_id text;
  v_idea jsonb;
  v_cid text;
  v_community jsonb;
  v_title text;
  v_milestone_title text;
  v_actor text;
  v_recipient text;
  v_status text;
  v_at bigint;
  v_revision text;
begin
  if new.path !~ '^workSubmissions/[^/]+$' then
    return new;
  end if;

  v_idea_id := new.data->>'ideaId';
  v_revision := coalesce(new.data->>'revision', '1');
  select i.data into v_idea from public.docs i where i.path = 'ideas/' || v_idea_id;
  if v_idea is null then return new; end if;

  v_title := coalesce(nullif(v_idea->>'title', ''), 'your project');
  v_cid := v_idea->>'cid';
  select c.data into v_community from public.docs c where c.path = 'communities/' || v_cid;
  select coalesce(m.data->>'title', 'the milestone')
    into v_milestone_title from public.docs m
    where m.path = 'milestones/' || (new.data->>'milestoneId');
  v_milestone_title := coalesce(v_milestone_title, 'the milestone');

  if tg_op = 'INSERT' and new.data->>'status' = 'submitted' then
    v_actor := new.data->>'submittedBy';
    v_at := case when coalesce(new.data->>'submittedAt', '') ~ '^[0-9]{10,16}$'
      then (new.data->>'submittedAt')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;

    -- Notify the owning community and platform roles; never notify the contributor
    -- about their own submission. The helper persists a deduplicated notification.
    for v_recipient in
      select distinct recipient_id from (
        select v_community->>'ownerId' as recipient_id
        union all select v_community->>'createdBy'
        union all select r.user_id::text from private.platform_roles r where r.role in ('owner', 'admin')
      ) recipients
      where recipient_id is not null
        and recipient_id <> coalesce(v_actor, '')
    loop
      perform private.emit_quorlyth_notification(
        v_recipient,
        'work-submitted:' || new.path || ':' || v_revision || ':' || v_at::text,
        'milestone', 'collab',
        coalesce((select p.data->>'name' from public.docs p where p.path = 'profiles/' || v_actor), 'A collaborator')
          || ' submitted revision ' || v_revision || ' for “' || v_milestone_title || '” in “' || v_title || '”',
        new.data->>'milestoneId', v_idea_id, v_at
      );
    end loop;

  elsif tg_op = 'UPDATE'
    and old.data->>'status' = 'submitted'
    and new.data->>'status' in ('approved', 'changes_requested') then
    v_actor := new.data->>'reviewedBy';
    v_status := new.data->>'status';
    v_at := case when coalesce(new.data->>'reviewedAt', '') ~ '^[0-9]{10,16}$'
      then (new.data->>'reviewedAt')::bigint
      else (extract(epoch from clock_timestamp()) * 1000)::bigint end;

    if coalesce(new.data->>'submittedBy', '') <> coalesce(v_actor, '') then
      perform private.emit_quorlyth_notification(
        new.data->>'submittedBy',
        'work-review:' || new.path || ':' || v_status || ':' || v_at::text,
        'milestone',
        case when v_status = 'approved' then 'approve' else 'alert' end,
        case when v_status = 'approved'
          then 'Your revision ' || v_revision || ' for “' || v_milestone_title || '” was approved'
          else 'Changes were requested on revision ' || v_revision || ' for “' || v_milestone_title || '”' end,
        new.data->>'milestoneId', v_idea_id, v_at
      );
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.notify_quorlyth_work_submission() from public, anon, authenticated, service_role;

drop trigger if exists docs_notify_quorlyth_work_submission on public.docs;
create trigger docs_notify_quorlyth_work_submission
after insert or update on public.docs
for each row
when (new.path ~ '^workSubmissions/[^/]+$')
execute function private.notify_quorlyth_work_submission();

notify pgrst, 'reload schema';
