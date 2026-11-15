import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('community idea feed previews keep write-ups legible and preserve useful copy', async () => {
  const [card, contrast] = await Promise.all([
    source('src/components/IdeaCard.tsx'),
    source('src/styles/contrast-system.css'),
  ])

  assert.match(card, /idea-feed-card/)
  assert.match(card, /const body = idea\.body \|\| ''/)
  assert.match(card, /body\.length > 240 \? body\.slice\(0, 240\)\.trimEnd\(\) \+ '…' : body/)
  assert.ok(card.includes('<p className="q-writeup idea-feed-writeup">{previewBody}</p>'))
  assert.doesNotMatch(card, /\.slice\(0, 140\)/)
  assert.match(card, /fontWeight: 500/)

  assert.match(contrast, /#root #main \.idea-feed-card/)
  assert.match(contrast, /\.idea-feed-card \.idea-card-title,[\s\S]*?\.idea-feed-card \.idea-feed-writeup/)
  assert.match(contrast, /color: #000000 !important/)
  assert.match(contrast, /font-size: 14px !important/)
  assert.match(contrast, /line-height: 1\.7 !important/)
  assert.match(contrast, /white-space: pre-wrap !important/)
  assert.match(contrast, /display: block;[\\s\\S]*?overflow: visible;/)
  assert.doesNotMatch(contrast, /-webkit-line-clamp: 6/)
})
