import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTrainingContext, getTrainingCorpusStats, retrieveTrainingExamples } from './ai-knowledge.mjs'

test('loads the versioned 10,000-example dataset', () => {
  const stats = getTrainingCorpusStats()
  assert.ok(stats.total >= 10000)
  assert.ok(Object.keys(stats.domains).length >= 10)
  assert.equal(stats.byVersion['1.0.0'], 10000)
  for (const count of Object.values(stats.domains)) assert.ok(count >= 1000)
  assert.ok(stats.versions.includes('1.0.0'))
})

test('retrieves relevant idea guidance for an idea-organizing request', () => {
  const results = retrieveTrainingExamples('Organize a rough idea into a clear actionable draft for a community')
  assert.ok(results.length > 0)
  assert.ok(results.some(row => ['idea_design', 'community_design'].includes(row.domain)))
  assert.equal(new Set(results.map(row => row.domain + ':' + row.intent)).size, results.length)
})

test('retrieves automation guidance for retries and provider rate limits', () => {
  const results = retrieveTrainingExamples('design automation retries after a provider quota or rate limit error')
  assert.ok(results.some(row => row.domain === 'automation'))
})

test('context is bounded and marks examples as synthetic, not live facts', () => {
  const context = buildTrainingContext('Help me organize an idea and define a low-cost test', { limit: 3, maxChars: 1200 })
  assert.ok(context.length > 0)
  assert.ok(context.length <= 1220)
  assert.match(context, /synthetic response patterns/i)
  assert.match(context, /authorized live app context/i)
})

test('empty or unrelated input cannot break generation', () => {
  assert.deepEqual(retrieveTrainingExamples(''), [])
  assert.equal(buildTrainingContext(''), '')
})
