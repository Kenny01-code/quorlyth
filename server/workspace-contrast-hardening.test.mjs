import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Idea Feed previews retain full excerpts and hard true-black typography', async () => {
  const [card, main, hardening] = await Promise.all([
    source('src/components/IdeaCard.tsx'),
    source('src/main.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  assert.ok(card.includes('idea-feed-card'), 'Idea Feed card must have its own styling scope')
  assert.ok(card.includes('idea-feed-writeup'), 'Idea Feed copy must not depend on global muted text')
  assert.ok(card.includes('previewBody'), 'Idea Feed must use the full readable excerpt')
  assert.ok(main.includes("import './styles/contrast-hardening.css'"), 'Final contrast layer must be imported')
  assert.ok(hardening.includes('#root #main .idea-feed-card .idea-feed-writeup'))
  assert.ok(hardening.includes('-webkit-text-fill-color: #000000 !important'))
  assert.ok(hardening.includes('white-space: pre-wrap !important'))
  assert.ok(hardening.includes('overflow-wrap: anywhere !important'))
})

test('Project Pulse labels, write-ups, and actions stay black on light surfaces', async () => {
  const [workspace, hardening] = await Promise.all([
    source('src/screens/Collaborations.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  for (const copy of [
    'PROJECT PULSE',
    'Where things stand',
    'Planned outcomes',
    'Approved complete',
    'Awaiting review',
    'Approved submissions',
    'Create your first outcome',
    'Break the idea into clear outcomes with owners, dates and acceptance criteria.',
  ]) {
    assert.ok(workspace.includes(copy), 'Missing Project Pulse copy: ' + copy)
  }

  assert.ok(hardening.includes('#root #main .ql-workspace-pulse'))
  assert.ok(hardening.includes('.ql-workspace-stat-grid strong'))
  assert.ok(hardening.includes('.ql-workspace-stat-grid span'))
  assert.ok(hardening.includes('.ql-workspace-next p'))
  assert.ok(hardening.includes('.ql-workspace-pulse .ql-primary-action'))
  assert.ok(hardening.includes('color: #000000 !important'))
})

test('evidence disclaimer and contributor write-ups have dark, readable contrast', async () => {
  const [workspace, hardening] = await Promise.all([
    source('src/screens/Collaborations.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  assert.ok(workspace.includes('Files here are contributor-submitted evidence.'))
  assert.ok(workspace.includes('They are not labelled source-verified unless a connected provider confirms their origin.'))
  assert.ok(workspace.includes('A reviewer must still check them against the milestone criteria.'))
  assert.ok(hardening.includes('.ql-evidence-ledger__notice p'))
  assert.ok(hardening.includes('.ql-evidence-record__summary'))
  assert.ok(hardening.includes('.ql-evidence-review-note'))
  assert.ok(hardening.includes('.ql-evidence-file__copy'))
  assert.ok(hardening.includes('-webkit-text-fill-color: #000000 !important'))
})
