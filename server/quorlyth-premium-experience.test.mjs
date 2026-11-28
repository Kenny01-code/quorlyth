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

test('homepage follows the linked reference and leaves the separate copper cover unmounted', async () => {
  const [landing, stage, scene, coverCss, entry] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/components/CreatorCoverStage.tsx'),
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/cover-burnt-orange.css'),
    source('src/main.tsx'),
  ])

  assert.doesNotMatch(landing, /CreatorCoverStage/)
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
  assert.doesNotMatch(entry, /styles\/cover-burnt-orange\.css/)
  assert.doesNotMatch(entry, /from ['"]\.\/components\/creatorCoverScene['"]/)
})


test('sign-in keeps the porcelain styling and shows only a live animated local clock', async () => {
  const [signIn, signInCss, clock, clockScene, oldLuxuryCss] = await Promise.all([
    source('src/screens/SignIn.tsx'),
    source('src/styles/signin-clock.css'),
    source('src/components/SignInClock.tsx'),
    source('src/components/signinClockScene.ts'),
    source('src/styles/signin-luxury.css'),
  ])

  assert.ok(signIn.includes('<SignInClock />'))
  assert.ok(signIn.includes("signin-clock.css"))
  assert.ok(!signIn.includes('SignInGlobe'))
  assert.ok(!signIn.includes('LocalContextPreview'))
  assert.ok(!signIn.includes('getSignInRegion'))
  assert.ok(!signIn.toLowerCase().includes('openstreetmap'))
  assert.ok(!signIn.includes('navigator.geolocation'))
  assert.ok(clock.includes('Intl.DateTimeFormat'))
  assert.ok(clock.includes('setInterval(update, 1000)'))
  assert.ok(clock.includes("import('./signinClockScene')"))
  assert.ok(clock.includes('IntersectionObserver'))
  assert.ok(clockScene.includes("from 'three'"))
  assert.ok(clockScene.includes('hourHand.rotation.z'))
  assert.ok(clockScene.includes('minuteHand.rotation.z'))
  assert.ok(clockScene.includes('secondHand.rotation.z'))
  assert.ok(clockScene.includes('new Date()'))
  assert.ok(clockScene.includes('prefers-reduced-motion'))
  assert.ok(clockScene.includes('document.visibilityState'))
  assert.ok(clockScene.includes('renderer.dispose()'))
  assert.ok(signInCss.includes('#fffefa'))
  assert.ok(signInCss.includes('q-signin-clock__canvas'))
  assert.ok(oldLuxuryCss.includes('.lg > .fm'))
  assert.ok(!oldLuxuryCss.includes('q-signin-live-context'))
  assert.ok(!oldLuxuryCss.includes('q-signin-mini-map'))
})

test('community cover styles provide eight burnt-copper Three.js scenes with saved selection', async () => {
  const [communities, stage, scene, css] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/components/CommunityCoverStage.tsx'),
    source('src/components/creatorCoverScene.ts'),
    source('src/styles/community-cover-three.css'),
  ])

  for (const key of ["key: 'a'", "key: 'b'", "key: 'c'", "key: 'd'", "key: 'e'", "key: 'f'", "key: 'g'", "key: 'h'"]) {
    assert.ok(communities.includes(key), 'Missing cover ' + key)
  }
  assert.ok(communities.includes('CoverStylePicker value={f.cover}'))
  assert.ok(communities.includes('a.saveCommunity(c.id, { cover: key })'))
  assert.ok(communities.includes("<CommunityCoverStage coverStyle={c.cover || 'a'} />"))
  assert.ok(stage.includes('mountCreatorCoverScene(surface, element, coverStyle)'))
  assert.ok(stage.includes('}, [coverStyle])'))
  for (const key of ['b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    assert.ok(scene.includes("activeStyle === '" + key + "'"), 'Missing Three.js scene ' + key)
  }
  assert.ok(scene.includes('TorusKnotGeometry'))
  assert.ok(scene.includes('IcosahedronGeometry'))
  assert.ok(scene.includes('OctahedronGeometry'))
  assert.ok(scene.includes('prefers-reduced-motion'))
  assert.ok(scene.includes('document.visibilityState'))
  assert.ok(scene.includes('renderer.dispose()'))
  assert.ok(css.includes('cover-option__check'))
  assert.ok(css.includes('#d16a43'))
  assert.ok(css.includes('prefers-reduced-motion: reduce'))
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


test('QuorlythBot full-page chat has one dark composer surface, full-width assistant messages and a collision-free header', async () => {
  const css = await source('src/styles/bot-premium-chat.css')
  assert.match(css, /qbot-fullpage\.qbot-reference-layout\.qbot-has-messages > \.bm > \.bc\.qbot-home-composer[\s\S]*?background: #08090b !important/)
  assert.match(css, /qbot-fullpage\.qbot-reference-layout\.qbot-has-messages > \.bm > \.bc\.qbot-home-composer::before[\s\S]*?display: none !important/)
  assert.match(css, /qbot-reference-composer-home::before[\s\S]*?display: none !important/)
  assert.match(css, /qbot-conversation > \.ast-log > \.am\.ma[\s\S]*?width: 100% !important/)
  assert.match(css, /qbot-assistant-message \.mact button[\s\S]*?white-space: nowrap !important/)
  assert.match(css, /grid-template-areas: "menu title tabs status actions"/)
  assert.match(css, /grid-template-areas:[\s\S]*?"menu title status actions"/)
  assert.match(css, /@media \(max-width: 390px\)/)
})

test('the service worker drops the previous cache-first style bundle on update', async () => {
  const worker = await source('public/sw.js')
  assert.match(worker, /const CACHE = 'quorlyth-shell-v2'/)
  assert.doesNotMatch(worker, /quorlyth-shell-v1/)
  assert.match(worker, /key\.startsWith\('quorlyth-shell-'\) && key !== CACHE/)
  assert.match(worker, /self\.skipWaiting\(\)/)
  assert.match(worker, /self\.clients\.claim\(\)/)
})
