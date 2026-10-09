-- Secure community deletion without exposing a service-role key to the browser or AI.
-- Only the verified owner recognized by public.is_owner() may call this function.
create or replace function public.admin_delete_community(p_cid text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea_ids text[];
  v_project_ids text[];
  v_idea_count integer := 0;
  v_deleted_count integer := 0;
begin
  if not public.is_owner() then
    raise exception 'Only the verified Quorlyth owner can delete a community'
      using errcode = '42501';
  end if;

  if p_cid is null or p_cid !~ '^[A-Za-z0-9_-]{1,120}$' then
    raise exception 'Invalid community ID' using errcode = '22023';
  end if;

  if not exists (select 1 from public.docs where path = 'communities/' || p_cid) then
    raise exception 'Community not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(substr(path, 7)), array[]::text[])
    into v_idea_ids
  from public.docs
  where path like 'ideas/%'
    and path !~ '^ideas/[^/]+/.+'
    and data->>'cid' = p_cid;

  v_idea_count := coalesce(array_length(v_idea_ids, 1), 0);

  select coalesce(array_agg(substr(path, 10)), array[]::text[])
    into v_project_ids
  from public.docs
  where path like 'projects/%'
    and data->>'ideaId' = any(v_idea_ids);

  -- Remove this community from memberships while preserving each user's other memberships.
  update public.docs
    set data = jsonb_set(data, '{c}', coalesce(data->'c', '{}'::jsonb) - p_cid, true),
        updated_at = now()
  where path like 'members/%'
    and coalesce(data->'c', '{}'::jsonb) ? p_cid;

  -- Delete linked idea documents and all nested comments/attachments.
  delete from public.docs
  where path = 'communities/' || p_cid
     or exists (
       select 1 from unnest(v_idea_ids) as i(id)
       where public.docs.path = 'ideas/' || i.id
          or public.docs.path like 'ideas/' || i.id || '/%'
     )
     or exists (select 1 from unnest(v_idea_ids) as i(id) where public.docs.path = 'reviews/' || i.id)
     or exists (select 1 from unnest(v_idea_ids) as i(id) where public.docs.path = 'projects/' || i.id)
     or (path like 'volunteers/%' and data->>'ideaId' = any(v_idea_ids))
     or (path like 'promotions/%' and data->>'ideaId' = any(v_idea_ids))
     or (path like 'milestones/%' and data->>'projectId' = any(v_project_ids));

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deletedCommunity', p_cid,
    'deletedIdeas', v_idea_count,
    'deletedRecords', v_deleted_count
  );
end;
$$;

revoke all on function public.admin_delete_community(text) from public, anon;
grant execute on function public.admin_delete_community(text) to authenticated;

-- Make the new RPC immediately available through Supabase REST.
notify pgrst, 'reload schema';
