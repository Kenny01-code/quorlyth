import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Automations preserves the styling from the linked reference deployment', async () => {
  const [app, screen, styles, base] = await Promise.all([
    source('src/App.tsx'),
    source('src/screens/Automations.tsx'),
    source('src/styles/automation-ai.css'),
    source('src/styles/app.css'),
  ])

  assert.ok(app.includes('<Route path="/automations" element={<Automations />} />'))
  assert.ok(screen.includes("import '../styles/automation-ai.css'"))
  assert.equal(screen.includes('automation-dark.css'), false)
  assert.equal(app.includes('automationRouteActive'), false)
  assert.equal(app.includes('q-automation-route-active'), false)
  assert.ok(styles.includes('background:linear-gradient(145deg,#FFFCF6 0%,#F2EADB 100%) !important'))
  assert.ok(styles.includes('#FFFEFA'))
  assert.ok(styles.includes('.wa-connected-services-note'))
  assert.ok(styles.includes('.wa-plain-guide-steps article'))
  assert.ok(base.includes('body{background:var(--k);color:var(--w);'))
})
