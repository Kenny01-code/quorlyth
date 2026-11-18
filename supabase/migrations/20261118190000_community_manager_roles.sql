-- Community managers are trusted community members with delegated moderation access.
-- Only a community owner or platform administrator can appoint managers,
-- change ownership/moderator roles, or delete the community.

CREATE OR REPLACE FUNCTION private.can_manage_community(p_cid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select p_cid is not null and (
    private.is_platform_admin()
    or exists (
      select 1
      from public.docs c
      where c.path = 'communities/' || p_cid
        and (
          c.data->>'ownerId' = (select auth.uid())::text
          or c.data->>'createdBy' = (select auth.uid())::text
          or (
            pg_catalog.jsonb_typeof(coalesce(c.data->'managerIds', '[]'::jsonb)) = 'array'
            and (coalesce(c.data->'managerIds', '[]'::jsonb) ? (select auth.uid())::text)
            and private.is_member_of_community(p_cid)
          )
        )
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_community(p_cid text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
  select public.is_owner() or exists (
    select 1
    from public.docs d
    where d.path = 'communities/' || p_cid
      and (
        d.data->>'ownerId' = (select auth.uid())::text
        or d.data->>'createdBy' = (select auth.uid())::text
        or (
          pg_catalog.jsonb_typeof(coalesce(d.data->'managerIds', '[]'::jsonb)) = 'array'
          and (coalesce(d.data->'managerIds', '[]'::jsonb) ? (select auth.uid())::text)
          and private.is_member_of_community(p_cid)
        )
      )
  );
$function$;

-- Managers may update ordinary community content through the existing
-- can_manage_community policy, but cannot change privileged role fields or
-- delete the community itself.
CREATE OR REPLACE FUNCTION private.guard_community_owner_controls()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET row_security TO 'off'
AS $function$
declare
  uid text := (select auth.uid())::text;
  cid text;
  manager_ids jsonb;
begin
  if tg_op = 'DELETE' then
    if old.path !~ '^communities/[^/]+$' then
      return old;
    end if;

    if private.is_platform_admin()
       or old.data->>'ownerId' = uid
       or old.data->>'createdBy' = uid then
      return old;
    end if;

    raise exception 'Only the community owner can delete this community'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.path ~ '^communities/[^/]+$' then
    cid := pg_catalog.split_part(old.path, '/', 2);

    if new.path is distinct from old.path then
      raise exception 'Community document paths cannot be changed'
        using errcode = '22023';
    end if;

    if new.data->'managerIds' is distinct from old.data->'managerIds' then
      manager_ids := coalesce(new.data->'managerIds', '[]'::jsonb);

      if pg_catalog.jsonb_typeof(manager_ids) <> 'array' then
        raise exception 'Community manager IDs must be an array'
          using errcode = '22023';
      end if;

      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(manager_ids) as candidate(value)
        where pg_catalog.jsonb_typeof(candidate.value) <> 'string'
      ) then
        raise exception 'Community manager IDs must contain user IDs'
          using errcode = '22023';
      end if;

      if (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements_text(manager_ids)
      ) <> (
        select pg_catalog.count(distinct manager_id)
        from pg_catalog.jsonb_array_elements_text(manager_ids) as manager(manager_id)
      ) then
        raise exception 'A community manager can only be assigned once'
          using errcode = '22023';
      end if;

      if exists (
        select 1
        from pg_catalog.jsonb_array_elements_text(manager_ids) as manager(manager_id)
        where manager.manager_id in (
          coalesce(new.data->>'ownerId', ''),
          coalesce(new.data->>'createdBy', '')
        )
        or not exists (
          select 1
          from public.docs member_doc
          where member_doc.path = 'members/' || manager.manager_id
            and coalesce(member_doc.data->'c'->>cid, 'false') = 'true'
        )
      ) then
        raise exception 'Only existing community members can be assigned as managers'
          using errcode = '23514';
      end if;
    end if;

    if private.is_platform_admin()
       or old.data->>'ownerId' = uid
       or old.data->>'createdBy' = uid then
      return new;
    end if;

    if new.data->'managerIds' is distinct from old.data->'managerIds'
       or new.data->'moderatorIds' is distinct from old.data->'moderatorIds'
       or new.data->>'ownerId' is distinct from old.data->>'ownerId'
       or new.data->>'createdBy' is distinct from old.data->>'createdBy' then
      raise exception 'Only the community owner can change community roles or ownership'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION private.guard_community_owner_controls() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_community_owner_controls ON public.docs;
CREATE TRIGGER guard_community_owner_controls
BEFORE UPDATE OR DELETE ON public.docs
FOR EACH ROW
EXECUTE FUNCTION private.guard_community_owner_controls();

NOTIFY pgrst, 'reload schema';
