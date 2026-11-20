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

test('QuorlythBot stays closed until a user deliberately opens the launcher', async () => {
  const app = await readSource('src/App.tsx')
  assert.ok(app.includes('const QuorlythBot = lazy(loadQuorlythBot)'))
  assert.ok(app.includes('const openQuorlythBot = useCallback'))
  assert.doesNotMatch(app, /botAutoOpenedForRef|Open QuorlythBot automatically/)
  assert.match(app, /onClick=\{\(\) => \{ void openQuorlythBot\(\) \}\}/)
  assert.match(app, /void openQuorlythBot\(true\)/)
  assert.match(app, /\{botMounted && <Suspense fallback=\{null\}><QuorlythBot initialOpen/)
})

test('the live-site QuorlythBot launcher stays in a body portal until its lazy-loaded module is ready', async () => {
  const [app, css, bot] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/styles/app.css'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  const openStart = app.indexOf('const openQuorlythBot = useCallback')
  assert.ok(openStart >= 0, 'the shared launcher opener exists')
  const helper = app.slice(openStart, app.indexOf('// Load the AI writing helper', openStart))
  assert.ok(helper.indexOf('await loadQuorlythBot()') < helper.indexOf('setBotMounted(true)'), 'the bot mounts only after its module resolves')
  assert.ok(app.includes('createPortal('))
  assert.ok(app.includes('document.body'))
  assert.ok(app.includes('data-quorlyth-launcher'))
  assert.ok(app.includes('!botMounted && !botLauncherHidden && createPortal('))
  assert.ok(!app.includes('qbot-launcher-restore'))
  assert.ok(app.includes('qbot-launcher-load-error'))
  assert.ok(app.includes('onContextMenu='))
  assert.ok(app.includes('qbot-launcher-hidden-v1'))
  assert.ok(css.includes('#astl.astl'))
  assert.ok(css.includes('#astl.astl::before'))
  const launcherStart = bot.indexOf('id="astl"')
  const launcherEnd = bot.indexOf('</button>', launcherStart)
  assert.ok(launcherStart >= 0 && launcherEnd > launcherStart, 'the mounted bot renders its own persistent launcher')
  const launcher = bot.slice(launcherStart, launcherEnd)
  assert.ok(launcher.includes('onClick={openPanel}'))
  assert.ok(launcher.includes('onContextMenu='))
  assert.ok(!launcher.includes('onPointerDown') && !launcher.includes('onPointerUp'))
  assert.ok(bot.includes('!launcherHidden && <button'))
  assert.ok(bot.includes('setLauncherHidden(true)'))
  assert.ok(!bot.includes('startLauncherHold') && !bot.includes('launcherLongPressTriggered'))
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
  assert.match(nav, /\{ path: '\/access', label: 'Request access', icon: 'invite', guest: true \}/)
  assert.match(nav, /return \['\/', '\/architecture', '\/demo', '\/signin', '\/access'\]\.includes\(i\.path\)/)
  assert.match(nav, /if \(me\) return !i\.guest/)
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
  assert.match(bot, /styles\/bot-composer-fluid-black\.css/)
  assert.match(automations, /styles\/automations\.css/)
})

test('QuorlythBot keeps the live-site Robot renderer lazy-loaded outside the bot chunk', async () => {
  const [robot, robot3d, bot] = await Promise.all([
    readSource('src/bot/Robot.tsx'),
    readSource('src/bot/robot3d.ts'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  assert.match(bot, /import \{ Robot, RobotApi \} from '\.\/Robot'/)
  assert.match(bot, /<Robot ref=\{robot\}/)
  assert.doesNotMatch(bot, /from '\.\/Orb'|<Orb/)
  assert.match(robot, /import\('\.\/robot3d'\)/)
  assert.match(robot3d, /from ["']three["']/)
  assert.match(robot, /active\?: boolean/)
})

test('community manager access keeps its editorial black-ink glass treatment', async () => {
  const [access, accessCss, main] = await Promise.all([
    readSource('src/screens/Access.tsx'),
    readSource('src/styles/request-access-editorial.css'),
    readSource('src/main.tsx'),
  ])
  assert.match(access, /q-access-manager-status/)
  assert.match(access, /COMMUNITY MANAGEMENT/)
  assert.match(access, /You manage this community/)
  assert.match(accessCss, /color:\s*#080807\s*!important/)
  assert.match(main, /styles\/request-access-editorial\.css/)
})

test('the 3D Bot renderer is frame-limited and pauses while the tab is hidden', async () => {
  const robot3d = await readSource('src/bot/robot3d.ts')
  assert.ok(robot3d.includes('1000/(lowPower?24:30)'))
  assert.match(robot3d, /document\.visibilityState/)
  assert.match(robot3d, /document\.removeEventListener\(["']visibilitychange["']/)
  assert.ok(robot3d.includes('window.devicePixelRatio||1,lowPower?0.9:1.0'))
  assert.match(robot3d, /powerPreference:lowPower\?'low-power':'high-performance'/)
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
  assert.ok(renderer.includes('window.devicePixelRatio||1,lowPower?0.9:1.0'))
  assert.ok(renderer.includes('1000/(lowPower?24:30)'))
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

test('the live-site Bot launcher hides on context menu and restores through the keyboard handoff', async () => {
  const [app, bot] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
  ])
  assert.ok(app.includes('const [botLauncherHidden, setBotLauncherHidden]'))
  assert.ok(app.includes('!intro && !botLoading && !botMounted && !botLauncherHidden && createPortal('))
  assert.ok(app.includes('onContextMenu='))
  assert.ok(app.includes("sessionStorage.getItem('qbot-launcher-hidden-v1') === '1'"))
  assert.ok(app.includes('quorlyth:launcher-restore'))
  assert.ok(bot.includes('const [launcherHidden, setLauncherHidden]'))
  assert.ok(bot.includes('!launcherHidden && <button'))
  assert.ok(bot.includes('setLauncherHidden(true)'))
  assert.ok(bot.includes("sessionStorage.setItem('qbot-launcher-hidden-v1', '1')"))
  assert.ok(bot.includes("sessionStorage.removeItem('qbot-launcher-hidden-v1')"))
  assert.ok(bot.includes("window.addEventListener('quorlyth:launcher-restore', restoreLauncher)"))
})
test('search palette keeps its original surface with black result copy and visible icons', async () => {
  const [palette, styles] = await Promise.all([
    readSource('src/components/Palette.tsx'),
    readSource('src/styles/contrast-system.css'),
  ])
  assert.ok(palette.includes("className={cn('rr'"))
  assert.ok(palette.includes('className="gh"'))
  assert.ok(styles.includes('#cmd .rr .t h3'))
  assert.ok(styles.includes('#cmd .rr .t p'))
  assert.ok(styles.includes('#cmd .rr > svg'))
  assert.ok(styles.includes('#1c1511'))
  assert.ok(styles.includes('#9a3412'))
  assert.ok(!styles.includes('#cmd .cb'))
  assert.ok(!styles.includes('#cmd .rr:hover'))
})

test('the robot loading state never renders a miniature duplicate character', async () => {
  const [robot, styles, signIn] = await Promise.all([
    readSource('src/bot/Robot.tsx'),
    readSource('src/styles/contrast-system.css'),
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
  assert.match(robot, /setPixelRatio\(Math\.min\(window\.devicePixelRatio\|\|1,lowPower\?0\.9:1\.0\)\)/)
  assert.match(robot, /if\(now-lastRender<1000\/\(lowPower\?24:30\)\)/)
  assert.match(robot, /if\(!lowPower\)addEventListener\(["']pointermove["']/)
})

test('QuorlythBot uses a darker solid burnt-orange 3D shell with the original dark face', async () => {
  const [theme, robot] = await Promise.all([
    readSource('src/bot/robot-themes.ts'),
    readSource('src/bot/robot3d.ts'),
  ])
  assert.ok(theme.includes('p: 0xc9562e'))
  assert.ok(theme.includes('b: 0x211a17'))
  assert.ok(theme.includes('c: 0xa64829'))
  assert.ok(theme.includes('e: 0x6f2b1a'))
  assert.ok(theme.includes("g1: '#C9562E'"))
  assert.ok(theme.includes("g2: '#6F2B1A'"))
  assert.ok(theme.includes("cr: '201,86,46'"))
  assert.match(robot, /shell\.color\.setHex\(T\.p\)/)
  assert.match(robot, /arm\.color\.setHex\(T\.p\)/)
  assert.match(robot, /shell\.roughness=\.46/)
  assert.match(robot, /arm\.roughness=\.45/)
  assert.match(robot, /color:0xc9562e/)
  assert.match(robot, /new DirectionalLight\(0xffddc2,1\.08\)/)
  assert.ok(!theme.includes('p: 0xef784b'))
  assert.ok(!theme.includes('p: 0xd06a40'))
})


test('Request Access uses the two-panel platform and community application flow', async () => {
  const [access, css] = await Promise.all([
    readSource('src/screens/Access.tsx'),
    readSource('src/styles/app.css'),
  ])
  assert.match(access, /export function Access\(\)/)
  assert.match(access, /q-access-layout/)
  assert.match(access, /role="tablist"/)
  assert.match(access, /Choose a community accepting requests/)
  assert.match(access, /a\.requestCommunityJoin\(selected\.id, message\.trim\(\)\)/)
  assert.match(access, /selected\?\.ownerId \|\| selected\?\.createdBy/)
  assert.match(access, /canApplyToCommunity/)
  assert.match(access, /Platform access must be approved before you can apply/)
  assert.match(access, /submitPlatformApplication/)
  assert.match(access, /submitPlatformAccessRequest/)
  assert.match(access, /Create account or sign in/)
  assert.match(access, /getPlatformAccessStatus/)
  assert.match(access, /<h1 className="q-access-title">\{leftTitle\}<\/h1>/)
  assert.match(access, /<h2 className="q-access-title">Tell the owner why you want to join\.<\/h2>/)
  assert.match(access, /<h2 className="q-access-title">\{previewForm/)
  assert.match(access, /<i className="hh" \/><Logo size=\{84\} breathe \/>/)
  assert.match(css, /\.q-access-orb \.hh[\s\S]*?animation: hb2 6\.5s/)
  assert.match(css, /\.q-access-orb svg\.q-logo-mark[\s\S]*?animation: br2 6\.5s[\s\S]*?!important/)
  assert.match(css, /@keyframes br2/)
  assert.match(css, /@keyframes hb2/)
  assert.match(css, /\.q-access-layout/)
  assert.match(css, /\.q-access-switch/)
  assert.match(css, /\.q-access-primary/)
  assert.match(css, /\.q-access-card\s*\{[\s\S]*?background:\s*#F2EBDD\s*!important/)
  assert.match(css, /\.q-access-card\s*\{[\s\S]*?color:\s*#171411\s*!important/)
  assert.match(css, /\.q-access-switch button\s*\{[\s\S]*?color:\s*#211A17\s*!important/)
  assert.match(css, /width:\s*min\(1240px/)
  assert.match(css, /\.q-access-intro-copy h1,[\s\S]*?\.q-access-platform-form > h2[\s\S]*?color:\s*#000000\s*!important/)
  assert.match(css, /\.q-access-community-form > h2/)
  assert.match(css, /\.q-access-platform-form > h2/)
  assert.match(css, /\.q-access-orb svg\.q-logo-mark[\s\S]*?stroke-width:\s*2\.5\s*!important/)
  assert.match(css, /width:\s*min\(84px,\s*78%\)/)
})

test('visitor platform requests use the existing public access request table and platform admin review RPC', async () => {
  const [backend, settings, signIn] = await Promise.all([
    readSource('src/backend.ts'),
    readSource('src/screens/Settings.tsx'),
    readSource('src/screens/SignIn.tsx'),
  ])
  assert.match(backend, /from\('access_requests'\)\.insert/)
  assert.match(backend, /review_quorlyth_access_request/)
  assert.match(backend, /listPlatformAccessRequests/)
  assert.match(backend, /from\('workspace_members'\).*\.eq\('email', email\)/)
  assert.match(settings, /Visitor access requests/)
  assert.match(settings, /reviewVisitorRequest/)
  assert.match(signIn, /params\.get\('email'\)\?\.trim\(\)/)
})

test('project workspace empty-state guidance uses black high-contrast writeups', async () => {
  const [workspace, styles] = await Promise.all([
    readSource('src/screens/StandaloneWorkspaces.tsx'),
    readSource('src/styles/standalone-workspaces.css'),
  ])
  assert.match(workspace, /className="sw-empty-inline-copy">Submit work under a milestone on the Project page\./)
  assert.match(workspace, /className="sw-empty-inline-copy">Connect GitHub for source-checked commits and pull requests/)
  assert.match(styles, /\.sw-empty-inline p\.sw-empty-inline-copy[\s\S]*?color:#080807 !important/)
  assert.match(styles, /background:linear-gradient\(135deg,#F3EBDD 0%,#E9E0D1 100%\)/)
})

test('QuorlythBot typing helper displays only the compact robot head', async () => {
  const [writing, styles, head] = await Promise.all([
    readSource('src/components/WritingAssistant.tsx'),
    readSource('src/styles/writing-assistant-live.css'),
    readSource('src/bot/QuorlythBotHead.tsx'),
  ])
  assert.match(writing, /import \{ QuorlythBotHead \} from '\.\.\/bot\/QuorlythBotHead'/)
  assert.match(writing, /<QuorlythBotHead size=\{28\} \/>/)
  assert.match(writing, /title="Open QuorlythBot writing assistant"/)
  assert.match(writing, /aria-label="Open QuorlythBot writing assistant"/)
  assert.doesNotMatch(writing, /q-writing-robot-label|q-writing-robot-spark|Improve text/)
  assert.match(writing, /What would you like to improve\?/)
  assert.match(writing, /Three tailored suggestions are generated automatically/)
  assert.match(writing, /void improve\(MODES\[0\]\)/)
  assert.match(writing, /MODES\.filter\(item => item\.kind !== 'suggestions'\)/)
  assert.match(writing, /aria-label="Writing actions"/)
  assert.match(writing, /onClick=\{\(\) => void improve\(item\)\}/)
  for (const label of ['Improve', 'Professional', 'Shorten', 'Friendlier', 'More confident', 'Persuasive', 'Fix grammar', 'Expand']) {
    assert.ok(writing.includes("label: '" + label + "'"), 'missing writing action: ' + label)
  }
  assert.match(writing, /target\.style\.setProperty\('padding-bottom'/)
  assert.match(styles, /\.q-writing-robot-button/)
  assert.match(styles, /width:54px !important/)
  assert.match(styles, /\.q-writing-panel\s*\{/)
  assert.match(styles, /\.q-writing-mode\s*\{/)
  assert.match(styles, /\.q-writing-panel-close/)
  assert.match(styles, /pointer-events:\s*auto !important/)
  assert.doesNotMatch(styles, /q-writing-robot-label|q-writing-robot-spark|is-compact/)
  assert.match(head, /useId\(\)/)
  assert.match(head, /id=\{shell\}/)
  assert.ok(head.includes('url(#'))
  assert.doesNotMatch(writing, /import \{ Logo \} from '\.\.\/lib\/Logo'/)
})
test('QuorlythBot launchers use the original live-site Quorlyth logo mark', async () => {
  const [app, bot, css] = await Promise.all([
    readSource('src/App.tsx'),
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/styles/app.css'),
  ])
  assert.match(app, /<span className="astm"><Logo size=\{30\} \/><\/span>/)
  assert.match(bot, /<span className="astm"><Logo size=\{30\} \/><\/span>/)
  assert.doesNotMatch(app + bot, /QuorlythBotHead size=\{38\}/)
  assert.match(css, /#astl\.astl/)
})

test('Automation starter cards render every label and trigger in high-contrast editorial ink', async () => {
  const [automation, styles] = await Promise.all([
    readSource('src/screens/Automations.tsx'),
    readSource('src/styles/automation-editorial-cards.css'),
  ])
  assert.match(automation, /name: 'New idea alert'/)
  assert.match(automation, /description: 'Notify your team when a fresh community idea enters the system\.'/)
  assert.match(automation, /trigger: 'idea\.created'/)
  assert.match(automation, /STARTER \{String\(index \+ 1\)\.padStart\(2, '0'\)\}/)
  assert.match(automation, /TRIGGER_INFO\[template\.trigger\]\.title/)
  assert.match(automation, /Use template/)
  assert.match(styles, /\.wa-template-card h4[\s\S]*?color: #080807 !important/)
  assert.match(styles, /\.wa-template-card > p[\s\S]*?color: #24231f !important/)
  assert.match(styles, /\.wa-template-trigger[\s\S]*?color: #171713 !important/)
  assert.match(styles, /\.wa-template-card > button[\s\S]*?color: #11110f !important/)
  assert.match(styles, /\.wa-template-section::before/)
  assert.match(styles, /\.wa-template-section::after/)
  assert.match(styles, /@keyframes wa-template-surface-drift/)
  assert.match(styles, /@keyframes wa-template-surface-sheen/)
  assert.match(styles, /animation: wa-template-surface-drift 26s/)
  assert.match(styles, /animation: wa-template-surface-sheen 18s/)
  assert.match(styles, /prefers-reduced-motion:[\s\S]*?animation: none !important/)
})

test('Settings access-request queues scroll independently with no visible scrollbar', async () => {
  const [settings, styles] = await Promise.all([
    readSource('src/screens/Settings.tsx'),
    readSource('src/styles/settings-request-scroll.css'),
  ])
  assert.match(settings, /q-settings-requests-scroll/)
  assert.match(settings, /aria-label="Platform access requests"/)
  assert.match(settings, /aria-label="Visitor access requests"/)
  assert.match(styles, /overflow-y: auto/)
  assert.match(styles, /scrollbar-width: none/)
  assert.match(styles, /::-webkit-scrollbar/)
  assert.match(styles, /display: none/)
})

test('QuorlythBot loading and restore glows use the uploaded orange swatch', async () => {
  const contrast = await readSource('src/styles/contrast-system.css')
  assert.match(contrast, /background: linear-gradient\(180deg, #F3A17C, #D06A40 60%, #843A25\)/)
  assert.match(contrast, /border-top-color: #D06A40/)
  assert.match(contrast, /rgba\(208, 106, 64, \.12\)/)
})

test('platform admins use the shared layered orange role badge in My Space and public community cards', async () => {
  const [me, badges, css] = await Promise.all([
    readSource('src/screens/Me.tsx'),
    readSource('src/components/RoleBadges.tsx'),
    readSource('src/styles/role-badges.css'),
  ])
  assert.ok(me.includes('a.platformAdmin || a.owner ? <PlatformAdminBadge compact />'))
  assert.ok(me.includes('isPlatformAdmin ? <PlatformAdminBadge compact />'))
  assert.ok(me.includes("import { CommunityCreatorBadge, PlatformAdminBadge }"))
  assert.ok(badges.includes('export function PlatformAdminBadge('))
  assert.ok(css.includes('background: linear-gradient(138deg, #ffc18f 0%, #f29360 34%, #de6942 72%, #bf4b2a 100%)'))
  assert.ok(css.includes('.platform-verified-shield--compact'))
  assert.ok(css.includes('@keyframes platformAdminBreath'))
})


test('Request Access titles stay true black after the global heading theme, and its logo keeps homepage breathing motion', async () => {
  const [access, contrast] = await Promise.all([
    readSource('src/screens/Access.tsx'),
    readSource('src/styles/contrast-system.css'),
  ])
  assert.equal((access.match(/className="q-access-title"/g) || []).length, 5)
  assert.match(access, /<h2 className="q-access-title">Your request has been sent\.<\/h2>/)
  assert.match(contrast, /#root \.q-access-page \.q-access-title\s*\{[\s\S]*?color:\s*#000000\s*!important[\s\S]*?-webkit-text-fill-color:\s*#000000\s*!important/)
  assert.match(contrast, /#root \.q-access-page \.q-access-orb svg\.q-logo-mark[\s\S]*?stroke-width:\s*3\s*!important[\s\S]*?animation:\s*br2 6\.5s cubic-bezier\(\.45,0,\.55,1\) infinite !important/)
  assert.match(contrast, /#root \.q-access-page \.q-access-orb \.hh[\s\S]*?animation:\s*hb2 6\.5s cubic-bezier\(\.45,0,\.55,1\) infinite !important/)
})


test('public visitors see Request Access in the primary nav while signed-in accounts do not', async () => {
  const nav = await readSource('src/components/Nav.tsx')
  assert.match(nav, /\{ path: '\/access', label: 'Request access', icon: 'invite', guest: true \}/)
  assert.match(nav, /return \['\/', '\/architecture', '\/demo', '\/signin', '\/access'\]\.includes\(i\.path\)/)
  assert.match(nav, /if \(me\) return !i\.guest/)
})

test('visitor platform access submissions feed platform-admin notifications and pending counts', async () => {
  const [notifs, app, panel, access] = await Promise.all([
    readSource('src/lib/notifs.ts'),
    readSource('src/App.tsx'),
    readSource('src/components/NotifPanel.tsx'),
    readSource('src/screens/Access.tsx'),
  ])
  assert.match(notifs, /a\.backend\?\.listPlatformAccessRequests/)
  assert.match(notifs, /window\.setInterval\([\s\S]*?15_000\)/)
  assert.match(notifs, /visitorRequests\.forEach\(request/)
  assert.match(notifs, /kind: 'settings'/)
  assert.match(notifs, /visitor-access-request:' \+ request\.status/)
  assert.match(app, /notifs\.filter\(n => n\.target === 'visitor-access-request:pending'\)/)
  assert.match(panel, /n\.kind === 'settings' \? '\/settings\?tab=requests'/)
  assert.match(access, /<h2 className="q-access-title">You manage platform access\.<\/h2>/)
  assert.match(access, /setPreviewForm\(value => !value\)/)
})


test('QuorlythBot uses the live-site black room styles without global glass overrides', async () => {
  const [contrast, bot, baseStyles, composer] = await Promise.all([
    readSource('src/styles/contrast-system.css'),
    readSource('src/bot/QuorlythBot.tsx'),
    readSource('src/styles/bot.css'),
    readSource('src/styles/bot-composer-fluid-black.css'),
  ])
  assert.ok(contrast.includes('.glass:not(.bot)'))
  assert.ok(!contrast.includes(':is(.glass, .card'))
  assert.match(bot, /bot-composer-fluid-black\.css/)
  assert.doesNotMatch(bot, /bot-room-theme\.css|bot-liquid-glass\.css/)
  assert.ok(baseStyles.includes('.qbot-conversation .am'))
  assert.ok(baseStyles.includes('.bsb'))
  assert.ok(composer.includes('.ast-in'))
  assert.ok(composer.includes('background: #050506'))
})
