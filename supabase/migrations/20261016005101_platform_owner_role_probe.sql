-- Expose only the signed-in caller's platform-owner boolean to the client.
-- The private role table remains authoritative; no role rows or user IDs are disclosed.
create or replace function public.current_user_is_platform_owner()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select (select auth.uid()) is not null and private.is_platform_owner();
$function$;

revoke all on function public.current_user_is_platform_owner() from public, anon;
grant execute on function public.current_user_is_platform_owner() to authenticated;

notify pgrst, 'reload schema';
