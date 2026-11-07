-- Use the caller's authenticated role and the existing self-service RLS policy.
-- The policy derives both user_id and actor_id from auth.uid() and restricts active_day
-- events to the current UTC date, so SECURITY DEFINER and row_security=off are unnecessary.
create or replace function public.track_active_day()
returns void
language plpgsql
security invoker
set search_path = ''
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

-- Preserve the intended RPC surface: authenticated users only.
revoke all on function public.track_active_day() from public, anon, authenticated;
grant execute on function public.track_active_day() to authenticated;
