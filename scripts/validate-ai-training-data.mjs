#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const corpusRoot = fileURLToPath(new URL('../data/ai-training/', import.meta.url))
const versions = (await readdir(corpusRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && /^v\d+$/.test(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
assert.ok(versions.length > 0, 'No versioned training corpus folders were found')

const seen = new Set()
let total = 0
for (const versionFolder of versions) {
  const root = path.join(corpusRoot, versionFolder)
  const names = (await readdir(root)).filter(name => name.endsWith('.jsonl'))
  assert.ok(names.length > 0, versionFolder + ' has no JSONL shards')
  const counts = new Map()
  let versionTotal = 0
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'))
  assert.ok(Number.isInteger(manifest.total_examples) && manifest.total_examples > 0, versionFolder + ': invalid manifest count')
  for (const name of names) {
    const lines = (await readFile(path.join(root, name), 'utf8')).split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      const row = JSON.parse(line)
      for (const key of ['id','version','domain','intent','input','ideal_response','provenance','review_status']) {
        assert.ok(row[key], versionFolder + '/' + name + ': missing ' + key)
      }
      assert.ok(Array.isArray(row.tags) && row.tags.length >= 3, row.id + ': expected tags')
      assert.ok(['synthetic_unreviewed','reviewed','source_verified'].includes(row.review_status),
        row.id + ': unknown review_status ' + row.review_status)
      assert.ok(row.input.length > 40 && row.ideal_response.length > 80, row.id + ': too short to be useful')
      assert.ok(row.id.startsWith('qth-' + versionFolder + '-'), row.id + ': ID does not match the version folder')
      assert.ok(!seen.has(row.id), 'Duplicate ID ' + row.id)
      seen.add(row.id)
      versionTotal += 1
      counts.set(row.domain, (counts.get(row.domain) || 0) + 1)
    }
  }
  assert.equal(versionTotal, Number(manifest.total_examples), versionFolder + ': manifest count mismatch')
  assert.deepEqual(Object.fromEntries([...counts].sort()), Object.fromEntries(Object.entries(manifest.domains).sort()),
    versionFolder + ': per-domain manifest counts mismatch')
  total += versionTotal
  process.stdout.write(versionFolder + ': validated ' + versionTotal + ' unique examples across ' + counts.size + ' domains.\n')
}
assert.ok(total >= 10000, 'Expected at least 10,000 examples across versions')
process.stdout.write('Validated ' + total + ' unique examples across ' + versions.length + ' version(s).\n')
