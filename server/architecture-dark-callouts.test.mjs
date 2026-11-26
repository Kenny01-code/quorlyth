import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('the How Quorlyth works route keeps its rectangular dark kicker and obsidian automation callouts', async () => {
  const [landing, architecture, styles] = await Promise.all([
    source('src/screens/Landing.tsx'),
    source('src/screens/Architecture.tsx'),
    source('src/styles/public-architecture.css'),
  ])

  assert.match(landing, /nav\('\/architecture'\)/)
  assert.match(architecture, /className="arch-kicker"/)
  assert.match(architecture, /className="arch-my-automations"/)
  assert.match(architecture, /className="arch-automation-created"/)

  assert.match(styles, /\.arch-page \.arch-kicker[\s\S]*?border-radius:\s*8px/)
  assert.match(styles, /\.arch-page \.arch-kicker[\s\S]*?background:\s*linear-gradient\(145deg,rgba\(217,121,82,\.12\),rgba\(255,255,255,\.025\)\)/)
  assert.match(styles, /\.arch-page \.arch-my-automations,[\s\S]*?border-left:\s*3px solid #D97755/)
  assert.match(styles, /\.arch-page \.arch-my-automations,[\s\S]*?linear-gradient\(145deg,#151719 0%,#0e1012 100%\)/)
  assert.match(styles, /\.arch-page \.arch-my-automations strong,[\s\S]*?color:\s*#F0EAD9/)
  assert.match(styles, /\.arch-page \.arch-my-automations p,[\s\S]*?color:\s*#C8BFB1/)
  assert.doesNotMatch(styles, /background:linear-gradient\(120deg,#f0ead9,#e8dfd0\)/)
})
