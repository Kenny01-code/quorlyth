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
