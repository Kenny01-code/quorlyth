import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('optional warm palette stays isolated while Automations keeps its reference styling', async () => {
  const [entry, automationPage, automationStyles, theme] = await Promise.all([
    source('src/main.tsx'),
    source('src/screens/Automations.tsx'),
    source('src/styles/automation-ai.css'),
    source('src/styles/luxury-light-system.css'),
  ])
  assert.equal(entry.includes("import './styles/luxury-light-system.css'"), false, 'the optional warm editorial palette must not be mounted globally')
  assert.ok(entry.includes("import './styles/cover-burnt-orange.css'"), 'the reference homepage cover styling stays active')
  assert.ok(entry.indexOf("import './styles/app.css'") >= 0, 'the original app theme stays active')
  assert.equal(entry.includes("import './styles/automation-dark.css'"), false, 'Automation theme stays out of the global entry point')
  assert.ok(automationPage.indexOf("import '../styles/automation-ai.css'") >= 0, 'the Automation AI styles remain active')
  assert.equal(automationPage.includes("import '../styles/automation-dark.css'"), false, 'the reference route does not add a dark-only override')
  assert.ok(automationStyles.includes('#FFFCF6') && automationStyles.includes('#F2EADB'), 'reference integration panels retain their bone surfaces')
  assert.match(theme, /--q-lux-page:\s*#f5f1e9/)
  assert.match(theme, /--q-lux-orange:\s*#bf5532/)
  assert.match(theme, /--q-lux-bone:\s*#efe7dc/)
  assert.match(theme, /#nav\s+\.nav-item\.on/)
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
  assert.match(robot, /premium=opt\.theme==="burnished"/)
  assert.match(robot, /var dprCap=premium\?1\.5:1\.0,lowPowerCap=premium\?0\.85:0\.9/)
  assert.match(robot, /if\(premium\)\{var headSeam/)
  assert.match(robot, /new TorusGeometry\(\.94,\.012,16,160\)/)
  assert.match(robot, /shell\.clearcoat=T\.clearcoat/)
})

test('Build with QuorlythBot still opens the approved full-page bot route with the task prompt', async () => {
  const app = await source('src/App.tsx')
  assert.match(app, /openQuorlythBot\(false, prompt\)/)
  assert.match(app, /nav\('\/bot'\)/)
  assert.match(app, /fullPage=\{loc\.pathname === '\/bot'\}/)
})
