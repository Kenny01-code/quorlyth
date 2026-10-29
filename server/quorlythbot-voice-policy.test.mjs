import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot prioritizes ElevenLabs and recovers through cloud or device speech', async () => {
  const [bot, views, client] = await Promise.all([
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/bot/views.tsx'),
    readSource('src/ai/client.ts'),
  ])

  assert.match(bot, /elevenLabsOnly: false/)
  assert.match(bot, /preferElevenLabsVoice: true/)
  assert.match(bot, /allowBrowserFallback:\s*true/)
  assert.match(bot, /textOnly: true/)
  assert.match(views, /preferElevenLabsVoice:\s*true/)
  assert.match(views, /allowBrowserFallback:\s*true/)
  assert.match(client, /request\('\/api\/speak-stream'\)/)
  assert.match(client, /request\('\/api\/speak'\)/)
})

test('ElevenLabs-only mode cannot be overridden by a browser fallback option', async () => {
  const client = await readSource('src/ai/client.ts')
  assert.match(client, /const allowBrowserFallback = options\.elevenLabsOnly !== true && options\.allowBrowserFallback === true/)
  assert.match(client, /if \(!allowBrowserFallback\)/)
})

test('Nigerian accent never silently uses an American voice when no matching ID is configured', async () => {
  const server = await readSource('server/openai.mjs')
  assert.match(server, /if\s*\(accent\s*===\s*'nigerian'\)\s*return\s+null/)
  assert.match(server, /selected ElevenLabs accent needs a matching voice ID/)
  assert.match(server, /No alternate voice will be used/)
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


test('LiveTalk tolerates natural pauses and starts speech from shorter response chunks', async () => {
  const [bot, server] = await Promise.all([
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('server/openai.mjs'),
  ])

  assert.match(server, /type: 'semantic_vad', eagerness: 'medium'/)
  assert.match(bot, /recognition\.continuous = true/)
  assert.match(bot, /prefetchElevenLabsSpeech\(chunk, v\.ai/)
  assert.match(bot, /liveSilenceTimer\.current = window\.setTimeout/)
  assert.match(bot, /speechTail\.length > 26/)
  assert.match(bot, /tier: 'quick'/)
})

test('Normal chat starts ElevenLabs speech while the answer is still streaming', async () => {
  const bot = await readSource('src/bot/QuorlythBot.tsx')
  assert.match(bot, /queueReplySpeechFromDelta/)
  assert.match(bot, /prefetchElevenLabsSpeech\(chunk, replyVoice\.ai/)
  assert.match(bot, /playPreparedSpeechBlob\(prepared\.blob/)
  assert.match(bot, /if \(bs\.voice\) finishReplySpeech\(clean\)/)
  assert.match(bot, /allowBrowserFallback:\s*true/)
  assert.match(bot, /preferElevenLabsVoice:\s*true/)
})

test('Opening QuorlythBot no longer shows a separate loading panel', async () => {
  const app = await readSource('src/App.tsx')
  assert.doesNotMatch(app, /qbot-open-fallback/)
  assert.match(app, /<Suspense fallback=\{null\}><QuorlythBot initialOpen voiceRequest=\{botVoiceRequest\} \/><\/Suspense>/)
  assert.match(app, /Warm the assistant chunk after the first paint/)
})

test('Chat provider failover bounds stalled first-token waits', async () => {
  const server = await readSource('server/openai.mjs')
  assert.match(server, /Math\.min\(configured, 2200\)/)
  assert.match(server, /PROVIDER_FALLBACK_STATUSES = new Set\(\[401, 402, 403, 404, \.\.\.TRANSIENT_STATUSES\]\)/)
})

test('Sending a normal message commits its visible state before network awaits', async () => {
  const bot = await readSource('src/bot/QuorlythBot.tsx')
  assert.match(bot, /flushSync\(\(\) => \{/)
  assert.match(bot, /Commit the user's bubble and active state immediately/)
})
