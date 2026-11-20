import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot restores the exact live-site launcher treatment', async () => {
  const [bot, app] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/App.tsx'),
  ])
  assert.match(bot, /<span className="astm"><Logo size=\{30\} \/><\/span>/)
  assert.match(app, /<span className="astm"><Logo size=\{30\} \/><\/span>/)
  assert.doesNotMatch(bot + app, /QuorlythBotHead|qbot-launcher-restore/)
  assert.match(bot, /aria-label="Open QuorlythBot"/)
  assert.match(bot, /title="Ask QuorlythBot\./)
  assert.match(app, /!intro && !botLoading && !botMounted/)
})

test('chat, voice and Live Talk use one Robot visual, not a separate orb', async () => {
  const bot = await source('src/bot/QuorlythBot.tsx')
  assert.doesNotMatch(bot, /from '\.\/Orb'|<Orb/)
  assert.match(bot, /<Robot ref=\{robot\} theme=\{theme\} calm=\{bs\.calm\} drag defer active=/)
  assert.match(bot, /view === 'chat' && bs\.robot && stage !== 'off'\) \|\| view === 'voice' \|\| !!live/)
  assert.match(bot, /className="bnm">QuorlythBot/)
})

test('Robot uses the original live loading indicator and retry action', async () => {
  const robot = await source('src/bot/Robot.tsx')
  assert.match(robot, /className="ast-fb"/)
  assert.match(robot, /className="ast-ld"/)
  assert.match(robot, /Load the robot/)
  assert.doesNotMatch(robot, /qbot-robot-loading-glow|Retry robot/)
})
