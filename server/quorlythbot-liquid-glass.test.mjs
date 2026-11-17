import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot chat uses its own liquid-glass frame and layered composer', async () => {
  const [bot, glass] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-liquid-glass.css'),
  ])

  assert.ok(bot.indexOf("import '../styles/bot-liquid-glass.css'") > bot.indexOf("import '../styles/bot-room-theme.css'"))
  assert.ok(bot.includes("view === 'chat' && 'qbot-chat-surface'"))

  assert.ok(glass.includes('.qbot-conversation.qbot-chat-surface'))
  assert.ok(glass.includes('.ast-in > textarea'))
  assert.ok(glass.includes('grid-template-rows: minmax(58px, auto) 44px'))
  assert.ok(glass.includes('backdrop-filter: blur(32px) saturate(165%)'))
  assert.ok(glass.includes('.ast-in > .btn:nth-of-type(3)'))
  assert.ok(glass.includes('grid-column: 4'))
})

test('the entire QuorlythBot frontend shares one rounded liquid-glass material', async () => {
  const glass = await source('src/styles/bot-liquid-glass.css')

  // The sidebar gets an independent rounded inset panel, not a hard divider wall.
  assert.ok(glass.includes('.bs {'))
  assert.ok(glass.includes('margin: 10px 0 10px 10px !important'))
  assert.ok(glass.includes('border-radius: 25px !important'))
  assert.ok(glass.includes('.bs::before'))
  assert.ok(glass.includes('.bs .bs-l'))
  assert.ok(glass.includes('.bs .bs-f'))

  // Every non-chat view receives the same glass room; nested cards retain their own shape.
  assert.ok(glass.includes('.qbot-conversation:not(.qbot-chat-surface)'))
  assert.ok(glass.includes('.qbot-conversation .glass'))
  assert.ok(glass.includes(':is(.bsk, .bvc)'))
  assert.ok(glass.includes('.qbot-conversation :is(input, textarea, select)'))
  assert.ok(glass.includes('.cmx'))

  // Preserve component geometry and avoid hiding/replacing the existing tiles or robot stage.
  assert.ok(!/\.bsk\s*\{[^}]*display:\s*none/is.test(glass))
  assert.ok(!/\.bvc\s*\{[^}]*display:\s*none/is.test(glass))
  assert.ok(!/\.bstage\s*\{[^}]*display:\s*none/is.test(glass))
  assert.ok(!/\.ast-stage\s*\{[^}]*display:\s*none/is.test(glass))
})
