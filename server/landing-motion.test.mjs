import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('homepage creator character animations are not mounted', async () => {
  const [landing, main] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/main.tsx'),
  ])

  assert.match(landing, /Make your community part of what comes next\./)
  assert.doesNotMatch(landing, /HeroCreator|PreviewCreator|CreatorMotion|creator-hero|creator-companion/)
  assert.doesNotMatch(main, /CreatorMotion|landing-motion\.css|creator-hero|creator-companion/)
})

test('the remaining editorial text reveal respects reduced-motion preferences', async () => {
  const [landing, styles] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/styles/extra.css'),
  ])

  assert.match(landing, /function EditorialReveal/)
  assert.match(landing, /qth-editorial-word/)
  assert.match(styles, /@keyframes qthEditorialWordReveal/)
  assert.match(styles, /prefers-reduced-motion:reduce[\s\S]*?\.qth-editorial-word/)
})

test('homepage copy remains present without creator character artwork', async () => {
  const landing = await source('src/screens/Landing.tsx')

  assert.match(landing, /Make your community part of what comes next\./)
  assert.match(landing, /Good ideas find their people\./)
  assert.doesNotMatch(landing, /<HeroCreator\s*\/>|<PreviewCreator\s*\/>/)
})
