import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('automation integration and workflow guidance retain the original dark surfaces and readable light copy', async () => {
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

  assert.match(styles, /\.wa-screen \.wa-connected-services[\s\S]*?background:#151719 !important/)
  assert.match(styles, /\.wa-connected-services :is\(h1,h2,h3,h4,p,span,b,strong,small,em,label\)[\s\S]*?color:#F0EAD9 !important/)
  assert.doesNotMatch(styles, /#FFFCF6|#F2EADB|#FFFEFA|#F5EFE6|#F8F2E8|#EAE0D1|#F4EBDD|#F5AD87|#F7E9D7|color:#000000 !important/)
  assert.match(styles, /\.wa-connected-services-note[\s\S]*?font-size:13px/)
  assert.match(styles, /\.wa-connected-service b[\s\S]*?font-size:14px/)
  assert.match(styles, /\.wa-runtime-status p[\s\S]*?font-size:13px/)
  assert.match(styles, /\.wa-plain-guide-steps p[\s\S]*?font-size:12px/)
  assert.match(styles, /\.wa-ai-example-prompts>button[\s\S]*?color:#F0EAD9 !important/)
})
