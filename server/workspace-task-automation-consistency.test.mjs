import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('QuorlythBot task starts and edits use the workspace permission contract', async () => {
  const [bot, workspace] = await Promise.all([
    source('src/bot/QuorlythBot.tsx'),
    source('src/screens/StandaloneWorkspaces.tsx'),
  ])

  const editStart = bot.indexOf("} else if (action.type === 'updateStandaloneTask')")
  const startStart = bot.indexOf("} else if (action.type === 'startStandaloneTask')")
  const assignStart = bot.indexOf("} else if (action.type === 'assignStandaloneTask')")
  assert.ok(editStart >= 0 && startStart > editStart && assignStart > startStart)

  const edit = bot.slice(editStart, startStart)
  const start = bot.slice(startStart, assignStart)

  assert.match(edit, /currentProject\.status !== 'active'/)
  assert.match(edit, /currentTask\.createdBy === a\.me\.id/)
  assert.match(edit, /isCommunityOwner/)
  assert.match(edit, /updatedBy: a\.me\.id/)
  assert.match(edit, /updatedAt,/)

  assert.match(start, /currentProject\.status !== 'active'/)
  assert.match(start, /currentTask\.status !== 'todo'/)
  assert.match(start, /currentTask\.createdBy === a\.me\.id/)
  assert.match(start, /isCommunityOwner/)
  assert.match(start, /startedBy: a\.me\.id, updatedBy: a\.me\.id/)

  assert.match(workspace, /const canManageTask = \(task\?: WorkspaceTask\) => .*task\.createdBy === a\.me\.id/)
  assert.match(workspace, /startedBy: a\.me!\.id,[\s\S]*?updatedBy: a\.me!\.id/)
})

test('local automation gives each event a unique ID and stores complete source provenance', async () => {
  const [automation, runtime] = await Promise.all([
    source('src/lib/automation.ts'),
    source('src/components/AutomationRuntime.tsx'),
  ])

  assert.match(automation, /const eventId = String\(payload\.eventId \|\| newWorkflowId\(\)\)/)
  assert.match(automation, /const runId = newWorkflowId\(\)/)
  assert.match(automation, /sourceEventId: String\(event\.payload\.eventId \|\| ''\)/)
  assert.match(automation, /sourceEntityId: String\(event\.payload\.id \|\| event\.payload\.taskId \|\| ''\)/)
  assert.match(automation, /sourceActorId: String\(event\.payload\.actorId \|\| ''\)/)
  assert.match(automation, /sourceWorkspaceId: String\(event\.payload\.workspaceId \|\| event\.payload\.projectId \|\| ''\)/)
  assert.match(automation, /sourceTaskId: String\(event\.payload\.taskId \|\| ''\)/)
  assert.match(runtime, /entityType: 'task'/)
  assert.match(runtime, /actorId: String\(doc\.data\?\.updatedBy \|\| doc\.data\?\.createdBy/)
})

test('local and persistent webhook payloads expose the same workspace task actor context', async () => {
  const [automation, worker] = await Promise.all([
    source('src/lib/automation.ts'),
    source('supabase/functions/automation-worker/index.ts'),
  ])

  for (const field of ['eventId', 'entityType', 'workspaceId', 'taskId', 'actorId', 'status', 'dueAt']) {
    assert.match(automation, new RegExp(field + ':'))
    assert.match(worker, new RegExp(field + ':'))
  }
  assert.match(automation, /workspaceId: event\.payload\.workspaceId \|\| event\.payload\.projectId \|\| null/)
  assert.match(worker, /workspaceId: event\.payload\?\.workspaceId \|\| event\.payload\?\.projectId \|\| null/)
  assert.match(worker, /eventId: event\.id \|\| event\.payload\?\.eventId \|\| null/)
})

test('evidence preview remains atomic, body-level, centred and dismissible', async () => {
  const [preview, styles] = await Promise.all([
    source('src/components/EvidencePreview.tsx'),
    source('src/styles/evidence-preview.css'),
  ])

  assert.match(preview, /const \[request, setRequest\] = useState<EvidencePreviewRequest \| null>\(null\)/)
  assert.match(preview, /const open = request !== null/)
  assert.match(preview, /createPortal\([\s\S]*document\.body/)
  assert.match(preview, /openRef\.current = false[\s\S]*setRequest\(null\)/)
  assert.match(preview, /event\.key === 'Escape'/)
  assert.match(preview, /event\.target === event\.currentTarget\) dismiss\(\)/)
  assert.match(styles, /z-index: 2147483647 !important/)
  assert.match(styles, /place-items: center/)
  assert.match(styles, /backdrop-filter: blur\(32px\) saturate\(140%\)/)
})
