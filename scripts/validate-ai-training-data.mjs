#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../data/ai-training/v1/', import.meta.url))
const names = (await readdir(root)).filter(name => name.endsWith('.jsonl'))
assert.equal(names.length, 10, 'Expected 10 domain shards, got ' + names.length)
const seen = new Set()
const counts = new Map()
for (const name of names) {
  const lines = (await readFile(path.join(root, name), 'utf8')).split(/\r?\n/).filter(Boolean)
  assert.equal(lines.length, 1000, name + ' should contain 1000 examples, got ' + lines.length)
  for (const line of lines) {
    const row = JSON.parse(line)
    for (const key of ['id','version','domain','intent','input','ideal_response','provenance','review_status']) assert.ok(row[key], name + ': missing ' + key)
    assert.ok(Array.isArray(row.tags) && row.tags.length >= 3, row.id + ': expected tags')
    assert.equal(row.review_status, 'synthetic_unreviewed')
    assert.ok(row.input.length > 40 && row.ideal_response.length > 80, row.id + ': too short to be useful')
    assert.ok(!seen.has(row.id), 'Duplicate ID ' + row.id)
    seen.add(row.id)
    counts.set(row.domain, (counts.get(row.domain) || 0) + 1)
  }
}
assert.equal(seen.size, 10000)
assert.equal(counts.size, 10)
for (const [domain, count] of counts) assert.equal(count, 1000, domain + ': unexpected count ' + count)
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
assert.equal(manifest.total_examples, 10000)
process.stdout.write('Validated ' + seen.size + ' unique examples across ' + counts.size + ' domains.\n')
