create or replace function private.notify_quorlyth_backing_to_platform_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $function$
declare
  v_actor text;
  v_actor_name text;
  v_idea_id text;
  v_idea jsonb;
  v_cid text;
  v_community jsonb;
  v_title text;
  v_community_name text;
  v_at bigint;
  v_entry record;
  v_recipient text;
begin
  if new.path !~ '^votes/[^/]+$' then
    return new;
  end if;

  v_actor := split_part(new.path, '/', 2);
  select coalesce(p.data->>'name', p.data->>'authName', 'A member')
    into v_actor_name
  from public.docs p
  where p.path = 'profiles/' || v_actor;
  v_actor_name := coalesce(v_actor_name, 'A member');
  v_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  for v_entry in
    select entry.key as idea_id
    from jsonb_each(coalesce(new.data->'ideas', '{}'::jsonb)) entry
    where entry.value = 'true'::jsonb
      and coalesce(old.data->'ideas'->>entry.key, 'false') <> 'true'
  loop
    v_idea_id := v_entry.idea_id;
    select i.data into v_idea
    from public.docs i
    where i.path = 'ideas/' || v_idea_id;
    if v_idea is null then
      continue;
    end if;

    v_cid := v_idea->>'cid';
    v_title := coalesce(nullif(v_idea->>'title', ''), 'an idea');
    select c.data into v_community
    from public.docs c
    where c.path = 'communities/' || v_cid;
    v_community_name := coalesce(v_community->>'name', 'a community');

    -- The existing activity trigger already notifies the idea author and
    -- community owner/creator. This trigger adds every platform owner/admin,
    -- avoiding duplicate notifications for recipients covered by that trigger.
    for v_recipient in
      select distinct r.user_id::text
      from private.platform_roles r
      where r.role in ('owner', 'admin')
        and r.user_id::text <> coalesce(v_actor, '')
        and r.user_id::text is distinct from v_idea->>'authorId'
        and r.user_id::text is distinct from v_community->>'ownerId'
        and r.user_id::text is distinct from v_community->>'createdBy'
    loop
      perform private.emit_quorlyth_notification(
        v_recipient,
        'vote-platform-admin:' || new.path || ':' || v_idea_id || ':' || txid_current() || ':' || v_recipient,
        'vote',
        'approve',
        v_actor_name || ' backed "' || v_title || '" in ' || v_community_name,
        v_idea_id || '_' || v_actor,
        v_idea_id,
        v_at
      );
    end loop;
  end loop;

  return new;
end;
$function$;

revoke all on function private.notify_quorlyth_backing_to_platform_roles() from public, anon, authenticated;

drop trigger if exists docs_notify_quorlyth_backing_to_platform_roles on public.docs;
create trigger docs_notify_quorlyth_backing_to_platform_roles
after insert or update on public.docs
for each row
when (new.path ~ '^votes/[^/]+$')
execute function private.notify_quorlyth_backing_to_platform_roles();
