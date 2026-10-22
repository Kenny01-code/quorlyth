-- Reject deadlines in the past for new workspaces/tasks and when deadlines change.
-- Existing overdue dates can remain while unrelated fields are edited.
create or replace function private.is_not_past_lagos_date(p_due_at text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  deadline_ms numeric;
  deadline_day date;
  today_lagos date;
begin
  if p_due_at is null or btrim(p_due_at) = '' then
    return true;
  end if;

  if p_due_at !~ '^[0-9]{10,16}$' then
    return false;
  end if;

  deadline_ms := p_due_at::numeric;
  -- Accept legacy Unix seconds as well as the millisecond timestamps used by the app.
  if deadline_ms < 100000000000 then
    deadline_ms := deadline_ms * 1000;
  end if;

  deadline_day := (to_timestamp((deadline_ms / 1000)::double precision) at time zone 'Africa/Lagos')::date;
  today_lagos := (now() at time zone 'Africa/Lagos')::date;
  return deadline_day >= today_lagos;
exception when others then
  return false;
end;
$function$;

create or replace function private.enforce_future_workspace_deadlines()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $function$
begin
  if TG_OP = 'INSERT' then
    if not private.is_not_past_lagos_date(NEW.data->>'dueAt') then
      raise exception 'Target delivery and task due dates must be today or a future date in Africa/Lagos.'
        using errcode = '22023';
    end if;
  elsif NEW.data->>'dueAt' is distinct from OLD.data->>'dueAt' then
    if not private.is_not_past_lagos_date(NEW.data->>'dueAt') then
      raise exception 'Target delivery and task due dates must be today or a future date in Africa/Lagos.'
        using errcode = '22023';
    end if;
  end if;
  return NEW;
end;
$function$;

drop trigger if exists docs_enforce_future_workspace_deadlines on public.docs;
create trigger docs_enforce_future_workspace_deadlines
before insert or update on public.docs
for each row
when (NEW.path ~ '^(standaloneProjects|standaloneTasks|projects|milestones)/[^/]+$')
execute function private.enforce_future_workspace_deadlines();

revoke all on function private.is_not_past_lagos_date(text) from public, anon;
revoke all on function private.enforce_future_workspace_deadlines() from public, anon, authenticated;
grant execute on function private.is_not_past_lagos_date(text) to authenticated;

notify pgrst, 'reload schema';
