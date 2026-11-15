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

  assert.match(card, /idea-feed-card/)
  assert.match(card, /const body = idea\\.body \\|\\| ''/)
  assert.match(card, /body\\.length > 240 \\? body\\.slice\\(0, 240\\)\\.trimEnd\\(\\) \\+ '…' : body/)
  assert.ok(card.includes('<p className="idea-feed-writeup" style={{ color: \'#000000\' }}>{previewBody}</p>'))
  assert.doesNotMatch(card, /q-writeup idea-feed-writeup/)
  assert.doesNotMatch(card, /\\.slice\\(0, 140\\)/)

  assert.ok(main.indexOf("import './styles/contrast-hardening.css'") > main.indexOf("import './styles/site-motion-polish.css'"))
  assert.match(hardening, /#root #main \\.idea-feed-card \\.idea-feed-writeup/)
  assert.match(hardening, /color: #000000 !important/)
  assert.match(hardening, /white-space: pre-wrap !important/)
  assert.match(hardening, /overflow: visible !important/)
})

test('all milestone filter states use black text, icons and count labels', async () => {
  const [board, hardening] = await Promise.all([
    source('src/components/MilestoneBoard.tsx'),
    source('src/styles/contrast-hardening.css'),
  ])

  for (const label of ['All milestones', 'Open', 'Assigned to me', 'Overdue', 'Blocked']) {
    assert.ok(board.includes("label: '" + label + "'"), 'Missing milestone filter: ' + label)
  }

  assert.match(hardening, /\.ql-milestone-board \.ql-milestone-filters button\.ql-filter/)
  assert.match(hardening, /\.ql-milestone-filters button\.ql-filter\.is-active/)
  assert.match(hardening, /\.ql-milestone-filters button\.ql-filter :is\(svg, \.quorlyth-glyph, span\)/)
  assert.match(hardening, /\.ql-milestone-filters button\.ql-filter > span/)
  assert.match(hardening, /color: #000000 !important/)
  assert.match(hardening, /background: #f4ecdf !important/)
})
