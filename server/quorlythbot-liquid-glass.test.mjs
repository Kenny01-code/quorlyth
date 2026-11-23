import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot is rebuilt as the reference-style conversation workspace', async () => {
  const [bot, css] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/quorlythbot-reference.css'),
  ])

  assert.ok(bot.includes("import '../styles/quorlythbot-reference.css'"))
  for (const legacy of ['bot-room-theme.css', 'bot-liquid-glass.css', 'bot-obsidian-glass.css', 'bot-redesign.css', 'bot.css']) {
    assert.ok(!bot.includes(legacy), 'Legacy Bot stylesheet remains imported: ' + legacy)
  }
  for (const part of ['qbot-rail-brand', 'qbot-new-chat', 'Explore Quorlyth AI', 'Knowledge Base', 'Templates', 'qbot-history-scroll', 'qbot-account-card']) {
    assert.ok(bot.includes(part), 'Missing reference sidebar element: ' + part)
  }
  for (const part of ['qbot-reference-overlay', 'qbot-reference-shell', 'qbot-topbar', 'qbot-workspace-switch', 'qbot-empty-state', 'qbot-composer-frame', 'qbot-feature-grid']) {
    assert.ok(bot.includes(part), 'Missing reference workspace element: ' + part)
  }
  assert.ok(css.includes('#ast.qbot-reference-overlay'))
  assert.ok(css.includes('#bot.qbot-reference-shell .qbot-rail'))
  assert.ok(css.includes('#bot.qbot-reference-shell .qbot-topbar'))
  assert.ok(css.includes('.qbot-empty-state h1'))
  assert.ok(css.includes('.qbot-composer-frame'))
  assert.ok(css.includes('.qbot-feature-card:hover'))
})

test('the former site-wide preview design is removed and the new design is isolated to QuorlythBot', async () => {
  const [main, bot, views] = await Promise.all([
    source('src/main.tsx'),
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
  ])
  assert.ok(!main.includes('quorlyth-premium-preview.css'))
  assert.ok(!bot.includes('qbot-premium'))
  assert.ok(!views.includes('voice-studio-responsive.css'))
  assert.ok(main.includes("import './styles/app.css'"))
  assert.ok(bot.includes("import '../styles/quorlythbot-reference.css'"))
})

test('chat history grouping retains search, pinned, archived and saved chat actions', async () => {
  const bot = await source('src/bot/QuorlythBot.tsx')
  assert.ok(bot.includes('const recentGroups = recent.reduce'))
  assert.ok(bot.includes("offset === 1 ? 'YESTERDAY'"))
  assert.ok(bot.includes("groups.push({ label, chats: [chatItem] })"))
  assert.ok(bot.includes('pinned.map(item)'))
  assert.ok(bot.includes('arch.map(item)'))
  assert.ok(bot.includes('setShowArch(!showArch)'))
  assert.ok(bot.includes('setCur(c)'))
  assert.ok(bot.includes('setQ(e.target.value)'))
})

test('the composer shortcuts launch real skills and voice actions', async () => {
  const bot = await source('src/bot/QuorlythBot.tsx')
  assert.match(bot, /onClick=\{\(\) => skill\('brief'\)\}/)
  assert.match(bot, /onClick=\{\(\) => skill\('post'\)\}/)
  assert.match(bot, /onClick=\{\(\) => primeComposer\('Help me think through this question/)
  assert.match(bot, /onClick=\{dictate\}/)
  assert.match(bot, /onClick=\{startLive\}/)
  assert.match(bot, /onClick=\{\(\) => send\(\)\}/)
  assert.match(bot, /setView\('templates'\)/)
  assert.match(bot, /view === 'templates'/)
})

test('the Bot workspace adapts to touch layouts and respects reduced-motion preferences', async () => {
  const css = await source('src/styles/quorlythbot-reference.css')
  assert.match(css, /@media \(max-width: 860px\)/)
  assert.match(css, /@media \(max-width: 640px\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /grid-template-columns: 1fr/)
  assert.match(css, /qbot-sidebar-scrim/)
})
