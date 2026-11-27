import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('individual Community Space cover uses the lazy burnt-orange Three.js artwork', async () => {
  const [screen, component, scene, styles] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/components/CommunityCoverStage.tsx'),
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/community-cover-three.css'),
  ])

  assert.match(screen, /import '\.\.\/styles\/community-cover-three\.css'/)
  assert.match(screen, /import \{ CommunityCoverStage \} from '\.\.\/components\/CommunityCoverStage'/)
  assert.match(screen, /big && <CommunityCoverStage \/>/)
  assert.match(screen, /ccv--space-cover/)
  assert.match(component, /IntersectionObserver/)
  assert.match(component, /requestIdleCallback/)
  assert.match(component, /import\('\.\/creatorCoverScene'\)/)
  assert.match(scene, /new Color\(0x9e4327\)/)
  assert.match(scene, /new TorusKnotGeometry/)
  assert.match(scene, /renderer\.dispose\(\)/)
  assert.match(styles, /ccv-space-cover__scene/)
  assert.match(styles, /#f3a17c/)
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(styles, /@media \(max-width: 760px\)/)
})
