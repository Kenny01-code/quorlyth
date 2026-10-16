-- Historical approvals created before membership writes were hardened may lack
-- the matching members/<userId> document. Reconcile them idempotently.
insert into public.docs as existing (path, data)
select
  'members/' || (request.data->>'userId') as path,
  jsonb_build_object('c', jsonb_build_object(request.data->>'cid', true)) as data
from public.docs request
where request.path ~ '^communityJoinRequests/[^/]+$'
  and request.data->>'status' = 'approved'
  and coalesce(request.data->>'cid', '') ~ '^[A-Za-z0-9_-]{1,120}$'
  and coalesce(request.data->>'userId', '') <> ''
on conflict (path) do update
set data = jsonb_set(
      coalesce(existing.data, '{}'::jsonb),
      '{c}',
      coalesce(existing.data->'c', '{}'::jsonb) || coalesce(excluded.data->'c', '{}'::jsonb),
      true
    ),
    updated_at = now();
