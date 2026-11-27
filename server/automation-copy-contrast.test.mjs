import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('automation integration and workflow guidance use readable black-on-light copy and real social brand marks', async () => {
  const [screen, styles, brand] = await Promise.all([
    source('src/screens/Automations.tsx'),
    source('src/styles/automation-ai.css'),
    source('src/components/SocialBrandIcon.tsx'),
  ])

  assert.match(screen, /YOUR INTEGRATION CONTEXT/)
  assert.match(screen, /ACCOUNT CHECK COMPLETE/)
  assert.match(screen, /QuorlythBot uses these connection states when planning a workflow/)
  assert.match(screen, /Capability boundary:/)
  assert.match(screen, /<SocialConnectionMark provider=\{connection\.provider\} \/>/)
  assert.match(screen, /case 'linkedin': return <SocialBrandIcon name="linkedin" \/>/)
  assert.match(brand, /linkedin:\s*'/)
  assert.match(screen, /Deadline alerts/)
  assert.match(screen, /Idea review handoff/)
  assert.match(screen, /Task follow-up/)

  assert.match(styles, /\.wa-screen \.wa-connected-services[\s\S]*?background:linear-gradient\(145deg,#FFFCF6 0%,#F2EADB 100%\) !important/)
  assert.match(styles, /\.wa-connected-services :is\(h1,h2,h3,h4,p,span,b,strong,small,em,label\)[\s\S]*?color:#000000 !important/)
  assert.match(styles, /\.wa-connected-services-note[\s\S]*?font-size:13px/)
  assert.match(styles, /\.wa-connected-service b[\s\S]*?font-size:14px/)
  assert.match(styles, /\.wa-runtime-status p[\s\S]*?font-size:13px/)
  assert.match(styles, /\.wa-plain-guide-steps p[\s\S]*?font-size:12px/)
  assert.match(styles, /\.wa-ai-example-prompts>button[\s\S]*?color:#000000 !important/)
})
