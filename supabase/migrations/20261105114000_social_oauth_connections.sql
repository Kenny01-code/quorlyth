-- Secure social OAuth states, provider application credentials, and connected account tokens.
create schema if not exists private;

create table if not exists private.social_oauth_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('x','linkedin','meta','pinterest')),
  pkce_verifier text,
  return_to text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table private.social_oauth_states enable row level security;
revoke all on private.social_oauth_states from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on private.social_oauth_states to service_role;
create index if not exists social_oauth_states_expiry_idx on private.social_oauth_states(expires_at);

create table if not exists private.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('x','linkedin','facebook','instagram','pinterest')),
  provider_account_id text not null,
  account_name text not null default '',
  username text not null default '',
  access_secret_id uuid not null,
  refresh_secret_id uuid,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);
alter table private.social_connections enable row level security;
revoke all on private.social_connections from public, anon, authenticated;
grant all on private.social_connections to service_role;
create index if not exists social_connections_user_provider_idx
  on private.social_connections(user_id, provider, connected_at desc);

create or replace function public.create_social_oauth_state(
  p_state_hash text,
  p_user_id uuid,
  p_provider text,
  p_pkce_verifier text,
  p_return_to text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $fn$
begin
  if p_state_hash !~ '^[a-f0-9]{64}$'
    or p_user_id is null
    or p_provider not in ('x','linkedin','meta','pinterest')
    or p_return_to not in ('https://quorlyth.vercel.app/settings?tab=social','https://quorlyth.vercel.app/settings?tab=social&oauth=connected') then
    raise exception 'Invalid OAuth state request' using errcode = '22023';
  end if;
  delete from private.social_oauth_states where user_id = p_user_id and provider = p_provider;
  delete from private.social_oauth_states where expires_at < now();
  insert into private.social_oauth_states(state_hash,user_id,provider,pkce_verifier,return_to,expires_at)
  values(p_state_hash,p_user_id,p_provider,p_pkce_verifier,p_return_to,now()+interval '10 minutes');
  return true;
end;
$fn$;

create or replace function public.consume_social_oauth_state(p_state_hash text)
returns table(user_id uuid, provider text, pkce_verifier text, return_to text)
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $fn$
begin
  return query
  delete from private.social_oauth_states state_row
  where state_row.state_hash = p_state_hash
    and state_row.expires_at > now()
  returning state_row.user_id,state_row.provider,state_row.pkce_verifier,state_row.return_to;
  delete from private.social_oauth_states where expires_at <= now();
end;
$fn$;

create or replace function public.store_social_oauth_provider_config(
  p_provider text,
  p_client_id text,
  p_client_secret text
)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $fn$
declare
  client_name text;
  secret_name text;
  existing_id uuid;
begin
  if p_provider not in ('x','linkedin','meta','pinterest')
    or length(trim(coalesce(p_client_id,''))) < 3
    or length(trim(coalesce(p_client_id,''))) > 300
    or length(trim(coalesce(p_client_secret,''))) < 8
    or length(trim(coalesce(p_client_secret,''))) > 2000 then
    raise exception 'Provider credentials are incomplete or invalid' using errcode = '22023';
  end if;

  client_name := 'social_oauth_' || p_provider || '_client_id';
  secret_name := 'social_oauth_' || p_provider || '_client_secret';

  select id into existing_id from vault.secrets where name = client_name;
  if existing_id is null then
    perform vault.create_secret(trim(p_client_id),client_name,'Quorlyth ' || p_provider || ' OAuth client ID');
  else
    perform vault.update_secret(existing_id,trim(p_client_id),client_name,'Quorlyth ' || p_provider || ' OAuth client ID');
  end if;

  existing_id := null;
  select id into existing_id from vault.secrets where name = secret_name;
  if existing_id is null then
    perform vault.create_secret(trim(p_client_secret),secret_name,'Quorlyth ' || p_provider || ' OAuth client secret');
  else
    perform vault.update_secret(existing_id,trim(p_client_secret),secret_name,'Quorlyth ' || p_provider || ' OAuth client secret');
  end if;

  return true;
end;
$fn$;

create or replace function public.get_social_oauth_provider_config(p_provider text)
returns table(client_id text,client_secret text)
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $fn$
  select
    max(secret.decrypted_secret) filter (where secret.name = 'social_oauth_' || p_provider || '_client_id'),
    max(secret.decrypted_secret) filter (where secret.name = 'social_oauth_' || p_provider || '_client_secret')
  from vault.decrypted_secrets secret
  where p_provider in ('x','linkedin','meta','pinterest')
    and secret.name in (
      'social_oauth_' || p_provider || '_client_id',
      'social_oauth_' || p_provider || '_client_secret'
    );
$fn$;

create or replace function public.upsert_social_connection(
  p_user_id uuid,
  p_provider text,
  p_provider_account_id text,
  p_account_name text,
  p_username text,
  p_access_token text,
  p_refresh_token text,
  p_token_expires_at timestamptz,
  p_refresh_token_expires_at timestamptz,
  p_scopes text[],
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $fn$
declare
  connection_id uuid;
  access_name text;
  refresh_name text;
  access_id uuid;
  refresh_id uuid;
begin
  if p_user_id is null
    or p_provider not in ('x','linkedin','facebook','instagram','pinterest')
    or nullif(trim(coalesce(p_provider_account_id,'')),'') is null
    or length(p_provider_account_id) > 220
    or nullif(p_access_token,'') is null
    or length(p_access_token) > 10000
    or (p_refresh_token is not null and length(p_refresh_token) > 10000) then
    raise exception 'Invalid connected account data' using errcode = '22023';
  end if;

  select connection.id,connection.access_secret_id,connection.refresh_secret_id
  into connection_id,access_id,refresh_id
  from private.social_connections connection
  where connection.user_id=p_user_id
    and connection.provider=p_provider
    and connection.provider_account_id=p_provider_account_id
  for update;

  if connection_id is null then connection_id := gen_random_uuid(); end if;

  access_name := 'social_connection_' || replace(connection_id::text,'-','') || '_access';
  refresh_name := 'social_connection_' || replace(connection_id::text,'-','') || '_refresh';

  if access_id is null then
    perform vault.create_secret(p_access_token,access_name,'Encrypted access token for a Quorlyth social account');
    select id into access_id from vault.secrets where name=access_name;
  else
    perform vault.update_secret(access_id,p_access_token,access_name,'Encrypted access token for a Quorlyth social account');
  end if;

  if nullif(p_refresh_token,'') is not null then
    if refresh_id is null then
      perform vault.create_secret(p_refresh_token,refresh_name,'Encrypted refresh token for a Quorlyth social account');
      select id into refresh_id from vault.secrets where name=refresh_name;
    else
      perform vault.update_secret(refresh_id,p_refresh_token,refresh_name,'Encrypted refresh token for a Quorlyth social account');
    end if;
  elsif refresh_id is not null then
    delete from vault.secrets where id=refresh_id;
    refresh_id := null;
  end if;

  insert into private.social_connections(
    id,user_id,provider,provider_account_id,account_name,username,
    access_secret_id,refresh_secret_id,token_expires_at,refresh_token_expires_at,
    scopes,metadata,updated_at
  )
  values(
    connection_id,p_user_id,p_provider,p_provider_account_id,
    left(coalesce(p_account_name,''),180),left(coalesce(p_username,''),180),
    access_id,refresh_id,p_token_expires_at,p_refresh_token_expires_at,
    coalesce(p_scopes,'{}'::text[]),
    case when jsonb_typeof(p_metadata)='object' then p_metadata else '{}'::jsonb end,
    now()
  )
  on conflict (user_id,provider,provider_account_id) do update set
    account_name=excluded.account_name,
    username=excluded.username,
    access_secret_id=excluded.access_secret_id,
    refresh_secret_id=excluded.refresh_secret_id,
    token_expires_at=excluded.token_expires_at,
    refresh_token_expires_at=excluded.refresh_token_expires_at,
    scopes=excluded.scopes,
    metadata=excluded.metadata,
    updated_at=now();

  return connection_id;
end;
$fn$;

create or replace function public.list_social_connections(p_user_id uuid)
returns table(
  connection_id uuid,
  provider text,
  provider_account_id text,
  account_name text,
  username text,
  token_expires_at timestamptz,
  scopes text[],
  metadata jsonb,
  connected_at timestamptz
)
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $fn$
  select connection.id,connection.provider,connection.provider_account_id,
    connection.account_name,connection.username,connection.token_expires_at,
    connection.scopes,connection.metadata,connection.connected_at
  from private.social_connections connection
  where connection.user_id=p_user_id
  order by connection.provider,connection.account_name;
$fn$;

create or replace function public.get_social_connection_tokens(p_user_id uuid,p_connection_id uuid)
returns table(
  connection_id uuid,
  provider text,
  provider_account_id text,
  account_name text,
  username text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scopes text[],
  metadata jsonb
)
language sql
stable
security definer
set search_path = ''
set row_security = 'off'
as $fn$
  select connection.id,connection.provider,connection.provider_account_id,
    connection.account_name,connection.username,
    access_secret.decrypted_secret,refresh_secret.decrypted_secret,
    connection.token_expires_at,connection.refresh_token_expires_at,
    connection.scopes,connection.metadata
  from private.social_connections connection
  join vault.decrypted_secrets access_secret on access_secret.id=connection.access_secret_id
  left join vault.decrypted_secrets refresh_secret on refresh_secret.id=connection.refresh_secret_id
  where connection.user_id=p_user_id and connection.id=p_connection_id;
$fn$;

create or replace function public.delete_social_connection(p_user_id uuid,p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = 'off'
as $fn$
declare
  access_id uuid;
  refresh_id uuid;
begin
  select access_secret_id,refresh_secret_id into access_id,refresh_id
  from private.social_connections
  where user_id=p_user_id and id=p_connection_id
  for update;
  if not found then return false; end if;
  delete from private.social_connections where user_id=p_user_id and id=p_connection_id;
  delete from vault.secrets where id in (access_id,refresh_id);
  return true;
end;
$fn$;

do $grants$
declare fn_signature text;
begin
  foreach fn_signature in array array[
    'public.create_social_oauth_state(text,uuid,text,text,text)',
    'public.consume_social_oauth_state(text)',
    'public.store_social_oauth_provider_config(text,text,text)',
    'public.get_social_oauth_provider_config(text)',
    'public.upsert_social_connection(uuid,text,text,text,text,text,text,timestamptz,timestamptz,text[],jsonb)',
    'public.list_social_connections(uuid)',
    'public.get_social_connection_tokens(uuid,uuid)',
    'public.delete_social_connection(uuid,uuid)'
  ] loop
    execute 'revoke all on function ' || fn_signature || ' from public, anon, authenticated';
  end loop;
end
$grants$;

grant execute on function public.create_social_oauth_state(text,uuid,text,text,text) to service_role;
grant execute on function public.consume_social_oauth_state(text) to service_role;
grant execute on function public.store_social_oauth_provider_config(text,text,text) to service_role;
grant execute on function public.get_social_oauth_provider_config(text) to service_role;
grant execute on function public.upsert_social_connection(uuid,text,text,text,text,text,text,timestamptz,timestamptz,text[],jsonb) to service_role;
grant execute on function public.list_social_connections(uuid) to service_role;
grant execute on function public.get_social_connection_tokens(uuid,uuid) to service_role;
grant execute on function public.delete_social_connection(uuid,uuid) to service_role;
