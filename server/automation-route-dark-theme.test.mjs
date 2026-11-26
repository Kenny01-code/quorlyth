import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Automation Studio activates a route-level dark theme on the full app shell', async () => {
  const [entry, app, theme, automation, bot] = await Promise.all([
    source('src/main.tsx'),
    source('src/App.tsx'),
    source('src/styles/automation-dark.css'),
    source('src/styles/automations.css'),
    source('src/bot/QuorlythBot.tsx'),
  ])

  const lightThemeIndex = entry.indexOf("import './styles/luxury-light-system.css'")
  const darkThemeIndex = entry.indexOf("import './styles/automation-dark.css'")
  assert.ok(lightThemeIndex >= 0, 'the existing light/editorial theme remains available')
  assert.ok(darkThemeIndex > lightThemeIndex, 'the Automation dark theme loads after the global light theme')

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
  assert.doesNotMatch(automation, /Automation Studio is intentionally a dark workspace/)

  assert.match(bot, /nav\('\/automations'\)\s*\}\}><Icon name="calendar-clock" size=\{16\} \/>Automations/)
  assert.doesNotMatch(bot, /calendar-clock[^\n]*nav\('\/architecture'\)/)
})

test('Automation dark route class is removed when leaving the route', async () => {
  const app = await source('src/App.tsx')
  assert.match(app, /return \(\) => \{\s*document\.documentElement\.classList\.remove\('q-automation-route-active'\)\s*document\.body\.classList\.remove\('q-automation-route-active'\)/)
})
