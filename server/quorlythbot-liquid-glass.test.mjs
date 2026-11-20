import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot uses the original live-site black composer and Robot shell', async () => {
  const [bot, baseStyles, composerStyles] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot.css'),
    source('src/styles/bot-composer-fluid-black.css'),
  ])
  assert.match(bot, /import '\.\.\/styles\/bot\.css'/)
  assert.match(bot, /import '\.\.\/styles\/bot-composer-fluid-black\.css'/)
  assert.doesNotMatch(bot, /bot-room-theme\.css|bot-liquid-glass\.css|from '\.\/Orb'|<Orb/)
  assert.match(bot, /className=\{cn\('qbot-conversation', view === 'chat' && 'qbot-chat-surface'\)\}/)
  assert.match(bot, /<Robot ref=\{robot\} theme=\{theme\} calm=\{bs\.calm\} drag defer active=/)
  assert.match(baseStyles, /\.ast-in/)
  assert.match(composerStyles, /\.bsl/)
})

test('the live-site Bot keeps voice/chat controls while sharing the same Robot stage', async () => {
  const bot = await source('src/bot/QuorlythBot.tsx')
  assert.match(bot, /aria-label=\{live \? 'End voice conversation' : 'Start voice conversation'\}/)
  assert.match(bot, /view === 'chat' && bs\.robot && stage !== 'off'\) \|\| view === 'voice' \|\| !!live/)
  assert.match(bot, /className=\{cn\('ast-cap', caption && 'on'\)\}/)
  assert.match(bot, /live\?\.user/)
  assert.match(bot, /live\?\.bot/)
})
