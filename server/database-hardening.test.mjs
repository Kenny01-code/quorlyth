import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('daily activity RPC uses invoker permissions and the self-service RLS policy', async () => {
  const [rpc, ledger] = await Promise.all([
    source('supabase/migrations/20261107101500_track_active_day_invoker_security.sql'),
    source('supabase/migrations/20261030_growth_activation_event_ledger.sql'),
  ])

  assert.match(rpc, /security invoker/i)
  assert.match(rpc, /set search_path = ''/i)
  assert.doesNotMatch(rpc, /^\s*security definer\b/im)
  assert.doesNotMatch(rpc, /^\s*set row_security\s*=\s*off\b/im)
  assert.match(rpc, /revoke all on function public\.track_active_day\(\) from public, anon, authenticated/i)
  assert.match(rpc, /grant execute on function public\.track_active_day\(\) to authenticated/i)

  assert.match(ledger, /create policy growth_events_self_service_insert[\s\S]*?with check\s*\([\s\S]*?user_id = \(select auth\.uid\(\)\)[\s\S]*?actor_id = \(select auth\.uid\(\)\)/i)
  assert.match(ledger, /event_name in \('active_day', 'onboarding_started', 'onboarding_completed', 'invite_link_shared'\)/i)
  assert.match(ledger, /event_name <> 'active_day'[\s\S]*?event_key = to_char\(\(now\(\) at time zone 'UTC'\)::date, 'YYYY-MM-DD'\)/i)
})
