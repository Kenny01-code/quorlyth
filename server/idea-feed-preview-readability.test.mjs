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


test('Project Pulse and evidence ledger keep black copy on light surfaces at every nesting level', async () => {
  const [workspace, hardening] = await Promise.all([
    source('src/screens/Collaborations.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  for (const copy of [
    'PROJECT PULSE',
    'Where things stand',
    'In progress',
    'Planned outcomes',
    'Approved complete',
    'Awaiting review',
    'Approved submissions',
    'Create your first outcome',
    'Break the idea into clear outcomes with owners, dates and acceptance criteria.',
    'Open plan',
    'Go to team room',
    'Files here are contributor-submitted evidence.',
  ]) {
    assert.ok(workspace.includes(copy), 'Missing workspace copy: ' + copy)
  }

  assert.ok(hardening.includes('.ql-workspace-pulse :where(*)'))
  assert.ok(hardening.includes('#root #main .ql-evidence-ledger {'))
  assert.ok(hardening.includes('.ql-evidence-ledger :where(*):not(input):not(textarea):not(select):not(option)'))
  assert.ok(hardening.includes('background: linear-gradient(145deg, #fffdf8 0%, #f3eadc 100%) !important'))
  assert.ok(hardening.includes('.ql-evidence-ledger .acts .btn.p'))
  assert.ok(hardening.includes('.ql-evidence-file__copy small'))
})


test('Idea Feed preview forces true black through every nested write-up and metadata node', async () => {
  const [card, hardening, main] = await Promise.all([
    source('src/components/IdeaCard.tsx'),
    source('src/styles/contrast-hardening.css'),
    source('src/main.tsx'),
  ])

  for (const requiredClass of [
    'idea-feed-card',
    'idea-card-title',
    'idea-feed-writeup',
    'idea-media-name',
    'idea-media-state',
    'idea-media-more',
  ]) {
    assert.ok(card.includes(requiredClass), 'Missing Idea Feed preview element: ' + requiredClass)
  }

  assert.ok(card.includes("const previewBody = body.length > 240 ? body.slice(0, 240).trimEnd() + '…' : body"))
  assert.ok(main.indexOf("import './styles/contrast-hardening.css'") > main.indexOf("import './styles/contrast-system.css'"))

  assert.ok(hardening.includes('/* IDEA FEED PREVIEW: final black-ink contract. */'))
  assert.ok(hardening.includes('#root .idea-feed-card :where(*)'))
  assert.ok(hardening.includes('-webkit-text-fill-color: #000000 !important'))
  assert.ok(hardening.includes('#root .idea-feed-card .idea-feed-writeup'))
  assert.ok(hardening.includes('font-size: 15px !important'))
  assert.ok(hardening.includes('#root .idea-feed-card .f :where(*)'))
  assert.ok(hardening.includes('#root .idea-feed-card :is(.idea-media-name, .idea-media-state, .idea-media-more)'))
  assert.ok(hardening.includes('#root .idea-feed-card:focus-visible'))
})


test('Promotion studio live post placeholder stays black on its light preview surface', async () => {
  const [screen, styles] = await Promise.all([
    source('src/screens/Promote.tsx'),
    source('src/styles/promotion-studio.css'),
  ])

  assert.ok(screen.includes("Your post preview will appear here as you write."))
  assert.ok(screen.includes("q-writeup q-promo-preview-placeholder"))
  assert.ok(screen.includes("import '../styles/promotion-studio.css'"))

  assert.ok(styles.includes('#root #main .q-promo-live-preview .q-promo-preview-copy > .q-writeup'))
  assert.ok(styles.includes('.q-promo-preview-placeholder'))
  assert.ok(styles.includes('color: #000000 !important'))
  assert.ok(styles.includes('-webkit-text-fill-color: #000000 !important'))
  assert.ok(styles.includes('font-size: 14.5px !important'))
  assert.ok(styles.includes('font-weight: 500 !important'))
})
