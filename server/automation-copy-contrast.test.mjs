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

  assert.match(styles, /\.wa-connected-services \{[^}]*background:linear-gradient\(145deg,rgba\(255,255,255,\.045\),rgba\(255,255,255,\.012\)\),rgba\(3,3,4,\.72\)/s)
  assert.match(styles, /\.wa-connected-service b \{ color:#F0EAD9; font-size:10px;/)
  assert.doesNotMatch(styles, /#FFFCF6|#F2EADB|#FFFEFA|#F5EFE6|#F8F2E8|#EAE0D1|#F4EBDD|#F5AD87|#F7E9D7|color:#000000 !important/)
  assert.match(styles, /\.wa-connected-services-note \{ margin:0; color:#D7CBB9; font-size:9px;/)
  assert.match(styles, /\.wa-runtime-status p \{ margin-top:4px; max-width:780px; color:#D7CBB9; font-size:10px;/)
  assert.match(styles, /\.wa-plain-guide-steps p \{ margin-top:4px; color:#D7CBB9; font-size:9px;/)
  assert.match(styles, /\.wa-ai-example-prompts>button \{ border:1px solid rgba\(255,255,255,\.12\); border-radius:999px; padding:7px 10px; color:#E4DCC9; background:rgba\(255,255,255,\.035\);/)
})
