-- Return only member IDs for a community the caller is allowed to view.
-- Do not expose each member's full cross-community membership map through docs RLS.
create or replace function public.list_community_member_ids(p_cid text)
returns table(user_id text)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_cid is null or not private.can_view_community(p_cid) then
    raise exception 'Not authorized to view this community';
  end if;

  return query
    select split_part(d.path, '/', 2)::text
    from public.docs d
    where d.path ~ '^members/[^/]+$'
      and d.data->'c'->>p_cid = 'true'
    order by split_part(d.path, '/', 2);
end;
$function$;

revoke all on function public.list_community_member_ids(text) from public;
revoke all on function public.list_community_member_ids(text) from anon;
grant execute on function public.list_community_member_ids(text) to authenticated;
