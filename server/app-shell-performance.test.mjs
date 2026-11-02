import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('automatic Quorlyth page-guide popups are completely removed from the app shell', async () => {
  const app = await readSource('src/App.tsx')
  assert.doesNotMatch(app, /PageAssist|pageBotPrompt|openBotWithPrompt|page-assist|quorlyth:page-assist/)
})

test('QuorlythBot is not downloaded automatically during startup', async () => {
  const app = await readSource('src/App.tsx')
  assert.match(app, /const QuorlythBot = lazy\(loadQuorlythBot\)/)
  assert.doesNotMatch(app, /Warm the assistant chunk after the first paint/)
  assert.doesNotMatch(app, /setTimeout\(\(\) => \{\s*void loadQuorlythBot/)
  assert.match(app, /onPointerEnter=\{\(\) => \{ void loadQuorlythBot\(\)/)
  assert.match(app, /onClick=\{\(\) => \{[\s\S]{0,180}loadQuorlythBot\(\)/)
})

test('AI writing tools are downloaded only after a textarea is focused', async () => {
  const app = await readSource('src/App.tsx')
  const writing = await readSource('src/components/WritingAssistant.tsx')
  assert.match(app, /const WritingAssistant = lazy\(\(\) => import\('\.\/components\/WritingAssistant'\)/)
  assert.match(app, /onFirstTextareaFocus/)
  assert.match(app, /writingAssistantMounted && <Suspense fallback=\{null\}><WritingAssistant \/><\/Suspense>/)
  assert.match(writing, /activeElement instanceof HTMLTextAreaElement/)
})

test('the automation runtime is not mounted for signed-out visitors', async () => {
  const app = await readSource('src/App.tsx')
  assert.match(app, /const AutomationRuntime = lazy\(\(\) => import\('\.\/components\/AutomationRuntime'\)/)
  assert.match(app, /\(a\.me \|\| a\.demo\) && <Suspense fallback=\{null\}><AutomationRuntime \/><\/Suspense>/)
})

test('background realtime snapshots are scheduled as non-urgent updates', async () => {
  const provider = await readSource('src/data/AppProvider.tsx')
  assert.match(provider, /startTransition\(\(\) => setData\(d => \(\{ \.\.\.d, \[k\]: v \}\)\)\)/)
})

test('new AI-organizer milestones use an insert instead of an upsert', async () => {
  const [provider, supabase] = await Promise.all([
    readSource('src/data/AppProvider.tsx'),
    readSource('src/data/supabase.ts'),
  ])
  const start = provider.lastIndexOf('addMilestone: (projectId')
  const end = provider.indexOf('updateMilestone:', start)
  assert.ok(start >= 0 && end > start, 'milestone creation handler is present')
  const handler = provider.slice(start, end)
  assert.match(handler, /st!\.create\('milestones\/' \+ id/)
  assert.doesNotMatch(handler, /st!\.set\('milestones\/' \+ id/)
  assert.match(supabase, /async create\(path, data\)[\s\S]{0,180}sb\.from\('docs'\)\.insert/)
})

test('signed-out navigation stays visible and its links remain usable on mobile', async () => {
  const [nav, css] = await Promise.all([
    readSource('src/components/Nav.tsx'),
    readSource('src/styles/sitewide-bold-fluid.css'),
  ])
  assert.match(nav, /!me && "nav-public"/)
  assert.match(nav, /data-auth-state=\{me \? "signed-in" : "signed-out"\}/)
  assert.match(css, /#nav\.nav-public\[data-auth-state="signed-out"\][\s\S]{0,500}display: flex !important/)
  assert.match(css, /\.navmain[\s\S]{0,900}overflow-x: auto !important/)
  assert.match(css, /\.nav-item > span[\s\S]{0,160}display: inline !important/)
  assert.match(css, /@media \(max-width: 540px\)/)
})


test('heavy feature styles are split from the initial global stylesheet', async () => {
  const [main, messages, chatMedia, bot, automations] = await Promise.all([
    readSource('src/main.tsx'),
    readSource('src/screens/Messages.tsx'),
    readSource('src/components/ChatMedia.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/screens/Automations.tsx'),
  ])
  for (const globalStyle of [
    /styles\/messages\.css/,
    /styles\/messages-final\.css/,
    /styles\/messages-reference\.css/,
    /styles\/messages-neuroglass\.css/,
    /styles\/messages-icon-centering\.css/,
    /styles\/bot\.css/,
    /styles\/bot-composer-fluid-black\.css/,
    /styles\/automations\.css/,
  ]) assert.doesNotMatch(main, globalStyle)
  assert.match(messages, /styles\/messages\.css/)
  assert.match(messages, /styles\/messages-neuroglass\.css/)
  assert.match(chatMedia, /styles\/chat-media\.css/)
  assert.match(bot, /styles\/bot\.css/)
  assert.match(automations, /styles\/automations\.css/)
})

test('QuorlythBot theme metadata no longer pulls the Three.js renderer into the bot chunk', async () => {
  const [config, themes, robot3d, robot, bot] = await Promise.all([
    readSource('src/bot/config.ts'),
    readSource('src/bot/robot-themes.ts'),
    readSource('src/bot/robot3d.ts'),
    readSource('src/bot/Robot.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  assert.match(config, /from '\.\/robot-themes'/)
  assert.doesNotMatch(config, /from '\.\/robot3d'/)
  assert.match(themes, /export const THEMES/)
  assert.match(robot3d, /from ["']three["']/)
  assert.match(robot, /import\('\.\/robot3d'\)/)
  assert.match(bot, /<Robot[^>]+defer/)
})

test('the 3D Bot renderer is frame-limited and pauses while the tab is hidden', async () => {
  const robot3d = await readSource('src/bot/robot3d.ts')
  assert.match(robot3d, /1000\/40/)
  assert.match(robot3d, /document\.visibilityState/)
  assert.match(robot3d, /document\.removeEventListener\(["']visibilitychange["']/)
  assert.match(robot3d, /window\.innerWidth<=760\?1\.2:1\.45/)
})

test('the top navigation uses one active-state surface, not a duplicate animated pill', async () => {
  const [nav, css] = await Promise.all([
    readSource('src/components/Nav.tsx'),
    readSource('src/styles/app.css'),
  ])
  assert.doesNotMatch(nav, /nav-active-pill|activePill|useLayoutEffect/)
  assert.match(nav, /active\(i\.path\) && 'on'/)
  assert.match(css, /nav button\.on/)
})

test('QuorlythBot sidebar is narrower without removing its navigation', async () => {
  const css = await readSource('src/styles/bot.css')
  assert.match(css, /grid-template-columns:\s*minmax\(176px, 186px\) minmax\(0, 1fr\)/)
  assert.match(css, /width:\s*min\(224px, calc\(100% - 44px\)\)/)
  assert.match(css, /\.bs-l/)
})
