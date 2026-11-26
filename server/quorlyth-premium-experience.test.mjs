import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot uses one assistant identity and keeps Smart mode out of the interface', async () => {
  const [bot, views, config] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
    source('src/bot/config.ts'),
  ])

  assert.ok(bot.includes('qbot-core-brand'))
  assert.ok(bot.includes('qbot-compose-live'))
  assert.doesNotMatch(bot, /qbot-core-selector|qbot-model-switch|Quorlyth Smart/)
  assert.doesNotMatch(views, /label="Thinking"|Thorough/)
  assert.doesNotMatch(views, /model:\s*'smart'/)
  assert.match(config, /model:\s*'quick'/)
  assert.match(bot, /void bd\.saveSettings\(\{ model: 'quick' \}\)/)
})

test('the Bot composer keeps Live Talk visible, evenly spaced and independent on hover', async () => {
  const [bot, css] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-premium-chat.css'),
  ])

  assert.match(bot, /className=\{cn\('btn', 'qbot-compose-live'/)
  assert.match(css, /grid-template-columns: 40px minmax\(0,1fr\) 40px 40px 44px/)
  assert.match(css, /\.qbot-compose-live[\s\S]*?display: inline-grid !important;/)
  assert.match(css, /qbot-compose-live:is\(:hover,:focus-visible\)/)
  assert.match(css, /qbot-compose-mic[\s\S]*?transform: none !important;/)
  assert.match(css, /qbot-compose-send:is\(:hover,:focus-visible\):not\(:disabled\)/)
  assert.match(css, /@media \(max-width: 390px\)/)
})

test('Bot chat and workspace views use paper-and-ink surfaces while Robot Studio stays dark', async () => {
  const css = await source('src/styles/bot-premium-chat.css')

  assert.match(css, /qbot-chat-surface[\s\S]*?background:[\s\S]*?#f7f3ec/)
  assert.match(css, /qbot-assistant-message[\s\S]*?background: rgba\(255,254,250,.92\)/)
  assert.match(css, /qbot-conversation:not\(\.qbot-chat-surface\):not\(\.qbot-robot-studio-shell\)/)
  assert.match(css, /qbot-robot-studio-shell[\s\S]*?background: #08090b/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('landing hero loads its premium copper Three.js sculpture only near the viewport', async () => {
  const [landing, stage, scene, coverCss, entry] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/components/CreatorCoverStage.tsx'),
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/cover-burnt-orange.css'),
    source('src/main.tsx'),
  ])

  assert.match(landing, /<CreatorCoverStage \/>/)
  assert.match(stage, /IntersectionObserver/)
  assert.match(stage, /import\('\.\/creatorCoverScene'\)/)
  assert.match(stage, /rootMargin: '180px 0px'/)
  assert.match(scene, /from 'three'/)
  assert.match(scene, /TorusKnotGeometry/)
  assert.match(scene, /new Color\(0x9e4327\)/)
  assert.match(scene, /powerPreference: lowPower \? 'low-power' : 'high-performance'/)
  assert.match(scene, /prefers-reduced-motion/)
  assert.match(scene, /document\.visibilityState/)
  assert.match(scene, /renderer\.dispose\(\)/)
  assert.match(coverCss, /@media \(max-width: 760px\)/)
  assert.match(coverCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(entry, /styles\/cover-burnt-orange\.css/)
  assert.doesNotMatch(entry, /from ['"]\.\/components\/creatorCoverScene['"]/)
})
