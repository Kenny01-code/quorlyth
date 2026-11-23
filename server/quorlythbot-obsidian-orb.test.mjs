import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot keeps the terracotta robot and uses the reference conversation workspace', async () => {
  const [bot, css] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/quorlythbot-reference.css'),
  ])

  assert.ok(bot.includes("import '../styles/quorlythbot-reference.css'"))
  assert.ok(bot.includes("const theme = 'terracotta'"))
  assert.ok(bot.includes("const orbVisible = bs.robot && view !== 'chat' && (speechState === 'playing' || voiceStudioSpeaking)"))
  assert.match(bot, /\{orbVisible && \([\s\S]*?className=\{cn\('bstage bot-orb-dock qbot-live-orb-stage'/)
  assert.match(bot, /active=\{!minimized && open && orbVisible\}/)
  assert.match(bot, /aria-label=\{live \? 'Live Talk voice visualizer' : 'QuorlythBot speaking visualizer'\}/)
  assert.match(bot, /onVoicePlaybackChange=\{setVoiceStudioSpeaking\}/)
  assert.doesNotMatch(bot, /robotReadyRef|pendingRobotPoseRef/)
  assert.doesNotMatch(bot, /<Robot(?:\s|>)/)
  assert.doesNotMatch(bot, /className="blive"/)
  assert.doesNotMatch(bot, /Stop listening|Click Stop listening to end/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)
  assert.match(css, /--qbot-orange: #D97755/)
  assert.match(css, /\.bstage/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('the existing Three.js orb remains a single sphere with its live listening and speaking states', async () => {
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
})

test('voice actions and the voice studio remain available in the new composer and navigation', async () => {
  const [bot, views, config] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
    source('src/bot/config.ts'),
  ])
  assert.match(bot, /aria-label=\{live \? 'End voice conversation' : 'Start voice conversation'\}/)
  assert.match(bot, /onClick=\{startLive\}/)
  assert.match(bot, /setView\('voice'\)/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)
  assert.match(views, /Orb finish/)
  assert.match(views, /preferElevenLabsVoice:\s*true/)
  assert.match(views, /onVoicePlaybackChange\?\.\(true\)/)
  assert.match(views, /onVoicePlaybackChange\?\.\(false\)/)
  assert.match(config, /theme: 'pearl'/)
})

test('the reference shell has a real navigation rail, grouped history and reusable templates', async () => {
  const [bot, css] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/quorlythbot-reference.css'),
  ])
  for (const name of ['qbot-rail-brand', 'qbot-rail-navigation', 'qbot-history-search', 'qbot-history-scroll', 'qbot-rail-footer']) {
    assert.ok(bot.includes(name), 'Missing sidebar section: ' + name)
  }
  assert.match(bot, /recentGroups\.map\(group/)
  assert.match(bot, /qbot-template-view/)
  assert.match(css, /\.qbot-template-card:hover/)
  assert.match(css, /\.qbot-feature-card:hover/)
  assert.match(css, /#bot\.qbot-reference-shell \.qbot-composer-dock/)
})

test('Projects, Knowledge Base, Templates and Voice Studio have distinct destinations', async () => {
  const bot = await source('src/bot/QuorlythBot.tsx')
  assert.match(bot, /setView\('projects'\)/)
  assert.match(bot, /setView\('library'\)/)
  assert.match(bot, /setView\('templates'\)/)
  assert.match(bot, /setView\('voice'\)/)
  assert.match(bot, /setView\('settings'\)/)
})
