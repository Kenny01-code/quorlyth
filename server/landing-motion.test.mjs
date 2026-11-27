import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('homepage keeps its editorial hero but does not mount decorative creator-character animations', async () => {
  const landing = await source('src/screens/Landing.tsx')

  assert.match(landing, /Make your community part of what comes next\./)
  assert.doesNotMatch(landing, /HeroCreator|PreviewCreator|CreatorMotion/)
  assert.doesNotMatch(landing, /creator-hero\.webp|creator-companion/)
})

test('homepage copy transitions respect the reduced-motion preference', async () => {
  const [landing, styles] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/styles/extra.css'),
  ])

  assert.match(landing, /function RotatingEditorialCopy/)
  assert.match(landing, /ROTATING_SUPPORT_COPY = \[HERO_COPY\.support, PREVIEW_COPY\.support\]/)
  assert.match(landing, /window\.setInterval/)
  assert.match(styles, /@keyframes qthEditorialWordReveal/)
  assert.match(styles, /prefers-reduced-motion:reduce[\s\S]*?\.qth-editorial-word/)
})
