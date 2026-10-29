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

test('Nigerian accent keeps speaking through an ElevenLabs preset when no accent-specific ID is configured', async () => {
  const server = await readSource('server/openai.mjs')
  assert.doesNotMatch(server, /if\s*\(accent\s*===\s*'nigerian'\)\s*return\s+null/)
  assert.match(server, /const accentVoices = ELEVENLABS_DEFAULT_VOICES\[accent\] \|\| ELEVENLABS_DEFAULT_VOICES\.american/)
})

test('Fluid-black styling is scoped to the slash-command picker, not the composer', async () => {
  const css = await readSource('src/styles/bot-composer-fluid-black.css')
  assert.match(css, /\.bsl/)
  assert.match(css, /\.bsi/)
  assert.doesNotMatch(css, /\.ast-in|textarea|#root/)
})

test('Auto-spoken QuorlythBot replies show an error if ElevenLabs playback fails', async () => {
  const bot = await readSource('src/bot/QuorlythBot.tsx')
  assert.match(bot, /Auto-spoken replies must surface a useful ElevenLabs error instead of failing silently/)
  assert.match(bot, /void playSpeech\(clean, key, true\)/)
})
