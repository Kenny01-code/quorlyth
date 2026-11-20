import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('evidence preview visibility is atomic and the outer layer is full-screen, blurred and centred', async () => {
  const [preview, app, styles] = await Promise.all([
    source('src/components/EvidencePreview.tsx'),
    source('src/App.tsx'),
    source('src/styles/evidence-preview.css'),
  ])
  assert.match(preview, /const \[request, setRequest\] = useState<EvidencePreviewRequest \| null>\(null\)/)
  assert.match(preview, /const open = request !== null/)
  assert.doesNotMatch(preview, /setOpen\(/)
  assert.match(preview, /createPortal\([\s\S]*document\.body/)
  assert.match(preview, /onPointerDown=\{event => \{ if \(event\.target === event\.currentTarget\) dismiss\(\) \}\}/)
  assert.match(preview, /document\.documentElement\.style\.overflow = 'hidden'/)
  assert.match(preview, /event\.key !== 'Tab'/)
  assert.match(preview, /if \(previous\?\.isConnected\) previous\.focus\(\)/)
  assert.match(app, /<EvidencePreviewHost\s*\/>/)
  assert.match(styles, /position: fixed !important/)
  assert.match(styles, /z-index: 2147483647 !important/)
  assert.match(styles, /backdrop-filter: blur\(32px\) saturate\(140%\)/)
  assert.match(styles, /place-items: center/)
})

test('QuorlythBot visuals match the original live-site launcher, Robot and composer', async () => {
  const [bot, app, robot] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/App.tsx'),
    source('src/bot/Robot.tsx'),
  ])
  assert.match(bot, /bot-composer-fluid-black\.css/)
  assert.doesNotMatch(bot, /bot-room-theme\.css|bot-liquid-glass\.css|from '\.\/Orb'|<Orb|QuorlythBotHead/)
  assert.match(bot, /<span className="astm"><Logo size=\{30\} \/><\/span>/)
  assert.match(bot, /<Robot ref=\{robot\} theme=\{theme\} calm=\{bs\.calm\} drag defer active=/)
  assert.match(bot, /className=\{cn\('ast-cap', caption && 'on'\)\}/)
  assert.match(app, /<span className="astm"><Logo size=\{30\} \/><\/span>/)
  assert.doesNotMatch(app, /QuorlythBotHead|qbot-launcher-restore/)
  assert.match(robot, /className="ast-fb"/)
  assert.match(robot, /Load the robot/)
})

test('workspace and task edit events have unique run IDs and full source context', async () => {
  const [automation, runtime, worker, migration] = await Promise.all([
    source('src/lib/automation.ts'),
    source('src/components/AutomationRuntime.tsx'),
    source('supabase/functions/automation-worker/index.ts'),
    source('supabase/migrations/20261120203000_automation_event_entity_context.sql'),
  ])
  assert.match(automation, /eventId: payload\.eventId \|\| \(isEditEvent \? newWorkflowId\(\)/)
  assert.match(automation, /'event\.workspaceId'/)
  assert.match(automation, /'event\.actorId'/)
  assert.match(automation, /'event\.entityType'/)
  assert.match(runtime, /const runKey = workflow\.id \+ ':' \+ detail\.type \+ ':' \+ \(eventId/)
  assert.match(runtime, /entityType: 'workspace'/)
  assert.match(runtime, /entityType: 'task'/)
  assert.match(worker, /sourceEventType: String\(event\.trigger_type \|\| ''\)/)
  assert.match(worker, /sourceWorkspaceId: String\(event\.payload\?\.workspaceId/)
  assert.match(worker, /updatedBy: ownerId/)
  assert.match(migration, /'entityType', 'workspace'/)
  assert.match(migration, /'entityType', 'task'/)
  assert.match(migration, /'entityType', 'evidence'/)
})

test('Bot workspace mutations respect task permissions and AI project closeout', async () => {
  const [bot, screen] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/screens/StandaloneWorkspaces.tsx'),
  ])
  assert.match(bot, /const canStartTask = canManage \|\| currentTask\.createdBy === a\.me\.id/)
  assert.match(bot, /linkedCommunity\?\.ownerId === a\.me\.id \|\| linkedCommunity\?\.createdBy === a\.me\.id/)
  assert.match(bot, /updatedBy: a\.me\.id, updatedAt: startedAt/)
  assert.match(bot, /current\.finalReview\?\.status !== 'completed'/)
  assert.match(screen, /startedBy: a\.me!\.id,[\s\S]*updatedBy: a\.me!\.id/)
  assert.match(screen, /updatedBy: a\.me!\.id/)
})
