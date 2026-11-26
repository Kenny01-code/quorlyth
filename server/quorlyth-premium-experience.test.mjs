import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot uses one assistant identity and keeps Smart mode out of the interface', async () => {
  const [bot, views, config] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/bot/views.tsx'),
    source('src/bot/config.ts'),
  ])

  assert.ok(bot.includes('qbot-core-brand'))
  assert.ok(bot.includes('qbot-compose-live'))
  assert.doesNotMatch(bot, /qbot-core-selector|qbot-model-switch|Quorlyth Smart/)
  assert.doesNotMatch(views, /label="Thinking"|Thorough/)
  assert.doesNotMatch(views, /model:\s*'smart'/)
  assert.match(config, /model:\s*'quick'/)
  assert.match(bot, /void bd\.saveSettings\(\{ model: 'quick' \}\)/)
})

test('the Bot composer keeps Live Talk visible, evenly spaced and independent on hover', async () => {
  const [bot, css] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-premium-chat.css'),
  ])

  assert.match(bot, /className=\{cn\('btn', 'qbot-compose-live'/)
  assert.match(css, /grid-template-columns: 42px minmax\(0,1fr\) 42px 42px 46px/)
  assert.match(css, /\.qbot-compose-live[\s\S]*?display: inline-grid !important;/)
  assert.match(css, /qbot-compose-live:is\(:hover,:focus-visible,.rec\)/)
  assert.match(css, /qbot-compose-mic[\s\S]*?transform: none !important;/)
  assert.match(css, /qbot-compose-send:is\(:hover,:focus-visible\):not\(:disabled\)/)
  assert.match(css, /@media \(max-width: 390px\)/)
})

