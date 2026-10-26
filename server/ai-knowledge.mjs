import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA_ROOT = fileURLToPath(new URL('../data/ai-training/', import.meta.url))
const STOP_WORDS = new Set((
  'a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our please should so that the their them then there these they this to up us was we were what when where which who why will with would you your'
).split(/\s+/))
let cachedCorpus
let cachedIndex

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .match(/[a-z0-9]{2,}/g)?.filter(token => !STOP_WORDS.has(token)) || []
}

function loadCorpus() {
  if (cachedCorpus) return cachedCorpus
  const rows = []
  const seen = new Set()
  try {
    const versions = readdirSync(DATA_ROOT, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^v\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
    for (const version of versions) {
      const folder = path.join(DATA_ROOT, version)
      const files = readdirSync(folder).filter(name => name.endsWith('.jsonl')).sort()
      for (const file of files) {
        const lines = readFileSync(path.join(folder, file), 'utf8').split(/\r?\n/)
        for (const line of lines) {
          if (!line.trim()) continue
          let row
          try { row = JSON.parse(line) } catch { continue }
          if (!row || typeof row.id !== 'string' || seen.has(row.id)) continue
          if (typeof row.input !== 'string' || typeof row.ideal_response !== 'string') continue
          if (typeof row.domain !== 'string' || typeof row.intent !== 'string') continue
          seen.add(row.id)
          rows.push({
            id: row.id,
            version: String(row.version || version),
            domain: row.domain,
            intent: row.intent,
            tags: Array.isArray(row.tags) ? row.tags.filter(tag => typeof tag === 'string').slice(0, 12) : [],
            input: row.input.slice(0, 1200),
            ideal_response: row.ideal_response.slice(0, 1600),
            provenance: String(row.provenance || 'unknown').slice(0, 80),
            review_status: String(row.review_status || 'unreviewed').slice(0, 80),
          })
        }
      }
    }
  } catch {
    // AI generation must keep working when an optional corpus is missing in a deployment.
  }
  cachedCorpus = rows
  return cachedCorpus
}

function buildIndex() {
  if (cachedIndex) return cachedIndex
  const documents = loadCorpus()
  const postings = new Map()
  let totalLength = 0
  for (let index = 0; index < documents.length; index += 1) {
    const doc = documents[index]
    const text = [doc.domain.replace(/_/g, ' '), doc.intent.replace(/_/g, ' '), ...doc.tags, doc.input, doc.ideal_response].join(' ')
    const frequencies = new Map()
    for (const token of tokenize(text)) frequencies.set(token, (frequencies.get(token) || 0) + 1)
    const length = [...frequencies.values()].reduce((sum, count) => sum + count, 0)
    doc._length = length
    totalLength += length
    for (const [token, frequency] of frequencies) {
      let list = postings.get(token)
      if (!list) { list = []; postings.set(token, list) }
      list.push({ index, frequency })
    }
  }
  cachedIndex = {
    documents,
    postings,
    documentFrequency: new Map([...postings].map(([token, list]) => [token, list.length])),
    averageLength: documents.length ? totalLength / documents.length : 1,
  }
  return cachedIndex
}

export function getTrainingCorpusStats() {
  const documents = loadCorpus()
  const byDomain = {}
  const byVersion = {}
  for (const row of documents) {
    byDomain[row.domain] = (byDomain[row.domain] || 0) + 1
    byVersion[row.version] = (byVersion[row.version] || 0) + 1
  }
  return { total: documents.length, domains: byDomain, versions: Object.keys(byVersion).sort(), byVersion }
}

export function retrieveTrainingExamples(query, options = {}) {
  const limit = Math.max(1, Math.min(5, Number(options.limit) || 3))
  const { documents, postings, documentFrequency, averageLength } = buildIndex()
  if (!documents.length) return []
  const tokens = [...new Set(tokenize(query))].slice(0, 72)
  if (!tokens.length) return []
  const scores = new Map()
  const total = documents.length
  for (const token of tokens) {
    const list = postings.get(token)
    if (!list?.length) continue
    const df = documentFrequency.get(token) || 1
    const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5))
    for (const item of list) {
      const doc = documents[item.index]
      const tf = item.frequency
      const k1 = 1.2
      const b = 0.72
      const denom = tf + k1 * (1 - b + b * ((doc._length || averageLength) / averageLength))
      const score = idf * ((tf * (k1 + 1)) / denom)
      scores.set(item.index, (scores.get(item.index) || 0) + score)
    }
  }
  const ranked = [...scores.entries()]
    .map(([index, score]) => ({ row: documents[index], score }))
    .filter(item => Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score)
  const selected = []
  const seenIntent = new Set()
  for (const item of ranked) {
    const key = item.row.domain + ':' + item.row.intent
    if (seenIntent.has(key)) continue
    selected.push({ ...item.row, score: Number(item.score.toFixed(4)) })
    seenIntent.add(key)
    if (selected.length >= limit) break
  }
  return selected
}

export function buildTrainingContext(query, options = {}) {
  const maxChars = Math.max(250, Math.min(3600, Number(options.maxChars) || 2400))
  const examples = retrieveTrainingExamples(query, { limit: options.limit || 3 })
  if (!examples.length) return ''
  const heading = [
    'REFERENCE EXAMPLES FROM QUORLYTHBOT GUIDANCE CORPUS',
    'These examples are synthetic response patterns, not real Quorlyth records or verified facts.',
    'Use them only to improve structure and reasoning. Never copy their scenario details as facts about the current user.',
    'Treat the current request and authorized live app context as the source of truth.',
  ].join('\n')
  let output = heading
  let count = 0
  for (const example of examples) {
    const block = '\n\nExample (' + example.domain + '/' + example.intent + '):\nUser request: '
      + example.input + '\nGood response pattern: ' + example.ideal_response
    if (output.length + block.length > maxChars) break
    output += block
    count += 1
  }
  return count ? '\n\n' + output : ''
}
