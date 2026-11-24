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
  assert.match(creator, /creator-companion-01\.svg/)
  assert.match(creator, /creator-companion-02\.svg/)
  assert.match(creator, /qth-character--left/)
  assert.match(creator, /qth-character--middle/)
  assert.match(creator, /aria-hidden="true"/)
  assert.match(creator, /IntersectionObserver/)
})

test('landing character and card motion include responsive and reduced-motion fallbacks', async () => {
  const motion = await source('src/styles/landing-motion.css')
  assert.match(motion, /@keyframes qth-creator-drift/)
  assert.match(motion, /@keyframes qth-creator-orbit/)
  assert.match(motion, /@keyframes qth-character-float/)
  assert.match(motion, /qth-character--middle/)
  assert.match(motion, /@media \(max-width: 760px\)/)
  assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(motion, /animation: none !important/)
})

test('the character artwork is present as optimized transparent web assets', async () => {
  const [lead, companionOne, companionTwo] = await Promise.all([
    stat(new URL('../public/creator-hero.webp', import.meta.url)),
    stat(new URL('../public/creator-companion-01.svg', import.meta.url)),
    stat(new URL('../public/creator-companion-02.svg', import.meta.url)),
  ])
  assert.ok(lead.size > 10000 && lead.size < 100000)
  assert.ok(companionOne.size > 1000 && companionOne.size < 20000)
  assert.ok(companionTwo.size > 1000 && companionTwo.size < 20000)
})
