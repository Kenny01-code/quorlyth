-- Restore creator metadata for Quorlyth communities created before ownerId/createdBy
-- were stored. Run from the Supabase SQL Editor as the project database owner.
-- Only communities with missing ownership fields are changed.

with verified_owner as (
  select id::text as id
  from auth.users
  where lower(email) = 'ighiledivine77@gmail.com'
    and email_confirmed_at is not null
  order by created_at asc
  limit 1
)
update public.docs as d
set data = jsonb_set(
             jsonb_set(d.data, '{ownerId}', to_jsonb(coalesce(nullif(d.data->>'ownerId',''), verified_owner.id)), true),
             '{createdBy}', to_jsonb(coalesce(nullif(d.data->>'createdBy',''), verified_owner.id)), true
           ),
    updated_at = now()
from verified_owner
where d.path like 'communities/%'
  and d.path !~ '^communities/[^/]+/.+'
  and (
    nullif(d.data->>'ownerId','') is null
    or nullif(d.data->>'createdBy','') is null
  );

notify pgrst, 'reload schema';
