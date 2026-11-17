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

  assert.ok(glass.includes(':is(#ast .astp.bot, body > .qbot-drawer-portal.bot)'))
  assert.ok(glass.includes('.qbot-conversation.qbot-chat-surface'))
  assert.ok(glass.includes('.ast-in > textarea'))
  assert.ok(glass.includes('grid-template-rows: minmax(58px, auto) 44px'))
  assert.ok(glass.includes('backdrop-filter: blur(32px) saturate(165%)'))
  assert.ok(glass.includes('.ast-in > .btn:nth-of-type(3)'))
  assert.ok(glass.includes('grid-column: 4'))

  // This finishing layer must not target any existing card, skill tile, stage or wall surface.
  for (const untouched of ['.glass', '.bsk', '.bski', '.bhero', '.bstage', '.ast-stage', '.bwall']) {
    assert.ok(!new RegExp('(^|[,\\s])' + untouched.replace('.', '\\.') + '(?=[\\s:{.#,])', 'm').test(glass),
      'The liquid-glass layer must not restyle ' + untouched)
  }
})
