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

test('signed-in and signed-out users share one navigation shell while links remain role-filtered', async () => {
  const [nav, css] = await Promise.all([
    readSource('src/components/Nav.tsx'),
    readSource('src/styles/sitewide-bold-fluid.css'),
  ])
  assert.match(nav, /className="glass" id="nav"/)
  assert.match(nav, /data-auth-state=\{me \? "signed-in" : "signed-out"\}/)
  assert.match(nav, /if \(me && !app\.dataReady\) return false/)
  assert.match(nav, /return \['\/', '\/architecture', '\/demo', '\/signin'\]\.includes\(i\.path\)/)
  assert.doesNotMatch(nav, /nav-public/)
  assert.match(css, /One navigation shell for guests and signed-in accounts/)
  assert.match(css, /#nav \.navmain \.nav-item > span\s*\{\s*display: inline !important/)
  assert.match(css, /#nav \.navend \.srch/)
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
    /styles\/public-architecture\.css/,
    /styles\/backup-restore\.css/,
    /styles\/evidence-preview\.css/,
    /styles\/standalone-workspaces\.css/,
    /styles\/workspace-shell\.css/,
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
  assert.match(bot, /<Robot ref=\{robot\} theme=\{theme\}/)
})

test('the 3D Bot renderer is frame-limited and pauses while the tab is hidden', async () => {
  const robot3d = await readSource('src/bot/robot3d.ts')
  assert.match(robot3d, /1000\/40/)
  assert.match(robot3d, /document\.visibilityState/)
  assert.match(robot3d, /document\.removeEventListener\(["']visibilitychange["']/)
  assert.match(robot3d, /window\.innerWidth<=760\?1\.0:1\.25/)
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


test('feature-only CSS is not loaded until its route or component is used', async () => {
  const [main, architecture, messages, bot, automation] = await Promise.all([
    readSource('src/main.tsx'),
    readSource('src/screens/Architecture.tsx'),
    readSource('src/screens/Messages.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/screens/Automations.tsx'),
  ])
  assert.doesNotMatch(main, /styles\/(messages|bot|chat-media|automations|public-architecture)/)
  assert.match(architecture, /styles\/public-architecture\.css/)
  assert.match(messages, /styles\/messages\.css/)
  assert.match(bot, /styles\/bot\.css/)
  assert.match(automation, /styles\/automations\.css/)
  const architecturePage = await readSource('src/screens/Architecture.tsx')
  const workspacesPage = await readSource('src/screens/StandaloneWorkspaces.tsx')
  const projectsPage = await readSource('src/screens/Projects.tsx')
  const collaborationsPage = await readSource('src/screens/Collaborations.tsx')
  const evidence = await readSource('src/components/EvidencePreview.tsx')
  const backup = await readSource('src/components/BackupRestore.tsx')
  assert.match(architecturePage, /styles\/public-architecture\.css/)
  assert.match(workspacesPage, /styles\/standalone-workspaces\.css/)
  assert.match(projectsPage, /styles\/standalone-workspaces\.css/)
  assert.match(collaborationsPage, /styles\/workspace-shell\.css/)
  assert.match(evidence, /styles\/evidence-preview\.css/)
  assert.match(backup, /styles\/backup-restore\.css/)
})

test('navigation route chunks are preloaded once across hover, pointer-down and focus', async () => {
  const nav = await readSource('src/components/Nav.tsx')
  assert.match(nav, /const preloadedRoutes = new Set<string>\(\)/)
  assert.match(nav, /preloadedRoutes\.has\(key\)/)
  assert.match(nav, /preloadedRoutes\.add\(key\)/)
  assert.match(nav, /preloadedRoutes\.delete\(key\)/)
})

test('navigation has one selected surface and compact feedback timing', async () => {
  const motion = await readSource('src/styles/motion-system.css')
  const nav = await readSource('src/components/Nav.tsx')
  assert.doesNotMatch(nav, /nav-active-pill|activePill/)
  assert.match(motion, /\.nav-item\.on\s*\{[\s\S]*?border-color:\s*transparent !important/)
  assert.match(motion, /--qth-motion-fast:\s*120ms/)
  assert.match(motion, /main > \*\s*\{\s*animation-duration:\s*160ms/)
})

test('database realtime bursts are coalesced before reloading a collection', async () => {
  const supabase = await readSource('src/data/supabase.ts')
  assert.match(supabase, /refreshTimer = setTimeout\(\(\) => \{[\s\S]*?\}, 85\)/)
})

test('the first account snapshot is published only after every collection has loaded', async () => {
  const provider = await readSource('src/data/AppProvider.tsx')
  const app = await readSource('src/App.tsx')
  assert.doesNotMatch(provider, /APP_DATA_CACHE_PREFIX|readCachedAppData|writeCachedAppData/)
  assert.match(provider, /requiredKeys\.every\(required => received\.has\(required\)\)/)
  assert.match(provider, /startTransition\(\(\) => setData\(\{ \.\.\.EMPTY, \.\.\.staged \}\)\)/)
  assert.match(app, /a\.me && !a\.dataReady/)
  assert.match(app, /Loading your latest Quorlyth data/)
})

test('idle activity tracking throttles synchronous browser-storage writes', async () => {
  const provider = await readSource('src/data/AppProvider.tsx')
  assert.match(provider, /lastActivity - lastPersistedActivity >= 15_000/)
  assert.doesNotMatch(provider, /const markActivity = \(\) => \{\s*localStorage\.setItem/)
  assert.match(provider, /window\.addEventListener\('scroll', markActivity, \{ passive: true \}\)/)
})

test('QuorlythBot private chats are scoped to the current account during render', async () => {
  const botData = await readSource('src/bot/useBotData.ts')
  assert.match(botData, /snapshot\.owner === base/)
  assert.match(botData, /setSnapshot\(\{ owner, docs: next \}\)/)
  assert.doesNotMatch(botData, /setDocs\(/)
})

test('the 3D bot animation loop pauses when its view is inactive', async () => {
  const [robot, renderer, bot] = await Promise.all([
    readSource('src/bot/Robot.tsx'),
    readSource('src/bot/robot3d.ts'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  assert.match(robot, /active\?: boolean/)
  assert.match(renderer, /active:function\(v\)/)
  assert.match(renderer, /alive&&active&&document\.visibilityState/)
  assert.match(bot, /active=\{!minimized/)
})

test('QuorlythBot uses a narrower sidebar and a lower GPU pixel ratio', async () => {
  const [css, renderer] = await Promise.all([
    readSource('src/styles/bot.css'),
    readSource('src/bot/robot3d.ts'),
  ])
  assert.match(css, /grid-template-columns:\s*minmax\(176px, 186px\) minmax\(0, 1fr\)/)
  assert.match(renderer, /window\.innerWidth<=760\?1\.0:1\.25/)
  assert.match(renderer, /1000\/40/)
})
