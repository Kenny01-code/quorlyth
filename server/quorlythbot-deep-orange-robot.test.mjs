import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot keeps its original dark face and uses deeper shades of the site orange', async () => {
  const [themes, robot, head, styles] = await Promise.all([
    source('src/bot/robot-themes.ts'),
    source('src/bot/robot3d.ts'),
    source('src/bot/QuorlythBotHead.tsx'),
    source('src/styles/app.css'),
  ])

  assert.match(themes, /p:\s*0xea580c/)
  assert.match(themes, /b:\s*0x211a17/)
  assert.match(themes, /c:\s*0xc2410c/)
  assert.match(themes, /e:\s*0x9a3412/)
  assert.match(themes, /g1:\s*'#EA580C'/)
  assert.match(themes, /g2:\s*'#9A3412'/)

  assert.match(robot, /color:0xea580c/)
  assert.match(robot, /emissive:0x9a3412/)
  assert.match(robot, /new DirectionalLight\(0xc2410c/)
  assert.match(robot, /color:0xf97316/)
  assert.doesNotMatch(robot, /0xffcf86|0xffb15c|0xc9562e|0x6f2b1a/)

  assert.match(head, /#EA580C/)
  assert.match(head, /#C2410C/)
  assert.match(head, /#9A3412/)
  assert.match(head, /#F97316/)
  assert.doesNotMatch(head, /#FB923C|#FFB15C|#FFD1A6|#FFE1B8|#FFF0D8/)

  assert.match(styles, /rgba\(234,88,12,\.38\)/)
})

test('QuorlythBot has a visibly thicker build without changing its familiar design', async () => {
  const robot = await source('src/bot/robot3d.ts')

  assert.match(robot, /sk\.scale\.set\(1\.1,1\.12,1\.04\)/)
  assert.match(robot, /tor\.scale\.set\(1\.72,1\.32,1\.02\)/)
  assert.match(robot, /tor\.scale\.set\(1\.72\+br\*\.018,1\.32\+br\*\.022,1\.02\)/)
  assert.match(robot, /SphereGeometry\(\.32,48,32\)/)
  assert.match(robot, /CylinderGeometry\(\.06,\.06,\.35,20\)/)
})
