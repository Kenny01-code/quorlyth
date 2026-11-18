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
  assert.match(screen, /An authorised workspace manager can review the deliverable while the AI service is unavailable\./)
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

test('Quorlyth AI is the final evidence decision-maker, with a manager override path', async () => {
  const [screen, edge] = await Promise.all([
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('supabase/functions/standalone-github/index.ts'),
  ])

  assert.match(screen, /review_evidence_ai/)
  assert.match(screen, /FINAL AI DECISION/)
  assert.match(screen, /artifact\.aiReview\.decision === 'approved' \? 'AI approved'/)
  assert.match(screen, /reviewSource: 'human'/)
  assert.match(screen, /artifact\.reviewSource === 'quorlyth_ai' \? 'Manager override'/)
  assert.match(screen, /decision === 'approved'/)
  assert.match(screen, /decision === 'changes_requested'/)

  const start = edge.indexOf('if (action === "review_evidence_ai")')
  const end = edge.indexOf('if (action === "save_ai_review")')
  assert.ok(start >= 0 && end > start, 'The server-side AI decision action must exist before the legacy pre-review action.')
  const finalAction = edge.slice(start, end)
  assert.match(finalAction, /fetch\(aiEndpoint/)
  assert.match(finalAction, /reviewedBy: "quorlyth-ai"/)
  assert.match(finalAction, /reviewSource: "quorlyth_ai"/)
  assert.match(finalAction, /status: decision/)
  assert.doesNotMatch(finalAction, /body\.aiReview/, 'The server must generate the verdict itself, not trust a browser-supplied decision.')
})
