import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot speech always requests ElevenLabs-only playback', async () => {
  const [bot, views] = await Promise.all([
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/bot/views.tsx'),
  ])

  assert.match(bot, /elevenLabsOnly: true/)
  assert.match(bot, /textOnly: true/)
  assert.doesNotMatch(bot, /allowBrowserFallback:\s*true/)
  assert.match(views, /elevenLabsOnly: true/)
  assert.doesNotMatch(views, /allowBrowserFallback:\s*true/)
  assert.doesNotMatch(views, /browser's built-in speech voice as the fallback/)
})

test('ElevenLabs-only mode cannot be overridden by a browser fallback option', async () => {
  const client = await readSource('src/ai/client.ts')
  assert.match(client, /const allowBrowserFallback = options\.elevenLabsOnly !== true && options\.allowBrowserFallback === true/)
  assert.match(client, /if \(!allowBrowserFallback\)/)
})
