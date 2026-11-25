import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('idea deletion requires the actual owner of the linked community throughout the product', async () => {
  const [provider, ideaPage, bot, migration] = await Promise.all([
    read('src/data/AppProvider.tsx'),
    read('src/screens/IdeaPage.tsx'),
    read('src/bot/QuorlythBot.tsx'),
    read('supabase/migrations/20261125120000_community_owner_only_idea_deletion.sql'),
  ])

  assert.match(provider, /if \(!ownsCommunity\(idea\.cid\)\) throw new Error\('Only the owner of this community can delete its ideas/)
  assert.match(ideaPage, /const canDeleteIdea = a\.ownsCommunity\(idea\.cid\)/)
  assert.match(bot, /if \(idea && a\.ownsCommunity\(idea\.cid\)\)/)
  assert.match(bot, /!a\.ownsCommunity\(idea\.cid\).*Only the owner of this community can delete/)
  assert.match(migration, /create policy docs_delete_idea_owner_only[\s\S]*?as restrictive[\s\S]*?for delete to authenticated/i)
  assert.match(migration, /private\.is_community_owner_of_idea\(split_part/)
  assert.match(migration, /coalesce\([\s\S]*?nullif\(community\.data->>'ownerId', ''\)[\s\S]*?community\.data->>'createdBy'/)
  assert.doesNotMatch(migration, /private\.can_manage_community|private\.is_platform_admin/)
  assert.match(provider, /if \(c\.createdBy\) return c\.createdBy === me\.id[\s\S]*?return false/)
})

test('automation field selection uses the orange, centred checkmark treatment', async () => {
  const css = await read('src/styles/automation-ai.css')
  const screen = await read('src/screens/Automations.tsx')

  assert.match(screen, /Fields Quorlyth may change/)
  assert.match(screen, /Uncheck anything you want preserved when editing an existing workflow/)
  assert.match(css, /\.wa-ai-field-choices input:checked\s*\{[^}]*background:\s*#e87949/i)
  assert.match(css, /\.wa-ai-field-choices input:checked::after\s*\{[^}]*margin:\s*2px auto 0/)
  assert.match(css, /\.wa-ai-field-choices input:focus-visible/)
})
