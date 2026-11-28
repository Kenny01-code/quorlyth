import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('individual Community Space covers load the selected burnt-orange Three.js style', async () => {
  const [screen, component, scene, styles] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/components/CommunityCoverStage.tsx'),
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/community-cover-three.css'),
  ])

  assert.ok(screen.includes("import '../styles/community-cover-three.css'"))
  assert.ok(screen.includes("import { CommunityCoverStage } from '../components/CommunityCoverStage'"))
  assert.ok(screen.includes("<CommunityCoverStage coverStyle={c.cover || 'a'} />"))
  assert.ok(screen.includes("key: 'a'") && screen.includes("key: 'h'"))
  assert.ok(screen.includes('CoverStylePicker'))
  assert.ok(screen.includes('ccv--space-cover'))
  assert.ok(component.includes('IntersectionObserver'))
  assert.ok(component.includes('requestIdleCallback'))
  assert.ok(component.includes("import('./creatorCoverScene')"))
  assert.ok(component.includes('mountCreatorCoverScene(surface, element, coverStyle)'))
  assert.ok(component.includes('}, [coverStyle])'))
  assert.ok(scene.includes('new Color(0x9e4327)'))
  assert.ok(scene.includes('new TorusKnotGeometry'))
  assert.ok(scene.includes("activeStyle === 'b'"))
  assert.ok(scene.includes("activeStyle === 'c'"))
  assert.ok(scene.includes("activeStyle === 'd'"))
  assert.ok(scene.includes("activeStyle === 'e'"))
  assert.ok(scene.includes("activeStyle === 'f'"))
  assert.ok(scene.includes("activeStyle === 'g'"))
  assert.ok(scene.includes("activeStyle === 'h'"))
  assert.ok(scene.includes('renderer.dispose()'))
  assert.ok(styles.includes('ccv-space-cover__scene'))
  assert.ok(styles.includes('#f3a17c'))
  assert.ok(styles.includes('cover-option__check'))
  assert.ok(styles.includes('prefers-reduced-motion: reduce'))
  assert.ok(styles.includes('max-width: 760px'))
})
