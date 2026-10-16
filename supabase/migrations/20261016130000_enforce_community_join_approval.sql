-- Enforce the community's join-approval switch at the database boundary.
-- The UI already requests approval when joinApproval=true, but clients must not
-- be able to bypass that switch by writing directly to members/{userId}.
create or replace function private.enforce_community_join_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
set row_security = off
as $function$
declare
  authenticated_uid text := (select auth.uid())::text;
  member_uid text;
  previous_communities jsonb := '{}'::jsonb;
  entry record;
  community_data jsonb;
  request_data jsonb;
begin
  -- Membership data is stored as members/{uid} with a JSON object at data.c.
  if new.path !~ '^members/[^/]+$' then
    return new;
  end if;

  -- Trusted server-side operations may not carry a user JWT. Normal browser
  -- writes always do; row-level security remains responsible for those writes.
  if authenticated_uid is null then
    return new;
  end if;

  member_uid := split_part(new.path, '/', 2);

  -- Direct self-joins are the only writes this guard needs to mediate. RLS
  -- separately restricts ordinary users from writing another person's row.
  -- Platform managers can still perform explicit administrative operations.
  if member_uid <> authenticated_uid then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    previous_communities := coalesce(old.data->'c', '{}'::jsonb);
  end if;

  if jsonb_typeof(coalesce(new.data->'c', '{}'::jsonb)) <> 'object' then
    return new;
  end if;

  for entry in
    select key, value
    from jsonb_each(coalesce(new.data->'c', '{}'::jsonb))
  loop
    -- Enforce only a new grant. Leaving a community and unrelated changes to a
    -- member profile must continue to work when approval is enabled.
    if entry.value = 'true'::jsonb
       and coalesce(previous_communities->>entry.key, 'false') <> 'true' then
      select c.data
        into community_data
        from public.docs c
       where c.path = 'communities/' || entry.key;

      if coalesce(community_data->>'joinApproval', 'false') = 'true'
         and not private.can_manage_community(entry.key) then
        select r.data
          into request_data
          from public.docs r
         where r.path = 'communityJoinRequests/' || entry.key || '__' || member_uid
           and r.data->>'cid' = entry.key
           and r.data->>'userId' = member_uid
           and r.data->>'status' = 'approved';

        if request_data is null then
          raise exception 'Approval is required to join this community. Submit a join request and wait for approval.'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end loop;

  return new;
end;
$function$;

revoke all on function private.enforce_community_join_approval() from public, anon, authenticated;

drop trigger if exists docs_enforce_community_join_approval on public.docs;
create trigger docs_enforce_community_join_approval
before insert or update of path, data on public.docs
for each row execute function private.enforce_community_join_approval();
