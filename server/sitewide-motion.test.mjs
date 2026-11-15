import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Quorlyth applies consistent sitewide motion and semantic icon microinteractions', async () => {
  const [entry, glyph, motion] = await Promise.all([
    source('src/main.tsx'),
    source('src/components/QuorlythGlyph.tsx'),
    source('src/styles/site-motion-polish.css'),
  ])

  assert.ok(entry.indexOf("import './styles/site-motion-polish.css'") > entry.indexOf("import './styles/contrast-system.css'"))
  assert.match(glyph, /'qth-glyph',\s*'q-glyph-' \+ name/)
  assert.match(motion, /@keyframes qth-card-in/)
  assert.match(motion, /@keyframes qth-overlay-in/)
  assert.match(motion, /@keyframes qth-icon-ring/)
  assert.match(motion, /\.qth-glyph:not\(\.q-logo-mark\)[\s\S]*?animation: qth-icon-arrive/)
  assert.match(motion, /q-glyph-bell/)
  assert.match(motion, /q-glyph-search/)
  assert.match(motion, /q-glyph-settings/)
  assert.match(motion, /q-glyph-arrow/)
  assert.match(motion, /:hover,:focus-visible/)
  assert.match(motion, /\[aria-busy="true"\]/)
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(motion, /animation-duration:\s*\.01ms !important/)
  assert.match(motion, /transform:\s*none !important/)
  const iconEntrySection = motion.slice(motion.indexOf('/* Icons enter'), motion.indexOf('/* Every control'))
  assert.match(iconEntrySection, /animation: qth-icon-arrive 300ms/)
  assert.doesNotMatch(iconEntrySection, /infinite/)
})
