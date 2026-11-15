import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('idea feed previews use independent true-black typography and show complete excerpts', async () => {
  const [card, main, hardening] = await Promise.all([
    source('src/components/IdeaCard.tsx'),
    source('src/main.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  assert.ok(card.includes('idea-feed-card'))
  assert.ok(card.includes("const body = idea.body || ''"))
  assert.ok(card.includes("const previewBody = body.length > 240 ? body.slice(0, 240).trimEnd() + '…' : body"))
  assert.ok(card.includes('<p className="idea-feed-writeup"'))
  assert.ok(card.includes("color: '#000000'"))
  assert.ok(!card.includes('q-writeup idea-feed-writeup'))
  assert.ok(!card.includes('.slice(0, 140)'))

  assert.ok(main.indexOf("import './styles/contrast-hardening.css'") > main.indexOf("import './styles/site-motion-polish.css'"))
  assert.ok(hardening.includes('#root #main .idea-feed-card .idea-feed-writeup'))
  assert.ok(hardening.includes('color: #000000 !important'))
  assert.ok(hardening.includes('white-space: pre-wrap !important'))
  assert.ok(hardening.includes('overflow: visible !important'))
})

test('all milestone filter states use black text, icons and count labels', async () => {
  const [board, hardening] = await Promise.all([
    source('src/components/MilestoneBoard.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  for (const label of ['All milestones', 'Open', 'Assigned to me', 'Overdue', 'Blocked']) {
    assert.ok(board.includes("label: '" + label + "'"), 'Missing milestone filter: ' + label)
  }

  assert.ok(hardening.includes('.ql-milestone-board .ql-milestone-filters button.ql-filter'))
  assert.ok(hardening.includes('button.ql-filter.is-active'))
  assert.ok(hardening.includes('button.ql-filter :is(svg, .quorlyth-glyph, span)'))
  assert.ok(hardening.includes('button.ql-filter > span'))
  assert.ok(hardening.includes('color: #000000 !important'))
  assert.ok(hardening.includes('background: #f4ecdf !important'))
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
