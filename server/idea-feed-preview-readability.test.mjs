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


test('Community discovery headline and supporting copy stay true black and readable', async () => {
  const [communities, styles, main] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/styles/precision-contrast-polish.css'),
    source('src/main.tsx'),
  ])

  assert.ok(communities.includes('Find your people.'))
  assert.ok(communities.includes('community-explorer__title'))
  assert.ok(styles.includes('#root #main .community-explorer__title'))
  assert.ok(styles.includes('color: #000000 !important'))
  assert.ok(styles.includes('font-weight: 650 !important'))
  assert.ok(styles.includes('#root #main .community-explorer__subtitle'))
  assert.ok(main.includes("import './styles/precision-contrast-polish.css'"))
  assert.ok(main.indexOf("import './styles/precision-contrast-polish.css'") > main.indexOf("import './styles/contrast-hardening.css'"))
})

test('Project task assignment and due-date controls use clear black ink on a light form surface', async () => {
  const [workspace, styles, main] = await Promise.all([
    source('src/screens/StandaloneWorkspaces.tsx'),
    source('src/styles/precision-contrast-polish.css'),
    source('src/main.tsx'),
  ])

  for (const label of [
    'Assign to everyone you select',
    'Select everyone (',
    'Clear selection',
    'Due date',
    'type="date"',
    'taskAssigneeDraft.includes(member.userId)',
  ]) {
    assert.ok(workspace.includes(label), 'Missing task assignment/date control: ' + label)
  }

  assert.ok(styles.includes('#root #main .sw-task-form :where(*)'))
  assert.ok(styles.includes('background:') && styles.includes('#fffdf8 0%, #f4ecdf 100%'))
  assert.ok(styles.includes('.sw-assignee-picker__actions .sw-link-button'))
  assert.ok(styles.includes('.sw-assignee-option > span small'))
  assert.ok(styles.includes('::-webkit-datetime-edit-month-field'))
  assert.ok(styles.includes('::-webkit-calendar-picker-indicator'))
  assert.ok(styles.includes('@media (max-width: 720px)'))
  assert.ok(styles.includes('@media (max-width: 390px)'))
  assert.ok(main.indexOf("import './styles/precision-contrast-polish.css'") > main.indexOf("import './styles/contrast-hardening.css'"))
})

