import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('anonymous community handoff keeps its intended community while requesting platform access', async () => {
  const access = await source('src/screens/Access.tsx')
  assert.match(access, /params\.get\('community'\) \|\| params\.get\('returnCommunity'\)/)
  assert.match(access, /nextParams\.get\('tab'\) === 'community'/)
  assert.match(access, /'&returnCommunity=' \+ encodeURIComponent\(selectedId\)/)
  assert.match(access, /returnCommunityName=\{selected\?\.name \|\| ''\}/)
  assert.match(access, /platformPending=\{pending\}/)
  assert.match(access, /Your platform access request is under review/)
})

test('anonymous request confirmation explains account setup and no longer points to a blocked form', async () => {
  const access = await source('src/screens/Access.tsx')
  assert.match(access, /Your request has been sent\./)
  assert.match(access, /Create an account or sign in with/)
  assert.match(access, /We've saved \$\{returnCommunityName\} as your intended community/)
  assert.match(access, /Create account or sign in/)
  assert.doesNotMatch(access, /View community application page/)
})

test('signup and Google OAuth return to the exact community application after authentication', async () => {
  const [access, signin, backend] = await Promise.all([
    source('src/screens/Access.tsx'),
    source('src/screens/SignIn.tsx'),
    source('src/backend.ts'),
  ])
  assert.match(access, /const destination = '\/access\?tab=community'/)
  assert.match(access, /&next=' \+ encodeURIComponent\(destination\)/)
  assert.match(signin, /authRedirectUrl = \(\) => new URL\('\/signin\?next=' \+ encodeURIComponent\(next\), window\.location\.origin\)\.toString\(\)/)
  assert.match(signin, /signUpEmail\(email\.trim\(\), password, authRedirectUrl\(\)\)/)
  assert.match(signin, /signInGoogle\(authRedirectUrl\(\)\)/)
  assert.match(backend, /emailRedirectTo: redirectTo \|\| window\.location\.origin/)
  assert.match(backend, /options: \{ redirectTo: redirectTo \|\| window\.location\.origin \}/)
})

test('approved members can continue directly to the community they originally selected', async () => {
  const access = await source('src/screens/Access.tsx')
  assert.match(access, /Continue to \$\{returnCommunityName\}/)
  assert.match(access, /onRefreshStatus=\{\(\) => void refreshPlatformAccessStatus\(\)\}/)
  assert.match(access, /Check access status/)
})

test('all Request Access page write-ups use true black without changing other screens', async () => {
  const [access, styles] = await Promise.all([
    source('src/screens/Access.tsx'),
    source('src/styles/app.css'),
  ])
  assert.match(access, /You can now apply to a community\./)
  assert.match(access, /You already have access\./)
  const blackInkRule = styles.slice(styles.lastIndexOf('/* Request Access typography: keep every piece of page copy in true black ink. */'))
  assert.match(blackInkRule, /\.q-access-page\s*\{\s*color:\s*#000000 !important/)
  assert.match(blackInkRule, /:is\(h1,h2,h3,h4,p,span,label,strong,em,b,small,blockquote,li,legend,dt,dd,a,button\)[\s\S]*?color:\s*#000000 !important/)
  assert.match(blackInkRule, /:is\(input,select,textarea\)[\s\S]*?color:\s*#000000 !important/)
})
