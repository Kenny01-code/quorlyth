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

  assert.match(app, /<Route path="\\/automations" element=\\{<Automations \\/>\\} \\/>/)
  assert.match(screen, /import '\\.\\.\\/styles\\/automation-ai\\.css'/)
  assert.doesNotMatch(screen, /automation-dark\\.css/)
  assert.doesNotMatch(app, /automationRouteActive|q-automation-route-active/)
  assert.match(styles, /background:linear-gradient\\(145deg,#FFFCF6 0%,#F2EADB 100%\\) !important/)
  assert.match(styles, /#FFFEFA/)
  assert.match(styles, /\\.wa-connected-services-note/)
  assert.match(styles, /\\.wa-plain-guide-steps article/)
  assert.match(base, /body\\{background:var\\(--k\\);color:var\\(--w\\);/)
})
