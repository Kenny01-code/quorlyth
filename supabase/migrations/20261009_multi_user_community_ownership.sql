-- Multi-user community ownership and scoped permissions for Quorlyth.
-- Run this migration in the Supabase SQL Editor after the earlier Quorlyth migrations.

create or replace function public.can_manage_community(p_cid text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select public.is_owner() or exists (
    select 1 from public.docs d
    where d.path = 'communities/' || p_cid
      and (
        d.data->>'ownerId' = (select auth.uid())::text
        or d.data->>'createdBy' = (select auth.uid())::text
      )
  )
$$;
revoke all on function public.can_manage_community(text) from public;
grant execute on function public.can_manage_community(text) to authenticated;

create or replace function public.can_view_community(p_cid text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select public.is_owner()
    or exists (
      select 1 from public.docs c
      where c.path = 'communities/' || p_cid
        and (
          coalesce(c.data->>'vis', 'listed') <> 'unlisted'
          or c.data->>'ownerId' = (select auth.uid())::text
          or c.data->>'createdBy' = (select auth.uid())::text
        )
    )
    or exists (
      select 1 from public.docs m
      where m.path = 'members/' || (select auth.uid())::text
        and coalesce(m.data->'c'->>p_cid, 'false') = 'true'
    )
    or public.can_manage_community(p_cid)
$$;
revoke all on function public.can_view_community(text) from public;
grant execute on function public.can_view_community(text) to authenticated;

create or replace function public.can_post_to_community(p_cid text)
returns boolean
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select public.can_manage_community(p_cid)
    or exists (
      select 1 from public.docs c
      where c.path = 'communities/' || p_cid
        and coalesce(c.data->>'arch', 'false') <> 'true'
        and (
          coalesce(c.data->>'post', 'anyone') = 'anyone'
          or (
            c.data->>'post' = 'members'
            and exists (
              select 1 from public.docs m
              where m.path = 'members/' || (select auth.uid())::text
                and coalesce(m.data->'c'->>p_cid, 'false') = 'true'
            )
          )
        )
    )
$$;
revoke all on function public.can_post_to_community(text) from public;
grant execute on function public.can_post_to_community(text) to authenticated;

create or replace function public.idea_community_id(p_idea_id text)
returns text
language sql stable security definer
set search_path = '' set row_security = off
as $$
  select d.data->>'cid'
  from public.docs d
  where d.path = 'ideas/' || p_idea_id
  limit 1
$$;
revoke all on function public.idea_community_id(text) from public;
grant execute on function public.idea_community_id(text) to authenticated;

-- Create community records only for yourself. Platform admins retain full access
-- through the existing "owner writes all" policy.
drop policy if exists "users create owned communities" on public.docs;
create policy "users create owned communities" on public.docs for insert to authenticated
  with check (
    path like 'communities/%'
    and data->>'ownerId' = (select auth.uid())::text
    and data->>'createdBy' = (select auth.uid())::text
  );

drop policy if exists "community owners manage community docs" on public.docs;
create policy "community owners manage community docs" on public.docs for all to authenticated
  using (path like 'communities/%' and public.can_manage_community(split_part(path, '/', 2)))
  with check (path like 'communities/%' and public.can_manage_community(split_part(path, '/', 2)));

-- Remove the broad rule that allowed every signed-in account to write every idea.
drop policy if exists "members write ideas" on public.docs;

drop policy if exists "users create ideas in allowed communities" on public.docs;
create policy "users create ideas in allowed communities" on public.docs for insert to authenticated
  with check (
    path like 'ideas/%'
    and path !~ '^ideas/[^/]+/.+'
    and data->>'authorId' = (select auth.uid())::text
    and public.can_post_to_community(data->>'cid')
  );

drop policy if exists "community owners and authors manage idea content" on public.docs;
create policy "community owners and authors manage idea content" on public.docs for all to authenticated
  using (
    path like 'ideas/%'
    and (
      public.can_manage_community(public.idea_community_id(split_part(path, '/', 2)))
      or (
        public.can_post_to_community(public.idea_community_id(split_part(path, '/', 2)))
        and exists (
          select 1 from public.docs idea
          where idea.path = 'ideas/' || split_part(public.docs.path, '/', 2)
            and idea.data->>'authorId' = (select auth.uid())::text
        )
      )
      or (
        path like 'ideas/%/comments/%'
        and public.can_post_to_community(public.idea_community_id(split_part(path, '/', 2)))
      )
    )
  )
  with check (
    path like 'ideas/%'
    and (
      public.can_manage_community(public.idea_community_id(split_part(path, '/', 2)))
      or (
        public.can_post_to_community(public.idea_community_id(split_part(path, '/', 2)))
        and (
          (path !~ '^ideas/[^/]+/.+' and data->>'authorId' = (select auth.uid())::text)
          or path like 'ideas/%/comments/%'
        )
      )
    )
  );

-- Scope community and idea reads so unlisted communities are not globally visible.
-- Other signed-in data keeps the existing read behavior and private-data restrictions.
drop policy if exists "read when signed in" on public.docs;
create policy "read when signed in" on public.docs for select to authenticated
  using (
    (path not like 'data/users/%' or path like 'data/users/' || (select auth.uid())::text || '/%' or public.is_owner())
    and (path not like 'requests/%' or path = 'requests/' || (select auth.uid())::text or public.is_owner())
    and (
      path not like 'communities/%'
      or public.can_view_community(split_part(path, '/', 2))
    )
    and (
      path not like 'ideas/%'
      or public.can_view_community(public.idea_community_id(split_part(path, '/', 2)))
    )
  );

-- Community deletion is allowed to its owner or the platform administrator.
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
  if p_cid is null or p_cid !~ '^[A-Za-z0-9_-]{1,120}$' then
    raise exception 'Invalid community ID' using errcode = '22023';
  end if;

  if not public.can_manage_community(p_cid) then
    raise exception 'Only this community owner or a platform administrator can delete it'
      using errcode = '42501';
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

  update public.docs
    set data = jsonb_set(data, '{c}', coalesce(data->'c', '{}'::jsonb) - p_cid, true),
        updated_at = now()
  where path like 'members/%'
    and coalesce(data->'c', '{}'::jsonb) ? p_cid;

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

notify pgrst, 'reload schema';