test('QuorlythBot chat, composer and every workspace stay on the original dark palette', async () => {
  const css = await source('src/styles/bot-premium-chat.css')

  assert.match(css, /qbot-chat-surface[\s\S]*?linear-gradient\(180deg, #0b0c0e 0%, #090a0c 100%\)/)
  assert.match(css, /qbot-assistant-message[\s\S]*?background:[\s\S]*?#111316/)
  assert.match(css, /qbot-home-composer[\s\S]*?background: #090a0c !important/)
  assert.match(css, /qbot-conversation:not\(\.qbot-chat-surface\):not\(\.qbot-robot-studio-shell\)/)
  assert.match(css, /qbot-robot-studio-shell[\s\S]*?background: #08090b/)
  assert.match(css, /\.mact button[\s\S]*?flex: 0 0 auto !important/)
  assert.match(css, /white-space: nowrap !important/)
  assert.match(css, /\.qbot-reference-tabs[\s\S]*?position: relative !important/)
  assert.doesNotMatch(css, /#f7f3ec|#f1ebe1|#fffefa|#f3ede5|#f2ece3|#eae1d7/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('landing hero loads its premium copper Three.js sculpture only near the viewport', async () => {
  const [landing, stage, scene, coverCss, entry] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/components/CreatorCoverStage.tsx'),
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/cover-burnt-orange.css'),
    source('src/main.tsx'),
  ])

  assert.match(landing, /<CreatorCoverStage \/>/)
  assert.match(stage, /IntersectionObserver/)
  assert.match(stage, /import\('\.\/creatorCoverScene'\)/)
  assert.match(stage, /rootMargin: '180px 0px'/)
  assert.match(stage, /requestIdleCallback/)
  assert.match(stage, /cancelScheduledMount/)
  assert.match(stage, /setTimeout\(\(\) => \{ void mount\(\) \}, 240\)/)
  assert.match(scene, /from 'three'/)
  assert.match(scene, /TorusKnotGeometry/)
  assert.match(scene, /new Color\(0x9e4327\)/)
  assert.match(scene, /powerPreference: lowPower \? 'low-power' : 'high-performance'/)
  assert.match(scene, /prefers-reduced-motion/)
  assert.match(scene, /document\.visibilityState/)
  assert.match(scene, /renderer\.dispose\(\)/)
  assert.match(coverCss, /@media \(max-width: 760px\)/)
  assert.match(coverCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(entry, /styles\/cover-burnt-orange\.css/)
  assert.doesNotMatch(entry, /from ['"]\.\/components\/creatorCoverScene['"]/)
})


test('Sign-in robot recognizes account-specific returns and shows live local context safely', async () => {
  const [signIn, bot, signInCss] = await Promise.all([
    source('src/screens/SignIn.tsx'),
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/signin-luxury.css'),
  ])

  assert.match(signIn, /function signinWelcomeKey\(identity\?: string\)/)
  assert.match(signIn, /quorlyth:signin-welcomed:v2:/)
  assert.match(signIn, /function LocalContextPreview\(\)/)
  assert.match(signIn, /setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/)
  assert.match(signIn, /addEventListener\('online', sync\)/)
  assert.match(signIn, /addEventListener\('offline', sync\)/)
  assert.match(signIn, /Region is estimated from your device time zone\. No GPS location is accessed\./)
  assert.match(signIn, /q-signin-mini-map/)
  assert.match(signIn, /className="q-signin-mini-map" role="img"/)
  assert.match(signIn, /firstTimeOverride=\{!!me\.createdAt/)
  assert.match(signIn, /accountKey=\{me\.email\}/)
  assert.match(signIn, /firstTimeOverride=\{mode === 'signup'\}/)
  assert.match(signIn, /You are offline\. Reconnect to sign in\./)
  assert.doesNotMatch(signIn, /markSigninWelcome\(signedInUser\.id\)/)
  assert.match(signIn, /navigator\.onLine/)
  assert.match(bot, /accountCreatedAt = Number\(a\.me\?\.createdAt \|\| 0\)/)
  assert.match(bot, /accountIsNew/)
  assert.match(bot, /qbot:welcomed:v1:/)
  assert.match(bot, /quorlyth:signin-welcomed:v2:/)
  assert.match(signInCss, /\.q-signin-live-context/)
  assert.match(signInCss, /@media \(max-width: 540px\)/)
})

test('QuorlythBot keeps Live Talk distinct and reports connection state on every assistant page', async () => {
  const [bot, css] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/styles/bot-premium-chat.css'),
  ])

  assert.match(bot, /networkOnline, setNetworkOnline/)
  assert.match(bot, /addEventListener\('online', syncNetwork\)/)
  assert.match(bot, /addEventListener\('offline', syncNetwork\)/)
  assert.match(bot, /qbot-network-indicator/)
  assert.match(bot, /aria-label=\{live \? 'End Live Talk' : 'Start Live Talk'\}/)
  assert.match(bot, /Icon name=\{live \? 'mic' : 'audio-lines'\}/)
  assert.match(css, /\.qbot-compose-mic:is\(:hover,:focus-visible\)/)
  assert.match(css, /\.qbot-compose-live:is\(:hover,:focus-visible,.rec\)/)
  assert.match(css, /\.qbot-compose-send:is\(:hover,:focus-visible\):not\(:disabled\)/)
  assert.match(css, /\.qbot-network-indicator\.is-offline/)
  assert.match(css, /grid-template-columns: 36px minmax\(0,1fr\) 36px 36px 40px/)
  assert.match(css, /background: #090a0c !important/)
  assert.doesNotMatch(css, /#fffefa|#f7f3ec|#f2ece3|#eae1d7/)
  assert.match(css, /qbot-conversation:not\(\.qbot-chat-surface\):not\(\.qbot-robot-studio-shell\)/)
})

test('burnt-orange Three.js cover adds sculptural depth without removing performance guards', async () => {
  const [scene, coverCss, stage] = await Promise.all([
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/cover-burnt-orange.css'),
    source('src/components/CreatorCoverStage.tsx'),
  ])

  assert.match(scene, /signalCore/)
  assert.match(scene, /orbitTrace/)
  assert.match(scene, /satelliteGeometry/)
  assert.match(scene, /lowPower \? 24 : 40/)
  assert.match(scene, /prefers-reduced-motion/)
  assert.match(scene, /document\.visibilityState/)
  assert.match(scene, /renderer\.dispose\(\)/)
  assert.match(coverCss, /\.qth-cover-stage::before/)
  assert.match(coverCss, /@media \(max-width: 760px\)/)
  assert.match(coverCss, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(stage, /IntersectionObserver/)
  assert.match(stage, /import\('\.\/creatorCoverScene'\)/)
})


test('sign-in actions explain network failures without exposing raw browser fetch errors', async () => {
  const signIn = await source('src/screens/SignIn.tsx')
  assert.match(signIn, /function friendlyAuthError\(error: unknown, fallback: string\)/)
  assert.match(signIn, /You are offline\. Reconnect to the internet and try again\./)
  assert.match(signIn, /Quorlyth could not reach the sign-in service\./)
  assert.match(signIn, /toast\(friendlyAuthError\(er,/)
})
