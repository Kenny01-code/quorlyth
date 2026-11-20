import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('the landing page contains no 3D character or decorative object layers', async () => {
  const landing = await source('src/screens/Landing.tsx')
  const styles = await source('src/styles/landing-motion.css')
  assert.doesNotMatch(landing, /CreatorMotion|HeroCreator|PreviewCreator|qth-creator-stage|qth-creator-echo|<Orbit \/>/)
  assert.doesNotMatch(styles, /qth-creator|creator-hero/)
})

test('the landing hero remains responsive and preserves reduced-motion support', async () => {
  const styles = await source('src/styles/landing-motion.css')
  assert.match(styles, /\.hero h1\.hero-title/)
  assert.match(styles, /@media \(max-width: 760px\)/)
  assert.match(styles, /@media \(max-width: 460px\)/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(styles, /transition: none !important/)
})
