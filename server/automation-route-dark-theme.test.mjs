import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Automation Studio activates a route-level dark theme on the full app shell', async () => {
  const [entry, app, theme, automation, automationAi, automationPage, bot] = await Promise.all([
    source('src/main.tsx'),
    source('src/App.tsx'),
    source('src/styles/automation-dark.css'),
    source('src/styles/automations.css'),
    source('src/styles/automation-ai.css'),
    source('src/screens/Automations.tsx'),
    source('src/bot/QuorlythBot.tsx'),
  ])

  const baseThemeIndex = entry.indexOf("import './styles/app.css'")
  const lightThemeImportedGlobally = entry.includes("import './styles/luxury-light-system.css'")
  const routeThemeImportedGlobally = entry.includes("import './styles/automation-dark.css'")
  const automationBaseIndex = automationPage.indexOf("import '../styles/automations.css'")
  const automationEditorialIndex = automationPage.indexOf("import '../styles/automation-editorial-cards.css'")
  const automationAiIndex = automationPage.indexOf("import '../styles/automation-ai.css'")
  const automationDarkIndex = automationPage.indexOf("import '../styles/automation-dark.css'")
  const baseTheme = await source('src/styles/app.css')
  assert.ok(baseThemeIndex >= 0, 'the original app-wide dark theme remains the base layer')
  assert.equal(lightThemeImportedGlobally, false, 'the editorial light override must not be applied globally')
  assert.equal(routeThemeImportedGlobally, false, 'the Automation route override is not loaded globally')
  assert.ok(automationBaseIndex >= 0 && automationEditorialIndex > automationBaseIndex, 'Automation starter-card styles retain their original order')
  assert.ok(automationAiIndex > automationEditorialIndex, 'Automation AI styles load after editorial cards')
  assert.ok(automationDarkIndex > automationAiIndex, 'the route dark theme loads after all lazy Automation styles')
  assert.doesNotMatch(automationAi, /#FFFCF6|#F2EADB|#FFFEFA|#F5EFE6|#F8F2E8|#EAE0D1|#F4EBDD|#F5AD87|#F7E9D7|color:#000000 !important|color:#211B15 !important/)
  assert.match(automationAi, /\.wa-connected-services \{[^}]*background:linear-gradient\(145deg,rgba\(255,255,255,\.045\),rgba\(255,255,255,\.012\)\),rgba\(3,3,4,\.72\)/s)
  assert.match(automationAi, /\.wa-plain-guide \{[^}]*background:linear-gradient\(125deg,rgba\(255,255,255,\.045\),rgba\(255,255,255,\.012\)\)/s)
  assert.match(automationAi, /\.wa-runtime-status \{[\s\S]*?background:linear-gradient\(110deg,rgba\(255,255,255,\.045\),rgba\(255,255,255,\.012\)\)/)
  assert.match(automationAi, /\.wa-ai-controls select option \{ color:#F0EAD9; background:#141619; \}/)
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
  assert.match(theme, /\.wa-template-section \.wa-template-card,\s*#root main#main\.q-automation-route \.wa-screen \.wa-template-section \.wa-template-card:nth-child\(3n \+ 2\)[\s\S]*?background:linear-gradient\(145deg,#1a1d20 0%,#121416 80%\)!important/)
  assert.match(theme, /\.wa-connected-service em[\s\S]*?background:rgba\(62,139,91,\.13\)!important/)
  assert.match(theme, /\.wa-plain-guide-steps article[\s\S]*?background:rgba\(255,255,255,\.025\)!important/)
  assert.match(theme, /\.wa-ai-example-prompts>button[\s\S]*?background:rgba\(184,79,45,\.085\)!important/)
  assert.match(theme, /\.wa-ai-controls select option[\s\S]*?background:#141619!important/)
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
