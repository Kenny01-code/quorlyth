import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot uses the site-matched obsidian pearl glass frame', async () => {
  const [bot, glass] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-obsidian-glass.css'),
  ])

  assert.ok(bot.includes("import '../styles/bot-obsidian-glass.css'"))
  assert.ok(bot.includes("const theme = 'pearl'"))
  assert.ok(bot.includes("const accent = THEMES.pearl"))
  assert.match(bot, /className=\{cn\('bstage bot-orb-dock', stage\)\}/)
  assert.match(bot, /active=\{!minimized && open\}/)
  assert.match(bot, /view === 'chat' && \(/)
  assert.doesNotMatch(bot, /<Robot(?:\s|>)/)
  assert.doesNotMatch(bot, /className="blive"/)
  assert.doesNotMatch(bot, /Stop listening|Click Stop listening to end/)
  assert.doesNotMatch(bot, /connecting: 'Connecting', listening: 'Listening'/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)

  assert.match(glass, /--qbot-ink: #fbfbfd/)
  assert.match(glass, /linear-gradient\(150deg, rgba\(26, 27, 30/)
  assert.match(glass, /\.bstage\.bot-orb-dock\s*\{[\s\S]*?order: 3/)
  assert.match(glass, /\.ast-in\s*\{[\s\S]*?backdrop-filter: blur\(38px\) saturate\(150%\)/)
  assert.match(glass, /@media \(prefers-reduced-motion: reduce\)/)
})

test('the existing Three.js orb is a single cobalt-and-pearl sphere without orbit rings', async () => {
  const [orb, component, themes] = await Promise.all([
    source('src/bot/orb3d.ts'),
    source('src/bot/Orb.tsx'),
    source('src/bot/robot-themes.ts'),
  ])

  assert.match(orb, /new SphereGeometry\(1, 144, 112\)/)
  assert.match(orb, /uniform vec3 uPearl/)
  assert.match(orb, /uniform vec3 uCobalt/)
  assert.match(orb, /uniform vec3 uIce/)
  assert.match(orb, /uniform vec3 uWhite/)
  assert.match(orb, /blueMask = smoothstep/)
  assert.match(orb, /mode === 'listening'/)
  assert.match(orb, /mode === 'speaking'/)
  assert.match(orb, /const response = 1 - Math\.exp\(-dt \* 7\.2\)/)
  for (const legacy of ['TorusGeometry', 'ringHot', 'ringTerracotta', 'ringBone', 'makeOrbitPoints', 'PointsMaterial']) {
    assert.doesNotMatch(orb, new RegExp(legacy))
  }

  assert.match(component, /theme = 'pearl'/)
  assert.match(component, /pendingApiCallsRef/)
  assert.match(component, /onReadyRef\.current\?\.\(\)/)
  assert.match(component, /qbot-orb-fallback/)
  assert.doesNotMatch(component, /Load the orb|ast-ld/)
  assert.match(themes, /pearl:\s*\{/)
  assert.match(themes, /n: 'Cobalt Pearl'/)
})

test('voice UI exposes the pearl orb and keeps the chat composer mounted during live talk', async () => {
  const [bot, views, config] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
    source('src/bot/config.ts'),
  ])

  assert.match(bot, /aria-label=\{live \? 'End voice conversation' : 'Start voice conversation'\}/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)
  assert.match(views, /Orb finish/)
  assert.match(views, /Cobalt glass with a flowing pearl-white lower surface/)
  assert.match(views, /Chips label="Orb scale"/)
  assert.doesNotMatch(views, /Robot finish|Robot size|Hidden/)
  assert.match(config, /theme: 'pearl'/)
})
