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

test('Voice Studio retries buffered cloud speech and reports device playback rejection', async () => {
  const [client, views] = await Promise.all([
    readSource('src/ai/client.ts'),
    readSource('src/bot/views.tsx'),
  ])
  assert.match(client, /onPlaybackError\?: \(error: Error\) => void/)
  assert.match(client, /retryBufferedSpeech = true/)
  assert.match(client, /const bufferedPath = options\.elevenLabsOnly \? '\/api\/speak-eleven' : '\/api\/speak'/)
  assert.match(client, /Your browser blocked device speech/)
  assert.match(client, /Device speech could not start/)
  assert.match(views, /helloStartTimer/)
  assert.match(views, /onPlaybackError: error =>/)
  assert.match(views, /Voice playback could not start\. Check your device audio and try again\./)
  assert.match(views, /Waiting for your device audio/)
})

test('ElevenLabs-only mode cannot be overridden by a browser fallback option', async () => {
  const client = await readSource('src/ai/client.ts')
  assert.match(client, /const allowBrowserFallback = options\.elevenLabsOnly !== true && options\.allowBrowserFallback === true/)
  assert.match(client, /if \(!allowBrowserFallback\)/)
})

test('Sign-in Hear a hello keeps the cloud preference without disabling its fallback routes', async () => {
  const [signIn, server, elevenStream, cloudStream] = await Promise.all([
    readSource('src/screens/SignIn.tsx'),
    readSource('server/openai.mjs'),
    readSource('api/speak-eleven-stream.js'),
    readSource('api/speak-stream.js'),
  ])
  const stage = signIn.slice(signIn.indexOf('function Stage('), signIn.indexOf('export function SignIn'))
  assert.match(stage, /elevenLabsOnly:\s*false/)
  assert.match(stage, /preferElevenLabsVoice:\s*true/)
  assert.match(stage, /allowBrowserFallback:\s*true/)
  assert.match(stage, /browserFallbackTimeoutMs:\s*1800/)
  assert.match(stage, /onPlaybackError:\s*error\s*=>/)
  assert.match(stage, /helloState === 'playing' \? 'Stop hello'/)
  assert.match(stage, /10_000[\s\S]*?const playback = await speakText/)
  assert.match(stage, /controller\.abort\(\)/)
  assert.doesNotMatch(stage, /elevenLabsOnly:\s*true/)
  assert.match(server, /Voice fallback chain: ElevenLabs by default, then Grok, Gemini, and OpenAI/)
  assert.match(elevenStream, /speakElevenLabsStream/)
  assert.match(cloudStream, /speakStream/)
})

test('Voice Studio cancels pending speech when its view unmounts and exposes a stop action', async () => {
  const views = await readSource('src/bot/views.tsx')
  assert.match(views, /const helloController = useRef<AbortController \| null>\(null\)/)
  assert.match(views, /helloController\.current\?\.abort\(\)/)
  assert.match(views, /useEffect\(\(\) => \(\) => clearHelloPlayback\(\), \[\]\)/)
  assert.match(views, /p\.view !== 'voice'[\s\S]*?clearHelloPlayback\(\)/)
  assert.match(views, /10_000[\s\S]*?const playback = await speakText/)
  assert.match(views, /stopNaturalVoicePreview\(\)/)
  assert.match(views, /signal: controller\.signal/)
})

test('Sign-in and Voice Studio use phone-specific layout and lower mobile WebGL costs', async () => {
  const [signInCss, voiceCss, orb, robot] = await Promise.all([
    readSource('src/styles/signin-performance.css'),
    readSource('src/styles/voice-studio-responsive.css'),
    readSource('src/bot/orb3d.ts'),
    readSource('src/bot/robot3d.ts'),
  ])
  assert.match(signInCss, /@media \(max-width: 540px\)/)
  assert.match(signInCss, /env\(safe-area-inset-bottom/)
  assert.match(signInCss, /\.q-signin-hello-status\.is-error/)
  assert.match(voiceCss, /@media \(max-width: 390px\)/)
  assert.match(voiceCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(orb, /lowPowerDevice/)
  assert.match(orb, /1000 \/ 30/)
  assert.match(robot, /lowPower/)
  assert.match(robot, /1000\/\(lowPower\?24:30\)/)
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

test('QuorlythBot stays lazy-loaded and uses the keyboard instead of a floating launcher', async () => {
  const [app, bot] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  assert.doesNotMatch(app, /PageAssist|pageBotPrompt|page-assist|quorlyth:page-assist/)
  assert.doesNotMatch(app, /Warm the assistant chunk after the first paint/)
  assert.doesNotMatch(app, /setTimeout\(\(\) => \{\s*void loadQuorlythBot/)
  assert.match(app, /e\.key\.toLowerCase\(\) === 'j'/)
  assert.match(app, /openQuorlythBot\(true\)/)
  assert.match(app, /const QuorlythBot = lazy\(loadQuorlythBot\)/)
  assert.match(app, /openRequest=\{botOpenRequest\}/)
  assert.doesNotMatch(app, /createPortal|data-quorlyth-launcher|id="astl"/)
  assert.doesNotMatch(bot, /id="astl"|QuorlythBotHead|qbot-launcher-restore/)
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
  assert.match(nav, /return \['\/', '\/architecture', '\/demo', '\/signin', '\/access'\]\.includes\(i\.path\)/)
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
  assert.ok(server.includes("const timeoutCap = isTtsRequest ? 30000 : isGeminiRequest ? 4500 : isDeepSeekRequest ? 15000 : 2400"))
  assert.ok(server.includes("process.env.AI_DEEPSEEK_PROVIDER_TIMEOUT_MS"))
  assert.ok(server.includes("const defaultTimeout = isTtsRequest ? 8000 : isGeminiRequest ? 4500 : isDeepSeekRequest ? 9000 : 2400"))
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
