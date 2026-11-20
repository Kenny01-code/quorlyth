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

  assert.match(screen, /Decision unavailable/)
  assert.match(screen, /artifact\.aiReview\.status === 'unavailable' \? 'Not scored'/)
  assert.match(screen, /GAPS TO CHECK/)
  assert.match(screen, /SUGGESTED NEXT ACTIONS/)
  assert.match(screen, /artifact\.aiReview\.scopeNote/)
  assert.match(screen, /An authorised workspace manager can review the deliverable and make the decision while the AI service is unavailable\./)
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
  assert.match(edge, /Browser-supplied AI pre-reviews are no longer accepted/)
})

test('task start belongs to the task creator, community owner or workspace manager', async () => {
  const screen = await source('src/screens/StandaloneWorkspaces.tsx')
  const edge = await source('supabase/functions/standalone-github/index.ts')

  assert.match(screen, /const canManageTask = \(task\?: WorkspaceTask\) => .*task\.createdBy === a\.me\.id/)
  assert.match(screen, /Only the task creator, community owner, or workspace manager can start this task/)
  assert.match(screen, /startedBy: a\.me!\.id/)
  assert.match(screen, /selectedEvidenceTask\.status === 'in_progress'/)
  assert.match(edge, /task\.data\.status !== "in_progress"/)
  assert.match(edge, /The task must be started by its creator, community owner, or workspace manager/)
})

test('contributors retain separate evidence records with visible live AI screening', async () => {
  const screen = await source('src/screens/StandaloneWorkspaces.tsx')
  const edge = await source('supabase/functions/standalone-github/index.ts')

  assert.match(screen, /id: artifactId, projectId: id, taskId: artifactTask, provider: 'manual'/)
  assert.match(screen, /status: 'screening'/)
  assert.match(screen, /LIVE AI SCREENING/)
  assert.match(screen, /AI screening…/)
  assert.match(screen, /Each contributor gets a separate evidence record and independent AI decision/)
  assert.match(edge, /latestByContributor/)
  assert.match(edge, /artifact\.submittedBy/)
})

test('project closeout compares approved submissions and saves the server-validated AI ranking', async () => {
  const [screen, edge, styles] = await Promise.all([
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('supabase/functions/standalone-github/index.ts'),
    source('src/styles/standalone-workspaces.css'),
  ])

  assert.match(screen, /Mark project complete/)
  assert.match(screen, /finalize_project_ai/)
  assert.match(screen, /FINAL AI PROJECT REVIEW/)
  assert.match(screen, /Overall standout contributor/)
  assert.match(screen, /taskResults\.map\(result/)
  assert.doesNotMatch(screen, /async function completeTask/)
  assert.doesNotMatch(screen, /async function toggleProjectStatus/)

  const start = edge.indexOf('if (action === "finalize_project_ai")')
  const end = edge.indexOf('if (action === "verify_artifact")', start)
  assert.ok(start >= 0 && end > start, 'Final project evaluation must be a separate server action.')
  const finalAction = edge.slice(start, end)
  assert.match(finalAction, /Only the project owner, workspace manager, or linked community owner/)
  assert.match(finalAction, /latestByContributor/)
  assert.match(finalAction, /artifact\.status === "approved"/)
  assert.match(finalAction, /Number\(artifact\.reviewedAt\).*Number\(task\.updatedAt\)/)
  assert.match(finalAction, /selectedEvidenceId/)
  assert.match(screen, /Number\(artifact\.reviewedAt\) > lastTaskChange/)
  assert.match(finalAction, /finalize_standalone_project_with_ai_review/)
  assert.match(finalAction, /serviceClient\.rpc/)
  assert.match(finalAction, /The project remains open/)
  assert.match(styles, /\.sw-finalization-panel/)
  assert.match(styles, /\.sw-final-review-panel__results/)
})

test('the evidence viewer traps keyboard focus and restores it when closed', async () => {
  const preview = await source('src/components/EvidencePreview.tsx')
  assert.match(preview, /viewerCloseRef\.current\?\.focus\(\)/)
  assert.match(preview, /event\.key !== 'Tab'/)
  assert.match(preview, /if \(previous\?\.isConnected\) previous\.focus\(\)/)
  assert.match(preview, /aria-modal="true"/)
})

test('evidence review is hosted in a stable body portal with a viewport-level blurred backdrop', async () => {
  const [preview, app, styles] = await Promise.all([
    source('src/components/EvidencePreview.tsx'),
    source('src/App.tsx'),
    source('src/styles/evidence-preview.css'),
  ])
  assert.match(preview, /EVIDENCE_PREVIEW_EVENT/)
  assert.match(preview, /export function EvidencePreviewHost/)
  assert.match(preview, /createPortal\([\s\S]*document\.body/)
  assert.match(preview, /viewerPanelRef/)
  assert.match(app, /<EvidencePreviewHost\s*\/>/)
  assert.match(styles, /z-index:\s*2147483000/)
  assert.match(styles, /backdrop-filter:\s*blur\(28px\)/)
  assert.doesNotMatch(preview.slice(preview.indexOf('export function EvidencePreview('), preview.indexOf('export function EvidencePreviewHost')), /viewerOpen/)
})

test('the landing page no longer renders decorative 3D character layers', async () => {
  const landing = await source('src/screens/Landing.tsx')
  assert.doesNotMatch(landing, /CreatorMotion|HeroCreator|PreviewCreator/)
})
