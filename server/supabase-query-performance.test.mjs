import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Supabase collection subscriptions use indexed path ranges', async () => {
  const source = await readSource('src/data/supabase.ts')
  assert.ok(source.includes("const prefix = collection + '/'"))
  assert.ok(source.includes("const upperBound = collection + '0'"))
  assert.ok(source.includes(".gte('path', prefix)"))
  assert.ok(source.includes(".lt('path', upperBound)"))
  assert.ok(!source.includes(".like('path', collection + '/%'"))
  assert.ok(source.includes(".filter(r => isDirectChild(collection, r.path))"))
})

test('collection boundaries include the separator but exclude the next collection', async () => {
  const collection = 'ideas'
  const lower = collection + '/'
  const upper = collection + '0'
  const inRange = path => path >= lower && path < upper
  assert.equal(inRange('ideas/idea-1'), true)
  assert.equal(inRange('ideas/idea-1/comments/comment-1'), true)
  assert.equal(inRange('ideaOutcomes/idea-1'), false)
  assert.equal(inRange('ideasArchive/item-1'), false)
  const isDirectChild = path => path.startsWith(lower) && !path.slice(lower.length).includes('/')
  assert.equal(isDirectChild('ideas/idea-1'), true)
  assert.equal(isDirectChild('ideas/idea-1/comments/comment-1'), false)
})

test('authenticated startup can batch collection reads into one RLS-scoped query', async () => {
  const adapter = await readSource('src/data/supabase.ts')
  const store = await readSource('src/data/docstore.ts')
  const provider = await readSource('src/data/AppProvider.tsx')
  assert.ok(store.includes('subscribeMany?('))
  assert.ok(adapter.includes('subscribeMany(collections, cb, onError)'))
  assert.ok(adapter.includes(".select('path,data')"))
  assert.ok(adapter.includes(".or(collectionFilters.join(','))"))
  assert.ok(adapter.includes('const collectionFilters = targets.map(collection =>'))
  assert.ok(adapter.includes('/^[A-Za-z][A-Za-z0-9_]*$/'))
  assert.ok(adapter.includes(".order('path', { ascending: true })"))
  assert.ok(adapter.includes('watchedSet.has(collection)'))
  assert.ok(adapter.includes('isDirectChild(collection, row.path)'))
  assert.ok(provider.includes('if (s.subscribeMany)'))
  assert.ok(provider.includes('s.subscribeMany(collections'))
  assert.ok(provider.includes('s.subscribe(collection, docs => publishCollection(collection, docs)'))
})

test('batched collection grouping excludes nested records and unrelated collections', async () => {
  const collections = new Set(['ideas', 'profiles', 'workSubmissions'])
  const isDirectChild = (collection, path) => path.startsWith(collection + '/') && !path.slice(collection.length + 1).includes('/')
  const group = path => {
    const slash = path.indexOf('/')
    if (slash <= 0) return null
    const collection = path.slice(0, slash)
    return collections.has(collection) && isDirectChild(collection, path) ? collection : null
  }
  assert.equal(group('ideas/idea-1'), 'ideas')
  assert.equal(group('profiles/user-1'), 'profiles')
  assert.equal(group('workSubmissions/submission-1'), 'workSubmissions')
  assert.equal(group('ideas/idea-1/comments/comment-1'), null)
  assert.equal(group('ideaOutcomes/idea-1'), null)
  assert.equal(group('profilesArchive/user-1'), null)
})
