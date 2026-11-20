import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot restores the live orange robot shell and keeps voice visualization separate', async () => {
  const [bot, roomTheme] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-room-theme.css'),
  ])

  assert.ok(bot.includes("import '../styles/bot-room-theme.css'"))
  assert.ok(bot.includes("import { Robot } from './Robot'"))
  assert.ok(bot.includes("const theme = 'terracotta'"))
  assert.ok(bot.includes("const accent = THEMES.terracotta"))
  assert.ok(bot.includes("label=\"Robot size\""))
  assert.match(bot, /view === 'voice' \|\| !!live\s*\?\s*<Orb/)
  assert.match(bot, /:\s*<Robot ref=\{robot\} theme=\{theme\}/)
  assert.match(bot, /active=\{!minimized && view === 'chat' && bs\.robot && stage !== 'off'\}/)
  assert.match(bot, /onVoicePlaybackChange=\{setVoiceStudioSpeaking\}/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)
  assert.doesNotMatch(bot, /import '\.\.\/styles\/bot-obsidian-glass\.css'/)
  assert.doesNotMatch(bot, /const theme = 'pearl'/)

  assert.match(roomTheme, /--qbot-orange: #F97316/)
  assert.match(roomTheme, /--qbot-terracotta: #D97755/)
  assert.match(roomTheme, /\/\* Orange light stage:/)
  assert.match(roomTheme, /@media \(prefers-reduced-motion: reduce\)/)
})

test('the existing Three.js orb is a single cobalt-and-pearl sphere without orbit rings', async () => {
  const [orb, component, themes] = await Promise.all([
    source('src/bot/orb3d.ts'),
    source('src/bot/Orb.tsx'),
    source('src/bot/robot-themes.ts'),
  ])

  assert.match(orb, /new SphereGeometry\(1, 176, 144\)/)
  assert.match(orb, /camera.position.set\(0, 0, 3\.72\)/)
  assert.match(orb, /roughness: 0\.042/)
  assert.match(orb, /clearcoatRoughness: 0\.022/)
  assert.match(orb, /edgeSoftbox/)
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

test('voice UI keeps the orange robot controls while the orb remains a dedicated voice visualizer', async () => {
  const [bot, views, config] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
    source('src/bot/config.ts'),
  ])

  assert.match(bot, /aria-label=\{live \? 'End voice conversation' : 'Start voice conversation'\}/)
  assert.match(bot, /view === 'voice' \|\| !!live/)
  assert.match(bot, /<Orb ref=\{robot\}/)
  assert.match(bot, /<Robot ref=\{robot\}/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)
  assert.match(views, /Robot finish/)
  assert.match(views, /Quorlyth orange, consistent across the site/)
  assert.match(views, /Chips label="Robot size"/)
  assert.match(views, /\['std', 'Standard'\].*\['big', 'Large'\].*\['off', 'Hidden'\]/)
  assert.doesNotMatch(views, /Orb finish|Orb scale|Cobalt glass with a flowing pearl-white lower surface/)
  assert.match(config, /robot: true/)
  assert.match(config, /theme: 'terracotta'/)
})

