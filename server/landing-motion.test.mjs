import test from 'node:test'
import assert from 'node:assert/strict'
import { stat, readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('the previous single-character artwork is removed from the landing page and preview', async () => {
  const [landing, motion] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/styles/landing-motion.css'),
  ])

  assert.match(landing, /Make your community part of what comes next\./)
  assert.doesNotMatch(landing, /CreatorMotion|HeroCreator|PreviewCreator|creator-hero\.webp/)
  assert.doesNotMatch(motion, /qth-creator-/)
  await assert.rejects(stat(new URL('../src/components/CreatorMotion.tsx', import.meta.url)))
  await assert.rejects(stat(new URL('../public/creator-hero.webp', import.meta.url)))
})

test('the existing journey-card motion keeps its responsive reduced-motion fallback', async () => {
  const motion = await source('src/styles/landing-motion.css')
  assert.match(motion, /qth-motion-card/)
  assert.match(motion, /@media \(hover:hover\)/)
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(motion, /transition: none !important/)
})
