import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('community managers are a delegated role, not community owners', async () => {
  const [types, provider, migration] = await Promise.all([
    source('src/lib/types.ts'),
    source('src/data/AppProvider.tsx'),
    source('supabase/migrations/20261118190000_community_manager_roles.sql'),
  ])

  assert.match(types, /managerIds\?: string\[\]/)
  assert.match(provider, /community\.managerIds/)
  assert.match(provider, /Array\.isArray\(community\.managerIds\)/)
  assert.match(migration, /private\.is_member_of_community\(p_cid\)/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.can_manage_community/)
})

test('only owners can assign managers or change ownership and moderator roles', async () => {
  const [community, migration] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('supabase/migrations/20261118190000_community_manager_roles.sql'),
  ])

  assert.match(community, /isCommunityOwner && <CommunityManagerPanel/)
  assert.match(community, /Assign manager/)
  assert.match(community, /Remove manager/)
  assert.match(migration, /new\.data->'managerIds' is distinct from old\.data->'managerIds'/)
  assert.match(migration, /new\.data->'moderatorIds' is distinct from old\.data->'moderatorIds'/)
  assert.match(migration, /Only the community owner can change community roles or ownership/)
})

test('managers can access moderation tabs but not owner settings or community deletion', async () => {
  const [community, migration] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('supabase/migrations/20261118190000_community_manager_roles.sql'),
  ])

  assert.match(community, /isCommunityOwner \? \['Settings'\] : \[\]/)
  assert.match(community, /tab === 6 && isCommunityOwner/)
  assert.match(migration, /Only the community owner can delete this community/)
  assert.match(migration, /private\.is_platform_admin\(\)/)
})

test('manager picker only offers existing members and clearly marks assigned managers', async () => {
  const [community, css] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/styles/community-experience.css'),
  ])

  assert.match(community, /memberIds\.filter\(id => id !== ownerId && !managerIds\.includes\(id\)\)/)
  assert.match(community, /Community manager/)
  assert.match(css, /\.community-manager-panel/)
  assert.match(css, /\.community-manager-pill/)
})
