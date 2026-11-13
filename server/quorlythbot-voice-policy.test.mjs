import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Live Talk prefers ElevenLabs and falls back quickly if first audio is delayed', async () => {
  const [bot, views, client] = await Promise.all([
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/bot/views.tsx'),
    readSource('src/ai/client.ts'),
  ])

  const liveVoiceQueue = bot.slice(bot.indexOf('const enqueueSpeech ='), bot.indexOf('const queueSpeechFromDelta ='))
  assert.match(liveVoiceQueue, /preferElevenLabsVoice: true/)
  assert.match(liveVoiceQueue, /allowBrowserFallback: true/)
  assert.match(liveVoiceQueue, /browserFallbackTimeoutMs: 900/)
  assert.match(liveVoiceQueue, /timeoutMs: 550/)
  assert.match(liveVoiceQueue, /browserFallbackOnly: true/)
  assert.match(bot, /ElevenLabs is the primary voice/)
  assert.match(bot, /textOnly: true/)
  assert.match(views, /preferElevenLabsVoice:\s*true/)
  assert.match(views, /allowBrowserFallback:\s*true/)
  assert.match(client, /options\.elevenLabsOnly \? '\/api\/speak-eleven-stream'/)
  assert.match(client, /options\.elevenLabsOnly \? '\/api\/speak-eleven'/)
  assert.match(client, /const transcript = String\(m\.transcript \|\| userText \|\| ''\)/)
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

  assert.match(server, /type: 'semantic_vad', eagerness: 'high'/)
  assert.match(bot, /recognition\.continuous = true/)
  assert.match(bot, /prefetchElevenLabsSpeech\(chunk, v\.ai/)
  assert.match(bot, /liveSilenceTimer\.current = window\.setTimeout/)
  assert.match(bot, /const threshold = firstChunk \? 24 : 54/)
  assert.match(bot, /}, 650\)/)
  assert.match(bot, /tier: 'quick'/)
  assert.match(server, /readTtsStreamChunk\(reader, controller, 4200\)/)
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

test('Automatic page-guide popups are removed and QuorlythBot loads only on explicit request', async () => {
  const app = await readSource('src/App.tsx')
  assert.doesNotMatch(app, /PageAssist|pageBotPrompt|page-assist|quorlyth:page-assist/)
  assert.doesNotMatch(app, /Warm the assistant chunk after the first paint/)
  assert.doesNotMatch(app, /setTimeout\(\(\) => \{\s*void loadQuorlythBot/)
  assert.doesNotMatch(app, /id="astl"[\s\S]{0,320}onPointerEnter=\{\(\) => \{ void loadQuorlythBot\(\)/)
  assert.match(app, /onFocus=\{\(\) => \{ void loadQuorlythBot\(\)/)
  assert.match(app, /onClick=\{\(\) => \{[\s\S]{0,180}openQuorlythBot\(\)/)
  assert.match(app, /const QuorlythBot = lazy\(loadQuorlythBot\)/)
  assert.doesNotMatch(app, /qbot-open-fallback/)
})

test('Heavy writing tools are lazy-loaded after the user focuses a textarea', async () => {
  const app = await readSource('src/App.tsx')
  const writingAssistant = await readSource('src/components/WritingAssistant.tsx')
  assert.match(app, /const WritingAssistant = lazy\(\(\) => import\('\.\/components\/WritingAssistant'\)/)
  assert.match(app, /writingAssistantMounted && <Suspense fallback=\{null\}><WritingAssistant \/><\/Suspense>/)
  assert.match(app, /onFirstTextareaFocus/)
  assert.match(writingAssistant, /activeElement instanceof HTMLTextAreaElement/)
})

test('Signed-out navigation remains visible and scrollable on narrow screens', async () => {
  const [app, nav, css] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/components/Nav.tsx'),
    readSource('src/styles/sitewide-bold-fluid.css'),
  ])
  assert.match(nav, /className="glass" id="nav"/)
  assert.match(nav, /data-auth-state=\{me \? "signed-in" : "signed-out"\}/)
  assert.match(nav, /return \['\/', '\/architecture', '\/demo', '\/signin'\]\.includes\(i\.path\)/)
  assert.doesNotMatch(nav, /nav-public/)
  assert.match(css, /One navigation shell for guests and signed-in accounts/)
  assert.match(css, /#nav \.navmain[\s\S]*?overflow-x: auto !important/)
  assert.match(css, /#nav \.navmain \.nav-item > span\s*\{\s*display: inline !important/)
  assert.match(css, /@media \(max-width: 540px\)/)
  assert.match(css, /min-height: 50px/)
  assert.doesNotMatch(css, /min-height: 84px/)
  assert.doesNotMatch(app, /PageAssist/)
})

test('Chat provider failover bounds stalled header and first-token waits', async () => {
  const server = await readSource('server/openai.mjs')
  assert.match(server, /Math\.min\(configured, 2200\)/)
  assert.match(server, /isTtsRequest \? 30000 : isGeminiRequest \? 4500 : 2400/)
  assert.match(server, /PROVIDER_FALLBACK_STATUSES = new Set\(\[401, 402, 403, 404, \.\.\.TRANSIENT_STATUSES\]\)/)
})

test('Sending a normal message commits its visible state before network awaits', async () => {
  const bot = await readSource('src/bot/QuorlythBot.tsx')
  assert.match(bot, /flushSync\(\(\) => \{/)
  assert.match(bot, /Commit the user's bubble and active state immediately/)
  assert.match(bot, /slice\(-8\)/)
  assert.match(bot, /recentTurns\.length - 1 \? 4200 : 900/)
})


test('Local development exposes the strict ElevenLabs streaming endpoint used by Live Talk', async () => {
  const dev = await readSource('server/dev-server.mjs')
  assert.match(dev, /speakElevenLabsStream/)
  assert.match(dev, /'\/api\/speak-eleven-stream': speakElevenLabsStream/)
})
