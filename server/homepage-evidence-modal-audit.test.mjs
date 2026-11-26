import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('homepage editorial badges stay compact and rectangular without changing global chips', async () => {
  const css = await source('src/styles/landing-motion.css')
  assert.match(css, /#root #main \.hero > \.chip,[\s\S]*?#root #main \.preview-card \.preview-topline > \.chip/)
  assert.match(css, /border-radius: 6px !important/)
  assert.match(css, /min-height: 31px/)
  assert.match(css, /gap: 7px/)
})

test('landing hero actions keep the compact rectangular geometry', async () => {
  const css = await source('src/styles/cover-burnt-orange.css')
  assert.match(css, /#root #main \.hero \.hero-actions \.btn\s*\{[^}]*border-radius: 8px !important/s)
})

test('Automation Studio keeps the original dark AI builder and integration panels', async () => {
  const [ai, dark] = await Promise.all([
    source('src/styles/automation-ai.css'),
    source('src/styles/automation-dark.css'),
  ])

  assert.match(ai, /\.wa-ai-architect\s*\{/)
  assert.match(ai, /\.wa-connected-services\s*\{[^}]*background:linear-gradient\(145deg,rgba\(255,255,255,\.045\),rgba\(255,255,255,\.012\)\),rgba\(3,3,4,\.72\)/s)
  assert.match(ai, /\.wa-plain-guide\s*\{[^}]*background:linear-gradient\(125deg,rgba\(255,255,255,\.045\),rgba\(255,255,255,\.012\)\)/s)
  assert.doesNotMatch(ai, /Verified integration, runtime and plain-language copy: clear bone surfaces|#FFFCF6|#F2EADB|#FFFEFA|#F5EFE6|#F8F2E8|#EAE0D1|#F4EBDD|#F5AD87|#F7E9D7|color:#000000 !important/)
  assert.match(dark, /#root main#main\.q-automation-route \.wa-screen/)
  assert.match(dark, /background:\s*#08090b\s*!important/)
})

test('evidence preview is rendered as one centred, blurred viewport dialog', async () => {
  const [css, component] = await Promise.all([
    source('src/styles/evidence-preview.css'),
    source('src/components/EvidencePreview.tsx'),
  ])

  assert.equal((css.match(/^\.ql-evidence-viewer\s*\{/gm) || []).length, 1, 'the viewer has one authoritative overlay rule')
  assert.match(css, /\.ql-evidence-viewer\s*\{[\s\S]*?position: fixed !important;[\s\S]*?inset: 0 !important;[\s\S]*?display: grid !important;[\s\S]*?place-items: center !important;/)
  assert.match(css, /backdrop-filter: blur\(24px\) saturate\(130%\)/)
  assert.match(css, /\.ql-evidence-viewer__panel\s*\{[\s\S]*?width: min\(1160px, calc\(100vw - 48px\)\);[\s\S]*?height: min\(880px, calc\(100dvh - 48px\)\);[\s\S]*?margin: 0;/)
  assert.match(css, /@media\(max-width:640px\)[\s\S]*?\.ql-evidence-viewer__panel[\s\S]*?height:100dvh/)
  assert.match(component, /createPortal\(/)
  assert.match(component, /role="dialog" aria-modal="true"/)
  assert.match(component, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(component, /if \(event\.key === 'Escape'\)/)
  assert.match(component, /if \(event\.shiftKey && document\.activeElement === first\)/)
  assert.match(component, /viewerOpenerRef\.current\.focus\(\)/)
})
