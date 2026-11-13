-- Community owners need a scoped contributor summary that is not limited by
-- the caller's visibility into unrelated members' docs.
create or replace function public.list_community_contributors(p_cid text)
returns table(user_id text, ideas_count integer, backings_count integer)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $function$
declare
  v_owner_id text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_cid is null or not private.can_manage_community(p_cid) then
    raise exception 'Only community managers can view contributor analytics';
  end if;

  select coalesce(c.data->>'ownerId', c.data->>'createdBy', cfg.data->>'id')
    into v_owner_id
  from public.docs c
  left join public.docs cfg on cfg.path = 'config/owner'
  where c.path = 'communities/' || p_cid
  limit 1;

  return query
  with community_ideas as (
    select split_part(d.path, '/', 2) as idea_id,
           d.data->>'authorId' as author_id
    from public.docs d
    where d.path ~ '^ideas/[^/]+$'
      and d.data->>'cid' = p_cid
      and nullif(d.data->>'authorId', '') is not null
      and (v_owner_id is null or d.data->>'authorId' <> v_owner_id)
  ),
  idea_activity as (
    select ci.author_id,
           ci.idea_id,
           count(v.path)::integer as backing_count
    from community_ideas ci
    left join public.docs v
      on v.path ~ '^votes/[^/]+$'
     and v.data->'ideas'->>ci.idea_id = 'true'
    group by ci.author_id, ci.idea_id
  )
  select ia.author_id::text,
         count(*)::integer,
         coalesce(sum(ia.backing_count), 0)::integer
  from idea_activity ia
  group by ia.author_id
  order by count(*) desc, coalesce(sum(ia.backing_count), 0) desc, ia.author_id;
end;
$function$;

revoke all on function public.list_community_contributors(text) from public;
revoke all on function public.list_community_contributors(text) from anon;
grant execute on function public.list_community_contributors(text) to authenticated;