test('Calendar glyphs and native calendar controls remain visible across light and dark surfaces', async () => {
  const styles = await source('src/styles/precision-contrast-polish.css')
  assert.ok(styles.includes('#root #main .q-glyph-calendar'))
  assert.ok(styles.includes('color: #ff9b62 !important'))
  assert.ok(styles.includes('.sw-task-form) .q-glyph-calendar'))
  assert.ok(styles.includes('color: #9d3a10 !important'))
  assert.ok(styles.includes('#root #main input[type="date"]::-webkit-calendar-picker-indicator'))
  assert.ok(styles.includes('opacity: 1 !important'))
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


test('milestone bulk assignee actions use black text in create, edit, and per-milestone reassign controls', async () => {
  const [board, styles, sharedStyles, main] = await Promise.all([
    source('src/components/MilestoneBoard.tsx'),
    source('src/styles/precision-contrast-polish.css'),
    source('src/styles/standalone-workspaces.css'),
    source('src/main.tsx'),
  ])

  assert.ok(board.includes('Select everyone ({people.length})'))
  assert.ok(board.includes('Clear selection'))
  assert.ok(board.includes('onClick={() => void changeAssignees(milestone, people.map(person => person.id))}'))
  assert.ok(board.includes('onClick={() => void changeAssignees(milestone, [])}'))
  assert.ok(board.includes('className="ql-assignee-picker__actions"'))
  assert.ok(board.includes("WebkitTextFillColor: '#000000'"))
  assert.ok(board.includes("background: '#fffdf8'"))
  assert.ok(board.includes("background: '#f0e7da'"))
  assert.ok(board.includes('className={"ql-assignee-option" + (selected ? " is-selected" : "")}'))
  assert.ok(board.includes('className={"ql-assignee-option" + (checked ? " is-selected" : "")}'))
  assert.ok(sharedStyles.includes('#root .ql-assignee-option.is-selected'))
  assert.ok(sharedStyles.includes('background: #FBE5D7'))
  assert.ok(sharedStyles.includes('#root .ql-assignee-option > input[type="checkbox"]:checked::after'))
  assert.ok(sharedStyles.includes('left: 50%'))
  assert.ok(sharedStyles.includes('top: 50%'))
  assert.ok(sharedStyles.includes('transform: translate(-50%, -50%) rotate(45deg)'))
  assert.ok(board.includes("{person.name}{person.id === a.me?.id ? ' (you)' : ''}"))
  assert.ok(board.includes('className="ql-quiet-action ql-milestone-assignee-action"'))

  assert.ok(styles.includes('#root #main .ql-milestone-board .ql-assignee-picker__actions .ql-quiet-action'))
  assert.ok(styles.includes('color: #000000 !important'))
  assert.ok(styles.includes('-webkit-text-fill-color: #000000 !important'))
  assert.ok(styles.includes('background: #fffdf8 !important'))
  assert.ok(styles.includes('.ql-assignee-picker__actions .ql-quiet-action:hover:not(:disabled)'))
  assert.ok(styles.includes('.ql-assignee-picker__actions .ql-quiet-action:disabled'))
  assert.ok(styles.includes('@media (max-width: 560px)'))
  assert.ok(main.indexOf("import './styles/precision-contrast-polish.css'") > main.indexOf("import './styles/contrast-hardening.css'"))
})

test('milestone creation renders black bulk actions and black teammate names directly in the form', async () => {
  const [board, styles, sharedStyles] = await Promise.all([
    source('src/components/MilestoneBoard.tsx'),
    source('src/styles/precision-contrast-polish.css'),
    source('src/styles/standalone-workspaces.css'),
  ])

  for (const text of ['Select everyone ({people.length})', 'Clear selection', '(you)']) {
    assert.ok(board.includes(text), 'Missing milestone assignee text: ' + text)
  }
  assert.ok(board.includes("style={{ color: '#000000', WebkitTextFillColor: '#000000'"))
  assert.ok(board.includes("background: '#fffdf8'"))
  assert.ok(board.includes("background: '#f0e7da'"))
  assert.ok(board.includes("color: '#000000', WebkitTextFillColor: '#000000', fontWeight: 700"))
  assert.ok(board.includes('className={"ql-assignee-option" + (selected ? " is-selected" : "")}'))
  assert.ok(board.includes('className={"ql-assignee-option" + (checked ? " is-selected" : "")}'))
  assert.ok(sharedStyles.includes('#root .ql-assignee-option.is-selected'))
  assert.ok(sharedStyles.includes('background: #FBE5D7'))
  assert.ok(sharedStyles.includes('#root .ql-assignee-option > input[type="checkbox"]:checked::after'))
  assert.ok(sharedStyles.includes('left: 50%'))
  assert.ok(sharedStyles.includes('top: 50%'))
  assert.ok(sharedStyles.includes('transform: translate(-50%, -50%) rotate(45deg)'))
  assert.ok(styles.includes('#root .ql-milestone-board .ql-assignee-picker__list .ql-assignee-option > span'))
  assert.ok(styles.includes('#root .ql-milestone-board .ql-assignee-picker__actions .ql-milestone-assignee-action'))
})


test('idea discussion author names use clear black ink on a light, keyboard-accessible name surface', async () => {
  const [page, styles, main] = await Promise.all([
    source('src/screens/IdeaPage.tsx'),
    source('src/styles/idea-discussion-author.css'),
    source('src/main.tsx'),
  ])

  assert.ok(page.includes('className="idea-discussion-comment"'))
  assert.ok(page.includes('className="lk idea-discussion-author"'))
  assert.ok(page.includes('{a.nm(comment.authorId)}'), 'Discussion author names must remain dynamically sourced for every member')
  assert.ok(styles.includes('#root .idea-discussion-comment .idea-discussion-author'))
  assert.ok(styles.includes('color: #000000 !important'))
  assert.ok(styles.includes('-webkit-text-fill-color: #000000 !important'))
  assert.ok(styles.includes('background: linear-gradient(145deg, #fffefa 0%, #f2e8db 100%) !important'))
  assert.ok(styles.includes(':focus-visible'))
  assert.ok(main.includes("import './styles/idea-discussion-author.css'"))
  assert.ok(main.indexOf("import './styles/idea-discussion-author.css'") > main.indexOf("import './styles/precision-contrast-polish.css'"))
})
