import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('landing copy is fixed and the editorial reveal respects reduced motion', async () => {
  const [landing, styles] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/styles/extra.css'),
  ])

  assert.ok(landing.includes("headline: 'Let your fans help shape what comes next.'"))
  assert.ok(landing.includes("support: 'Organise the people who care, review ideas with clear AI reasoning, and promote the ones you choose while preserving contributor credit.'"))
  assert.ok(landing.includes("headline: 'From community suggestions to meaningful action.'"))
  assert.ok(landing.includes("support: 'Quorlyth surfaces ideas with clear reasons, leaves the final decision to the creator, and keeps contributor credit intact.'"))
  assert.match(landing, /<p className="eyebrow">INSIDE QUORLYTH<\/p>/)
  assert.doesNotMatch(landing, /HERO_COPIES|PREVIEW_COPIES|setCopyIndex|setPreviewCopyIndex|setInterval/)
  assert.match(landing, /qth-editorial-word/)
  assert.match(styles, /@keyframes qthEditorialWordReveal/)
  assert.match(styles, /prefers-reduced-motion:reduce[\s\S]*?\.qth-editorial-word/)
})

test('the automation builder is natural-language first and keeps advanced controls optional', async () => {
  const [automations, canvas, runtime, worker, migration] = await Promise.all([
    source('src/screens/Automations.tsx'),
    source('src/components/WorkflowCanvas.tsx'),
    source('src/components/AutomationRuntime.tsx'),
    source('supabase/functions/automation-worker/index.ts'),
    source('supabase/migrations/20261105111008_persistent_automation_worker.sql'),
  ])

  assert.match(automations, /Describe the work\. I’ll build the automation\./)
  assert.match(automations, /<details className="wa-ai-advanced">/)
  assert.match(automations, /Build my automation/)
  assert.match(automations, /Nothing starts running until you turn it on/)
  assert.match(automations, /usedSafeNotificationFallback/)
  assert.match(automations, /Choose a workspace in Automation advanced options/)
  assert.doesNotMatch(automations, /aiProjectChoice \|\| raw\.projectId/)
  assert.match(automations, /Run a real test/)
  assert.match(automations, /window\.confirm\(/)
  assert.match(automations, /isPersistentRuntime = app\.backend\?\.auth\.mode === 'supabase'/)
  assert.match(canvas, /For signed-in accounts, active workflows run through Quorlyth’s server automation worker/)
  assert.match(runtime, /app\.backend\?\.auth\.mode === 'supabase' \|\| !store \|\| !userId/)
  assert.match(worker, /verify_automation_worker_token/)
  assert.match(worker, /claim_automation_events/)
  assert.match(migration, /private\.automation_event_queue/)
  assert.match(migration, /cron\.schedule\('quorlyth-automation-worker'/)
})

test('privileged pages have direct route-level gates, not just hidden navigation links', async () => {
  const [gate, queue, promote, growth, database, settings, app, nav] = await Promise.all([
    source('src/components/Gate.tsx'),
    source('src/screens/Queue.tsx'),
    source('src/screens/Promote.tsx'),
    source('src/screens/Growth.tsx'),
    source('src/screens/Database.tsx'),
    source('src/screens/Settings.tsx'),
    source('src/App.tsx'),
    source('src/components/Nav.tsx'),
  ])

  assert.match(gate, /if \(!me && !demo\)/)
  assert.match(gate, /platformOwnerOnly && \(!platformOwner \|\| demo\)/)
  assert.match(gate, /platformAdminOnly && !app\.platformAdmin/)
  assert.match(gate, /owner && !isOwner && !isCommunityOwner && !demo/)
  assert.match(queue, /return <Gate owner>/)
  assert.match(promote, /return <Gate owner>/)
  assert.match(growth, /return <Gate platformAdminOnly>/)
  assert.match(database, /return <Gate platformOwnerOnly>/)
  assert.match(settings, /a\.platformAdmin \? \['Space'/)
  assert.match(app, /<Route path="\/queue" element=\{<Queue \/>\} \/>/)
  assert.match(app, /<Route path="\/database" element=\{<Database \/>\} \/>/)
  assert.match(nav, /return \['\/', '\/architecture', '\/demo', '\/signin'\]\.includes\(i\.path\)/)
})

test('community, profile, and messaging views respect membership and privacy boundaries', async () => {
  const [communities, profile, messages, securityTests] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/screens/Me.tsx'),
    source('src/screens/Messages.tsx'),
    source('server/security.test.mjs'),
  ])

  assert.match(communities, /c\.vis !== 'unlisted' \|\| a\.canManageCommunity\(c\.id\) \|\| a\.joined\(c\.id\)/)
  assert.match(communities, /mayViewMembers = !!a\.me && \(a\.canManageCommunity\(cid\) \|\| a\.joined\(cid\)\)/)
  assert.match(profile, /profileVisibility === 'private' && id !== a\.me\?\.id/)
  assert.match(profile, /c\.vis !== 'unlisted'/)
  assert.match(messages, /if \(!meId\) \{/)
  assert.match(messages, /c\.members\.includes\(meId\)/)
  assert.match(securityTests, /members see idea outcomes but not creator-only score\/rationale or unlisted communities/)
  assert.match(securityTests, /chat calls bind both parties and ICE signals to the real conversation/)
  assert.match(securityTests, /anonymous users can discover listed ideas but cannot write shared records/)
})
