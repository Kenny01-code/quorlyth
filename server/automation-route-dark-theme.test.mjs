import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Automation Studio activates a route-level dark theme on the full app shell', async () => {
  const [entry, app, theme, automation, automationPage, bot] = await Promise.all([
    source('src/main.tsx'),
    source('src/App.tsx'),
    source('src/styles/automation-dark.css'),
    source('src/styles/automations.css'),
    source('src/screens/Automations.tsx'),
    source('src/bot/QuorlythBot.tsx'),
  ])

  const baseThemeIndex = entry.indexOf("import './styles/app.css'")
  const lightThemeImportedGlobally = entry.includes("import './styles/luxury-light-system.css'")
  const routeThemeImportedGlobally = entry.includes("import './styles/automation-dark.css'")
  const automationBaseIndex = automationPage.indexOf("import '../styles/automations.css'")
  const automationAiIndex = automationPage.indexOf("import '../styles/automation-ai.css'")
  const automationDarkIndex = automationPage.indexOf("import '../styles/automation-dark.css'")
  const baseTheme = await source('src/styles/app.css')
  assert.ok(baseThemeIndex >= 0, 'the original app-wide dark theme remains the base layer')
  assert.equal(lightThemeImportedGlobally, false, 'the editorial light override must not be applied globally')
  assert.equal(routeThemeImportedGlobally, false, 'the Automation route override is not loaded globally')
  assert.ok(automationBaseIndex >= 0 && automationAiIndex > automationBaseIndex, 'Automation feature styles retain their original order')
  assert.ok(automationDarkIndex > automationAiIndex, 'the route dark theme loads after all lazy Automation styles')
  assert.ok(baseTheme.includes(':root{--k:#000;--w:#fff;'), 'the base palette stays black and white')
  assert.ok(baseTheme.includes('body{background:var(--k);color:var(--w);'), 'the body keeps the original dark canvas and light text')

  assert.match(app, /loc\.pathname === '\/automations' \? 'q-automation-route' : undefined/)
  assert.match(app, /document\.documentElement\.classList\.toggle\('q-automation-route-active', active\)/)
  assert.match(app, /document\.body\.classList\.toggle\('q-automation-route-active', active\)/)
  assert.match(app, /<Route path="\/automations" element=\{<Automations \/>\} \/>/)

  assert.match(theme, /html\.q-automation-route-active[\s\S]*?background:\s*#08090b\s*!important/)
  assert.match(theme, /body\.q-automation-route-active[\s\S]*?background:\s*#08090b\s*!important/)
  assert.match(theme, /#root main#main\.q-automation-route[\s\S]*?background:\s*#08090b\s*!important/)
  assert.match(theme, /#root main#main\.q-automation-route > section\.on[\s\S]*?background:\s*#08090b\s*!important/)
  assert.match(theme, /\.wa-screen > \.head::before[\s\S]*?display:\s*none\s*!important/)
  assert.match(theme, /\.wa-screen :is\(input,textarea,select\)[\s\S]*?color-scheme:\s*dark\s*!important/)
  assert.match(theme, /body\.q-automation-route-active #nav/)
  assert.match(theme, /#root main#main\.q-automation-route \.wa-screen :is\(input,textarea,select\)[\s\S]*?color-scheme:\s*dark\s*!important/)
  assert.match(automationPage, /import '\.\.\/styles\/automation-dark\.css'/)
  assert.doesNotMatch(automation, /Automation Studio is intentionally a dark workspace/)

  assert.match(bot, /nav\('\/automations'\)\s*\}\}><Icon name="calendar-clock" size=\{16\} \/>Automations/)
  assert.doesNotMatch(bot, /calendar-clock[^\n]*nav\('\/architecture'\)/)
  assert.equal((bot.match(/\/automations\?created=/g) || []).length, 2)
  assert.doesNotMatch(bot, /\/architecture\?automationCreated=/)
})

test('Automation dark route class is removed when leaving the route', async () => {
  const app = await source('src/App.tsx')
  assert.match(app, /return \(\) => \{\s*document\.documentElement\.classList\.remove\('q-automation-route-active'\)\s*document\.body\.classList\.remove\('q-automation-route-active'\)/)
})
