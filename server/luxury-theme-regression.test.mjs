import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('warm editorial palette is loaded after the existing page themes and stays outside QuorlythBot', async () => {
  const [entry, theme] = await Promise.all([
    source('src/main.tsx'),
    source('src/styles/luxury-light-system.css'),
  ])
  assert.ok(entry.indexOf("import './styles/luxury-light-system.css'") > entry.indexOf("import './styles/request-access-editorial.css'"))
  assert.match(theme, /--q-lux-page:\s*#f5f1e9/)
  assert.match(theme, /--q-lux-orange:\s*#bf5532/)
  assert.match(theme, /--q-lux-bone:\s*#efe7dc/)
  assert.match(theme, /#nav\.nav-item\.on/)
  assert.match(theme, /#root #main \.q-writeup/)
  assert.match(theme, /overflow-wrap:\s*anywhere/)
  assert.doesNotMatch(theme, /#bot|qbot-premium|qbot-conversation/)
})

test('sign-in robot uses the dedicated burnished-orange material preset', async () => {
  const [screen, style, robot, presets] = await Promise.all([
    source('src/screens/SignIn.tsx'),
    source('src/styles/signin-luxury.css'),
    source('src/bot/robot3d.ts'),
    source('src/bot/robot-themes.ts'),
  ])
  assert.match(screen, /<Robot ref=\{r\} defer theme="burnished"/)
  assert.match(style, /linear-gradient\(145deg, #fffefa 0%, #f7f0e7 52%, #efe5d8 100%\)/)
  assert.match(style, /#b54c2b/)
  assert.match(presets, /burnished:\s*\{/)
  assert.match(presets, /clearcoat:\s*0\.96/)
  assert.match(robot, /lowPower\?lowPowerCap:dprCap/)
  assert.match(robot, /new TorusGeometry\(\.94,\.012,16,160\)/)
  assert.match(robot, /shell\.clearcoat=coat/)
})

test('Build with QuorlythBot still opens the approved full-page bot route with the task prompt', async () => {
  const app = await source('src/App.tsx')
  assert.match(app, /onBuild=\{prompt => \{ void openQuorlythBot\(false, prompt\) \} \}/)
  assert.match(app, /nav\('\/bot'\)/)
  assert.match(app, /fullPage=\{loc\.pathname === '\/bot'\}/)
})
