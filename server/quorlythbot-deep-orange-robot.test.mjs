import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot robot uses the site orange palette across the 3D shell and head mark', async () => {
  const [themes, robot, head] = await Promise.all([
    source('src/bot/robot-themes.ts'),
    source('src/bot/robot3d.ts'),
    source('src/bot/QuorlythBotHead.tsx'),
  ])

  assert.match(themes, /p:\s*0xf97316/)
  assert.match(themes, /c:\s*0xc2410c/)
  assert.match(themes, /e:\s*0xc2410c/)
  assert.match(themes, /g1:\s*'#F97316'/)
  assert.match(themes, /g2:\s*'#C2410C'/)

  assert.match(robot, /color:0xf97316/)
  assert.match(robot, /emissive:0xc2410c/)
  assert.match(robot, /new DirectionalLight\(0xff7a18/)
  assert.doesNotMatch(robot, /0xc9562e|0xa64829|0x6f2b1a/)

  assert.match(head, /#F97316/)
  assert.match(head, /#C2410C/)
  assert.doesNotMatch(head, /#D06A40|#E1835C|#934127/)
})

test('QuorlythBot robot keeps its thicker proportions during idle animation', async () => {
  const robot = await source('src/bot/robot3d.ts')

  assert.match(robot, /sk\.scale\.set\(1\.1,1\.08,1\.08\)/)
  assert.match(robot, /tor\.scale\.set\(1\.72,1\.3,1\.02\)/)
  assert.match(robot, /tor\.scale\.set\(1\.72\+br\*\.018,1\.3\+br\*\.022,1\.02\)/)
  assert.match(robot, /SphereGeometry\(\.31,48,32\)/)
  assert.match(robot, /CylinderGeometry\(\.06,\.06,\.34,20\)/)
})
