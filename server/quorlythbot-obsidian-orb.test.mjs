import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot keeps its restored terracotta robot theme with the obsidian pearl-glass voice dock', async () => {
  const [bot, glass] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-obsidian-glass.css'),
  ])

  assert.ok(bot.includes("import '../styles/bot-obsidian-glass.css'"))
  assert.ok(bot.includes("const theme = 'terracotta'"))
  assert.ok(bot.includes("const accent = THEMES.pearl"))
  assert.match(bot, /const orbVisible = bs\\.robot && view !== 'chat' && \\(speechState === 'playing' \\|\\| voiceStudioSpeaking\\)/)
  assert.match(bot, /\{orbVisible && \([\s\S]*?className=\{cn\('bstage bot-orb-dock qbot-live-orb-stage'/)
  assert.match(bot, /active=\{!minimized && open && orbVisible\}/)
  assert.match(bot, /aria-label=\{live \? 'Live Talk voice visualizer' : 'QuorlythBot speaking visualizer'\}/)
  assert.match(bot, /onVoicePlaybackChange=\{setVoiceStudioSpeaking\}/)
  assert.doesNotMatch(bot, /robotReadyRef|pendingRobotPoseRef/)
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

test('the Live Talk orb is larger, brighter, and never mounted in ordinary chat', async () => {
  const [bot, glass] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-obsidian-glass.css'),
  ])

  const orbStage = bot.indexOf("className={cn('bstage bot-orb-dock qbot-live-orb-stage'")
  assert.ok(orbStage > 0)
  assert.ok(bot.lastIndexOf('{orbVisible && (', orbStage) >= 0, 'Orb stage must be mounted only while voice output is active.')
  assert.match(bot, /voiceStudioSpeaking/)
  assert.match(glass, /height:clamp\(204px,25vh,248px\) !important/)
  assert.match(glass, /qbot-orb-stage-halo/)
  assert.match(glass, /drop-shadow\(0 0 42px rgba\(225,235,255,.09\)\)/)
  assert.match(glass, /width:clamp\(142px,18vh,178px\)/)
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
