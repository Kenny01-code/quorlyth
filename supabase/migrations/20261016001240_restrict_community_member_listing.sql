-- Member lists are visible only to the community's managers and current members.
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

  if p_cid is null
     or not (private.can_manage_community(p_cid) or private.is_member_of_community(p_cid)) then
    raise exception 'Only community members and managers can view this member list';
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