test('the New chat sidebar action is a refined monochrome pearl-glass control', async () => {
  const [bot, glass] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-obsidian-glass.css'),
  ])

  assert.match(bot, /qbot-sidebar-primary-action/)
  assert.match(bot, /qbot-sidebar-primary-icon/)
  assert.doesNotMatch(bot, /Start a fresh conversation|qbot-sidebar-primary-arrow/)
  assert.match(glass, /\.bs-n > \.qbot-sidebar-primary-action/)
  assert.match(glass, /grid-template-columns:38px minmax\(0,1fr\) 22px/)
  assert.match(glass, /linear-gradient\(145deg,#fff 0%,#f3f4f7 48%,#dfe3eb 100%\)/)
  assert.match(glass, /qbot-sidebar-primary-icon[\s\S]*?background:linear-gradient\(145deg,#26282d,#08090b 76%\)/)
})

test('ordinary chat renders the orange robot and reserves the orb for voice or Live Talk', async () => {
  const [bot, roomTheme] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-room-theme.css'),
  ])

  const stage = bot.slice(bot.indexOf("className={cn('bstage'"), bot.indexOf("className={cn('qbot-conversation'"))
  assert.match(stage, /view === 'voice' \|\| !!live\s*\?\s*<Orb/)
  assert.match(stage, /:\s*<Robot ref=\{robot\}/)
  assert.match(stage, /view === 'chat' && bs\.robot && stage !== 'off'/)
  assert.match(bot, /voiceStudioSpeaking/)
  assert.match(bot, /onVoicePlaybackChange=\{setVoiceStudioSpeaking\}/)
  assert.match(roomTheme, /\/\* Orange light stage:/)
  assert.match(roomTheme, /rgba\(249, 115, 22, \.23\)/)
})

test('QuorlythBot writeups, code, tables and inline icons use monochrome glass styling', async () => {
  const glass = await source('src/styles/bot-obsidian-glass.css')

  assert.match(glass, /\.qbot-conversation \.am\.ma a/)
  assert.match(glass, /\.qbot-conversation \.am\.ma pre/)
  assert.match(glass, /\.qbot-conversation \.am\.ma table/)
  assert.match(glass, /\.qbot-conversation \.am\.ma :is\(svg,\.ic,\.quorlyth-glyph\)/)
  assert.match(glass, /background:linear-gradient\(145deg,rgba\(255,255,255,.055\),rgba\(255,255,255,.018\)\),#050506/)
})


test('voice studio previews and voice matching also activate and release the parent orb', async () => {
  const [bot, views] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
  ])

  assert.match(bot, /onVoicePlaybackChange=\{setVoiceStudioSpeaking\}/)
  assert.match(views, /onVoicePlaybackChange\?: \(speaking: boolean\) => void/)
  assert.match(views, /p\.onVoicePlaybackChange\?\.\(true\)/)
  assert.match(views, /p\.onVoicePlaybackChange\?\.\(false\)/)
  assert.match(views, /Voice preview finished\./)
})

test('the reference sidebar layout uses white-glass primary action and Quorlyth orange icons', async () => {
  const [bot, glass] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-obsidian-glass.css'),
  ])

  for (const region of ['bs-t', 'bs-n', 'bs-s', 'bs-l', 'bs-f']) assert.ok(bot.includes('className="' + region + '"'))
  assert.match(bot, /qbot-sidebar-primary-action/)
  assert.match(glass, /--qbot-orange: #F97316/)
  assert.match(glass, /\.bs \.bs-n > \.bsb/)
  assert.match(glass, /\.bs \.bs-n > \.bsb :is\(svg,\.ic\)/)
  assert.match(glass, /linear-gradient\(145deg,#fff 0%,#f1f2f5 55%,#e2e5eb 100%\)/)
  assert.match(glass, /\.bs-f \.bsu/)
})

test('Projects, Library, Customize and Voice Studio get high-contrast black copy on white glass', async () => {
  const glass = await source('src/styles/bot-obsidian-glass.css')

  assert.match(glass, /\.qbot-conversation:not\(\.qbot-chat-surface\) \.glass\.pad/)
  assert.match(glass, /color:#111216 !important/)
  assert.match(glass, /\.glass\.pad :is\(input,textarea,select\)/)
  assert.match(glass, /\.qbot-conversation:not\(\.qbot-chat-surface\) :is\(\.bsk,\.bvc\)/)
  assert.match(glass, /\.qbot-conversation:not\(\.qbot-chat-surface\) \.btn\.p/)
  assert.match(glass, /\.qbot-chat-surface :is\(svg,\.ic,\.quorlyth-glyph\)/)
})
