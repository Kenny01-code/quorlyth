import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('character motion enhances the existing Quorlyth hero without replacing its copy', async () => {
  const [landing, creator] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/components/CreatorMotion.tsx'),
  ])

  assert.match(landing, /Make your community part of what comes next\./)
  assert.match(landing, /<HeroCreator\s*\/>/)
  assert.match(landing, /<PreviewCreator\s*\/>/)
  assert.match(creator, /\/creator-hero\.webp/)
  assert.match(creator, /aria-hidden="true"/)
  assert.match(creator, /IntersectionObserver/)
})

test('landing character and card motion include responsive and reduced-motion fallbacks', async () => {
  const motion = await source('src/styles/landing-motion.css')
  assert.match(motion, /@keyframes qth-creator-drift/)
  assert.match(motion, /@keyframes qth-creator-orbit/)
  assert.match(motion, /@media \(max-width: 760px\)/)
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(motion, /animation: none !important/)
})

test('the generated character artwork is present as an optimized transparent web asset', async () => {
  const artwork = await stat(new URL('../public/creator-hero.webp', import.meta.url))
  assert.ok(artwork.size > 10000)
  assert.ok(artwork.size < 100000)
})
