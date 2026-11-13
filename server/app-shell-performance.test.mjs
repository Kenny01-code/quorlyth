import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('automatic Quorlyth page-guide popups are completely removed from the app shell', async () => {
  const app = await readSource('src/App.tsx')
  assert.doesNotMatch(app, /PageAssist|pageBotPrompt|openBotWithPrompt|page-assist|quorlyth:page-assist/)
})

test('lazy route navigation shows a reduced-motion-aware loading surface instead of a blank section', async () => {
  const [app, styles] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/styles/app.css'),
  ])
  assert.match(app, /function RouteLoadingFallback\(\)/)
  assert.match(app, /<Suspense fallback=\{<RouteLoadingFallback \/>\}>[\s\S]{0,80}<Routes>/)
  assert.match(app, /className="qth-route-loading" role="status"/)
  assert.match(styles, /\.qth-route-loading-grid/)
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)[\s\S]*qth-route-loading/)
})

test('QuorlythBot opens automatically after the welcome and account are ready', async () => {
  const app = await readSource('src/App.tsx')
  assert.ok(app.includes('const QuorlythBot = lazy(loadQuorlythBot)'))
  assert.ok(app.includes('Open QuorlythBot automatically once the welcome screen and account sync are'))
  assert.ok(app.includes("const identity = a.me?.id || (a.demo ? 'demo' : 'visitor')"))
  assert.ok(app.includes("if (!a.ready || a.startupError || intro || loc.pathname === '/signin') return"))
  assert.ok(app.includes('if (a.me && (!a.dataReady || !a.platformRolesReady)) return'))
  assert.ok(app.includes('void openQuorlythBot()'))
  assert.ok(app.includes('!intro && !botLoading && !botMounted && createPortal('))
  assert.doesNotMatch(app, /Warm the assistant chunk after the first paint/)
  assert.doesNotMatch(app, /setTimeout\(\(\) => \{\s*void loadQuorlythBot/)
})

test('the QuorlythBot launcher stays visible in a body portal until its lazy-loaded module is ready', async () => {
  const [app, css, bot] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/styles/app.css'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  const openStart = app.indexOf('const openQuorlythBot = useCallback')
  assert.ok(openStart >= 0, 'the shared launcher opener exists')
  const helper = app.slice(openStart, app.indexOf('// Load the AI writing helper', openStart))
  assert.ok(helper.indexOf('await loadQuorlythBot()') < helper.indexOf('setBotMounted(true)'), 'the bot mounts only after its module resolves')
  assert.match(app, /createPortal\\(/)
  assert.match(app, /document\\.body/)
  assert.match(app, /data-quorlyth-launcher/)
  assert.match(app, /botLauncherHidden \\? \\([\\s\\S]*?qbot-launcher-restore/)
  assert.match(app, /botLoadError && <div className="qbot-launcher-load-error"/)
  assert.doesNotMatch(app, /deferredLauncherHidden|deferredHoldTimer|onPointerDown=/)
  assert.match(app, /onContextMenu=\\{event => \\{[\\s\\S]{0,220}qbot-launcher-hidden-v1/)
  assert.match(css, /#astl\\.astl\\s*\\{[\\s\\S]{0,300}position: fixed !important/)
  assert.match(css, /#astl\\.astl::before/)
  assert.match(css, /z-index: 110 !important/)
  const launcherStart = bot.indexOf('id="astl"')
  const launcherEnd = bot.indexOf('</button>', launcherStart)
  assert.ok(launcherStart >= 0 && launcherEnd > launcherStart, 'the mounted bot renders its own persistent launcher')
  const launcher = bot.slice(launcherStart, launcherEnd)
  assert.match(launcher, /onClick=\\{openPanel\\}/)
  assert.match(launcher, /onContextMenu=/)
  assert.doesNotMatch(launcher, /onPointerDown|onPointerUp/)
  assert.match(bot, /launcherHidden \\? \\([\\s\\S]*?qbot-launcher-restore/)
  assert.match(bot, /setLauncherHidden\\(true\\)/)
  assert.doesNotMatch(bot, /startLauncherHold|launcherLongPressTriggered/)
})
test('the landing page rotates both approved support lines with the editorial reveal', async () => {
  const [landing, styles] = await Promise.all([
    readSource('src/screens/Landing.tsx'),
    readSource('src/styles/extra.css'),
  ])
  assert.match(landing, /ROTATING_SUPPORT_COPY = \[HERO_COPY\.support, PREVIEW_COPY\.support\]/)
  assert.match(landing, /function RotatingEditorialCopy/)
  assert.match(landing, /window\.setInterval/)
  assert.match(landing, /<RotatingEditorialCopy initialIndex=\{0\} \/>/)
  assert.match(landing, /<RotatingEditorialCopy initialIndex=\{1\} \/>/)
  assert.match(styles, /qth-copy-rotator/)
  assert.match(styles, /qthEditorialWordReveal/)
})

test('the Live Talk hotkey uses the same safe launcher handoff', async () => {
  const app = await readSource('src/App.tsx')
  assert.match(app, /void openQuorlythBot\(true\)/)
  assert.doesNotMatch(app, /setBotMounted\(true\)[\s\S]{0,120}loadQuorlythBot\(\)\.catch/)
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
  assert.match(app, /\(a\.me \|\| a\.demo\) && \(!a\.me \|\| a\.demo \|\| \(a\.dataReady && a\.platformRolesReady\)\) && <Suspense fallback=\{null\}><AutomationRuntime \/><\/Suspense>/)
})

test('background realtime snapshots are scheduled as non-urgent updates', async () => {
  const provider = await readSource('src/data/AppProvider.tsx')
  assert.match(provider, /startTransition\(\(\) => setData\(current => \(\{ \.\.\.current, \[key\]: value \}\)\)\)/)
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
  assert.match(nav, /data-loading=\{loading \? "true" : "false"\}/)
  assert.match(nav, /if \(me && \(!app\.dataReady \|\| !app\.platformRolesReady\)\) return false/)
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
  assert.match(messages, /styles\/messages-room\.css/)
  assert.match(chatMedia, /styles\/chat-media\.css/)
  assert.match(bot, /styles\/bot\.css/)
  assert.match(bot, /styles\/bot-room-theme\.css/)
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
  assert.match(bot, /<Robot\s+ref=\{robot\}\s+theme=\{theme\}/)
})

test('the 3D Bot renderer is frame-limited and pauses while the tab is hidden', async () => {
  const robot3d = await readSource('src/bot/robot3d.ts')
  assert.ok(robot3d.includes('1000/30'))
  assert.match(robot3d, /document\.visibilityState/)
  assert.match(robot3d, /document\.removeEventListener\(["']visibilitychange["']/)
  assert.ok(robot3d.includes('window.devicePixelRatio||1,1.0'))
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

test('QuorlythBot sidebar uses a professional readable width without removing navigation', async () => {
  const css = await readSource('src/styles/bot.css')
  assert.match(css, /grid-template-columns:\s*minmax\(248px, 264px\) minmax\(0, 1fr\)/)
  assert.match(css, /width:\s*min\(304px, calc\(100% - 36px\)\)/)
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
  assert.match(provider, /startTransition\(\(\) => \{\s*setData\(\{ \.\.\.EMPTY, \.\.\.staged \}\)\s*setInitialDataSnapshot\(\{ backend, userId, ready: true \}\)/)
  assert.match(app, /a.me && (!a.dataReady || !a.platformRolesReady)/)
  assert.match(app, /Syncing your workspace/)
  assert.doesNotMatch(app, /QuorlythLoader|DelayedRouteLoader|q-loader/)
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

test('QuorlythBot keeps a readable sidebar width and a lower GPU pixel ratio', async () => {
  const [css, renderer] = await Promise.all([
    readSource('src/styles/bot.css'),
    readSource('src/bot/robot3d.ts'),
  ])
  assert.match(css, /grid-template-columns:\s*minmax\(248px, 264px\) minmax\(0, 1fr\)/)
  assert.ok(renderer.includes('window.devicePixelRatio||1,1.0'))
  assert.ok(renderer.includes('1000/30'))
})

test('top navigation retains the compact 50px shell rather than an oversized header', async () => {
  const css = await readSource('src/styles/sitewide-bold-fluid.css')
  assert.match(css, /min-height: 50px/)
  assert.match(css, /font-size: 11px !important/)
  assert.match(css, /min-width: 128px/)
  assert.doesNotMatch(css, /min-height: 84px|font-size: 14px !important/)
})

test('shared glass surfaces avoid the global turbulence texture and oversized backdrop blur', async () => {
  const css = await readSource('src/styles/app.css')
  assert.doesNotMatch(css, /feTurbulence|var\(--grain\)|\.glass:after/)
  assert.match(css, /backdrop-filter:blur\(10px\) saturate\(118%\)/)
  assert.match(css, /transition:transform \.16s ease/)
  assert.doesNotMatch(css, /\.astl:before|animation:astb|@keyframes astb/)
  assert.match(css, /\.astl\{[^}]*animation:none/)
})

test('global motion does not continuously animate the full-screen background or glass shadows', async () => {
  const motion = await readSource('src/styles/motion-system.css')
  const liquid = await readSource('src/styles/sitewide-liquid-glass.css')
  assert.doesNotMatch(motion, /body:before \{ animation: qth-ambient-breathe/)
  assert.match(motion, /\.glass\s*\{[\s\S]{0,260}transition: transform var\(--qth-motion-fast\)/)
  assert.match(liquid, /#nav \.lgb svg\.lm\s*\{[\s\S]{0,100}animation: none !important/)
  assert.match(liquid, /#nav b\.nav-wordmark > span\s*\{[\s\S]{0,450}animation: none !important/)
})

test('initial Supabase identity uses verified JWT claims before a server user lookup', async () => {
  const backend = await readSource('src/backend.ts')
  const start = backend.indexOf('const auth: Auth = {')
  const end = backend.indexOf('onChange(cb)', start)
  assert.ok(start >= 0 && end > start, 'Supabase auth adapter is present')
  const current = backend.slice(start, end)
  assert.match(current, /async current\(\)[\s\S]*?sb\.auth\.getSession\(\)/)
  assert.match(current, /sb\.auth\.getClaims\(\)/)
  assert.match(current, /id: claims\.sub/)
  assert.match(current, /user_metadata: claims\.user_metadata/)
  assert.match(current, /if \(error\)[\s\S]*?sb\.auth\.getUser\(\)/)
  assert.match(current, /created_at: session\.user\?\.created_at/)
})

test('daily growth telemetry waits until core data hydration and uses one server-derived write', async () => {
  const [provider, supabase] = await Promise.all([
    readSource('src/data/AppProvider.tsx'),
    readSource('src/data/supabase.ts'),
  ])
  assert.match(provider, /backend\.auth\.mode !== 'supabase' \|\| !dataScopeReady/)
  assert.match(provider, /trackGrowthEvent\('active_day'\)/)
  assert.doesNotMatch(provider, /trackGrowthEvent\('active_day', utcDay\)/)
  assert.match(supabase, /if \(eventName === 'active_day'\)[\s\S]{0,220}sb\.rpc\('track_active_day'\)/)
})

test('dashboard chart code is not forced into the initial shared entry chunk', async () => {
  const [vite, dashboard, app, analytics] = await Promise.all([
    readSource('vite.config.ts'),
    readSource('src/screens/Dashboard.tsx'),
    readSource('src/App.tsx'),
    readSource('src/screens/Analytics.tsx'),
  ])
  assert.doesNotMatch(vite, /src\/components\/Charts\.tsx.*return ['"]charts['"]/)
  assert.doesNotMatch(vite, /node_modules\/jspdf\/.*return ['"]pdf-export['"] /)
  assert.match(dashboard, /from ['"]\.\.\/components\/Charts['"]/)
  assert.match(app, /const Dashboard = lazy\(\(\) => import\('\.\/screens\/Dashboard'\)/)
  assert.match(analytics, /await import\('jspdf'\)/)
})


test('the branded animated loader is removed from startup, data hydration, lazy routes, and dashboard setup', async () => {
  const [app, main, dashboard] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/main.tsx'),
    readSource('src/screens/Dashboard.tsx'),
  ])
  assert.doesNotMatch(app, /QuorlythLoader|DelayedRouteLoader|q-loader/)
  assert.doesNotMatch(dashboard, /QuorlythLoader|q-loader/)
  assert.match(app, /if \(!a\.ready && loc\.pathname === '\/'\)[\s\S]{0,180}<Landing \/>/)
  assert.match(app, /if \(!a\.ready\)[\s\S]{0,220}className="app-startup"/)
  assert.match(app, /<Suspense fallback=\{null\}>/)
  assert.match(dashboard, /Verifying your dashboard access/)
  assert.doesNotMatch(main, /styles\/loader\.css/)
})

test('deadline-reached automation is a one-time persistent worker event', async () => {
  const [automation, screen, migration] = await Promise.all([
    readSource('src/lib/automation.ts'),
    readSource('src/screens/Automations.tsx'),
    readSource('supabase/migrations/20261107133000_deadline_reached_automation.sql'),
  ])
  assert.match(automation, /'deadline\.reached'/)
  assert.match(automation, /event\.entityType/)
  assert.match(screen, /trigger: 'deadline\.reached'/)
  assert.match(screen, /does not wait for or simulate a real project deadline/)
  assert.match(migration, /enqueue_due_automation_events/)
  assert.match(migration, /automation_deadline_dispatches/)
  assert.match(migration, /'deadline\.reached'/)
  assert.match(migration, /deadline_at_ms/)
})


test('homepage renders before authentication while the full intro is reserved for new visitors', async () => {
  const [app, landing, styles] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/screens/Landing.tsx'),
    readSource('src/styles/sitewide-bold-fluid.css'),
  ])
  assert.match(app, /import \{ Landing \} from '\.\/screens\/Landing'/)
  assert.ok(app.includes('const [intro, setIntro] = useState(() =>'))
  assert.ok(app.includes("localStorage.getItem('qintro') !== '1'"))
  assert.ok(app.includes("localStorage.getItem('qseen') !== '1'"))
  assert.match(app, /if \(!a\.ready && loc\.pathname === '\/'\)[\s\S]{0,180}<Landing \/>/)
  assert.match(landing, /disabled=\{!ready\}/)
  assert.match(styles, /qthEditorialWordRevealLite/)
  assert.match(styles, /@media \(max-width: 860px\)[\s\S]{0,260}backdrop-filter: none !important/)
})


test('automation run history can be cleared without deleting workflows or notifications', async () => {
  const automations = await readSource('src/screens/Automations.tsx')
  assert.match(automations, /async function clearAutomationHistory/)
  assert.match(automations, /store\.delete\('data\/users\/' \+ userId \+ '\/automation-runs'\)/)
  assert.match(automations, /runHistory: \[\]/)
  assert.match(automations, /lastRunAt: null/)
  assert.match(automations, /Clear all history/)
  assert.match(automations, /Your workflows, active\/draft status, and automation notifications will remain/)
})

test('the QuorlythBot launcher toggles visibility by right-click, with a reversible restore hotspot', async () => {
  const [app, bot] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  assert.ok(app.includes('const [botLauncherHidden, setBotLauncherHidden]'))
  assert.ok(app.includes('!intro && !botLoading && !botMounted && createPortal('))
  assert.ok(app.includes('botLauncherHidden ? ('))
  assert.ok(app.includes('className="qbot-launcher-restore"'))
  assert.ok(app.includes('Right-click or click to show QuorlythBot'))
  assert.ok(app.includes('onContextMenu='))
  assert.ok(app.includes('launcherWasHidden || botLauncherHidden'))
  assert.ok(app.includes('quorlyth:launcher-restore'))
  assert.ok(bot.includes('const [launcherHidden, setLauncherHidden]'))
  assert.ok(bot.includes('launcherHidden ? ('))
  assert.ok(bot.includes('className="qbot-launcher-restore"'))
  assert.ok(bot.includes('Right-click or click to show QuorlythBot'))
  assert.ok(bot.includes('onContextMenu='))
  assert.ok(bot.includes("sessionStorage.setItem('qbot-launcher-hidden-v1', '1')"))
  assert.ok(bot.includes("sessionStorage.removeItem('qbot-launcher-hidden-v1')"))
})
test('search palette writeups, result labels and icons use high-contrast orange and bone colors', async () => {
  const [palette, styles] = await Promise.all([
    readSource('src/components/Palette.tsx'),
    readSource('src/styles/contrast-system.css'),
  ])
  assert.ok(palette.includes("className={cn('rr'"))
  assert.ok(palette.includes('className="gh"'))
  assert.ok(styles.includes('#cmd .rr h3'))
  assert.ok(styles.includes('#cmd .rr > svg'))
  assert.ok(styles.includes('#cmd .rr p'))
  assert.ok(styles.includes('#fff7ef'))
  assert.ok(styles.includes('#ffad78'))
  assert.ok(styles.includes('#dfcaba'))
})

test('the robot loading state never renders a miniature duplicate character', async () => {
  const [robot, styles, signIn] = await Promise.all([
    readSource('src/bot/Robot.tsx'),
    readSource('src/styles/bot-room-theme.css'),
    readSource('src/screens/SignIn.tsx'),
  ])
  assert.ok(!robot.includes('qbot-robot-fallback-art'))
  assert.ok(!robot.includes('qbot-robot-fallback-head'))
  assert.ok(robot.includes('qbot-robot-loading-glow'))
  assert.ok(styles.includes('.qbot-robot-loading-glow::before'))
  assert.ok(signIn.includes('<Robot ref={r} defer'))
})
test('the full branded intro is reserved for first-time visitors', async () => {
  const app = await readSource('src/App.tsx')
  assert.ok(app.includes("localStorage.getItem('qintro') !== '1'"))
  assert.ok(app.includes("localStorage.getItem('qseen') !== '1'"))
  assert.ok(app.includes("localStorage.getItem('qintro') !== '1'"))
  assert.ok(app.includes('const [intro, setIntro] = useState(() =>'))
})

test('QuorlythBot keeps text streaming while applying a short voice deadline and fallback', async () => {
  const [bot, client] = await Promise.all([
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/ai/client.ts'),
  ])
  assert.match(bot, /timeoutMs: 550/)
  assert.match(bot, /browserFallbackTimeoutMs: 900/)
  assert.match(bot, /browserFallbackOnly: true/)
  assert.match(client, /timeoutMs\?: number/)
  assert.match(client, /firstAudioTimeoutMs = 900/)
  assert.match(client, /browserFallbackOnly\?: boolean/)
  assert.match(client, /The first voice audio did not arrive within the fast-start window/)
})

test('QuorlythBot chat frame reduces expensive blur and offscreen transcript rendering', async () => {
  const [styles, robot] = await Promise.all([
    readSource('src/styles/bot.css'),
    readSource('src/bot/robot3d.ts'),
  ])
  assert.match(styles, /\.bot \.ast-log > \.am[\s\S]{0,180}content-visibility: auto/)
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]{0,240}backdrop-filter: none !important/)
  assert.match(robot, /setPixelRatio\(Math\.min\(window\.devicePixelRatio\|\|1,1\.0\)\)/)
  assert.match(robot, /if\(now-lastRender<1000\/30\)/)
})
