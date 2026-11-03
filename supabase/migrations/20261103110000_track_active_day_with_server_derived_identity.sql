-- Record daily active-day telemetry with the authenticated identity and UTC day
-- derived inside Postgres. The client cannot supply either value.
create or replace function public.track_active_day()
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.growth_events (user_id, actor_id, event_name, event_key)
  values (
    current_user_id,
    current_user_id,
    'active_day',
    to_char(now() at time zone 'UTC', 'YYYY-MM-DD')
  )
  on conflict (user_id, event_name, event_key) do nothing;
end;
$function$;

revoke all on function public.track_active_day() from public, anon, authenticated;
grant execute on function public.track_active_day() to authenticated;
