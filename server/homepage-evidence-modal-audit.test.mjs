import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('homepage matches the reference deployment structure and avoids the added cover override', async () => {
  const [entry, landing, styles] = await Promise.all([
    source('src/main.tsx'),
    source('src/screens/Landing.tsx'),
    source('src/styles/landing-motion.css'),
  ])

  assert.equal(entry.includes("import './styles/cover-burnt-orange.css'"), false)
  assert.equal(landing.includes('CreatorCoverStage'), false)
  assert.ok(landing.includes('className="hero"'))
  assert.equal(styles.includes('#root #main .hero > .chip'), false)
  assert.equal(styles.includes('#root #main .preview-card .preview-topline > .chip'), false)
})

test('Automation content retains the reference deployment surfaces', async () => {
  const [screen, styles] = await Promise.all([
    source('src/screens/Automations.tsx'),
    source('src/styles/automation-ai.css'),
  ])

  assert.ok(screen.includes("import '../styles/automation-ai.css'"))
  assert.equal(screen.includes('automation-dark.css'), false)
  assert.ok(styles.includes('background:linear-gradient(145deg,#FFFCF6 0%,#F2EADB 100%) !important'))
  assert.ok(styles.includes('.wa-plain-guide-steps article'))
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
