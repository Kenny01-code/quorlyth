-- Restore creator metadata for legacy communities from the one-time owner claim.
-- No personal email is used: ownership follows the verified Auth user ID recorded in
-- config/owner. Only community records with missing ownership fields are backfilled.
with claimed_owner as (
  select u.id::text as id
  from public.docs claim
  join auth.users u on u.id = case
    when coalesce(claim.data->>'id','') ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (claim.data->>'id')::uuid else null end
  where claim.path = 'config/owner' and u.email_confirmed_at is not null
  limit 1
)
update public.docs as d
set data = jsonb_set(
      jsonb_set(d.data, '{ownerId}', to_jsonb(coalesce(nullif(d.data->>'ownerId',''), claimed_owner.id)), true),
      '{createdBy}', to_jsonb(coalesce(nullif(d.data->>'createdBy',''), claimed_owner.id)), true
    ),
    updated_at = now()
from claimed_owner
where d.path ~ '^communities/[^/]+$'
  and (nullif(d.data->>'ownerId','') is null or nullif(d.data->>'createdBy','') is null);

notify pgrst, 'reload schema';
