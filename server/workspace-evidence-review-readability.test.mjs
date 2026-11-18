import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('workspace evidence keeps contributor-submitted provenance distinct from GitHub verification', async () => {
  const [screen, styles] = await Promise.all([
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('src/styles/standalone-workspaces.css'),
  ])

  assert.match(screen, /Contributor-submitted evidence · not source-verified/)
  assert.match(screen, /is-contributor-submitted/)
  assert.match(screen, /artifact\.provider === 'github' \? 'check' : 'link'/)
  assert.match(screen, /GitHub API confirmed this source/)
  assert.match(styles, /\.sw-source-confirmation\.is-contributor-submitted/)
  assert.match(styles, /\.sw-source-confirmation__preview/)
})

test('an unavailable automatic alignment review is not presented as a zero score', async () => {
  const [screen, styles] = await Promise.all([
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('src/styles/standalone-workspaces.css'),
  ])

  assert.match(screen, /Review unavailable/)
  assert.match(screen, /artifact\.aiReview\.status === 'unavailable' \? 'Not scored'/)
  assert.match(screen, /GAPS TO CHECK/)
  assert.match(screen, /SUGGESTED NEXT ACTIONS/)
  assert.match(screen, /artifact\.aiReview\.scopeNote/)
  assert.match(screen, /A workspace reviewer should compare the actual deliverable against the task definition of done\./)
  assert.match(styles, /\.sw-ai-evidence-review__result\.status-unavailable/)
  assert.match(styles, /\.sw-ai-evidence-review__scope/)
})

test('the website submission preview remains in Quorlyth with clear, responsive reviewer styling', async () => {
  const [screen, preview, styles] = await Promise.all([
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('src/components/EvidencePreview.tsx'),
    source('src/styles/standalone-workspaces.css'),
  ])

  assert.match(screen, /<EvidencePreview url=\{artifact\.url\}/)
  assert.match(preview, /Website preview stays inside Quorlyth/)
  assert.match(preview, /Preview in Quorlyth/)
  assert.match(styles, /\.sw-artifact \.ql-evidence-preview/)
  assert.match(styles, /\.sw-artifact \.ql-evidence-preview__open/)
  assert.match(styles, /@media\(max-width:620px\)/)
})
