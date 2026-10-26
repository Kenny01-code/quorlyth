#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTrainingExamples, DATASET_VERSION, DOMAINS, NICHES, SITUATIONS } from './ai-training-catalog.mjs'

const root = fileURLToPath(new URL('../data/ai-training/v' + DATASET_VERSION.split('.')[0] + '/', import.meta.url))
const rows = buildTrainingExamples()
const expected = DOMAINS.length * NICHES.length * SITUATIONS.length
if (rows.length !== expected) throw new Error('Expected exactly ' + expected + ' examples, generated ' + rows.length)
const seen = new Set()
for (const row of rows) {
  if (seen.has(row.id)) throw new Error('Duplicate training example id: ' + row.id)
  seen.add(row.id)
  if (!row.input || !row.ideal_response || !row.domain || !row.intent) throw new Error('Incomplete training example: ' + row.id)
}
await mkdir(root, { recursive: true })
const domains = [...new Set(rows.map(row => row.domain))]
for (const domain of domains) {
  const shardRows = rows.filter(row => row.domain === domain)
  const file = path.join(root, domain + '.jsonl')
  await writeFile(file, shardRows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8')
  process.stdout.write(path.basename(file) + ': ' + shardRows.length + ' examples\n')
}
const manifest = {
  name: 'QuorlythBot task-guidance corpus',
  version: DATASET_VERSION,
  total_examples: rows.length,
  domains: Object.fromEntries(domains.map(domain => [domain, rows.filter(row => row.domain === domain).length])),
  provenance: 'Deterministically generated from task-specific, hand-authored guidance templates and scenario variations.',
  status: 'synthetic_unreviewed; retrieval guidance only; not a fine-tuned model or human-validated ground truth',
  format: 'JSONL with input, ideal_response, tags, domain, intent, provenance, and review_status',
  created_by: 'scripts/generate-ai-training-data.mjs',
  created_at: '2026-10-26',
}
await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
process.stdout.write('\nGenerated ' + rows.length + ' examples in ' + domains.length + ' domain shards (version ' + DATASET_VERSION + ').\n')
