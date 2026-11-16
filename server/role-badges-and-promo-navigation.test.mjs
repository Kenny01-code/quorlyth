import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Promotion Studio number badges stay round, uncut and visually distinct by state', async () => {
  const [screen, styles] = await Promise.all([
    source('src/screens/Promote.tsx'),
    source('src/styles/promotion-studio.css'),
  ])

  assert.ok(screen.includes('<nav className="q-promo-steps"'))
  assert.ok(screen.includes('q-promo-step-number__value'))
  assert.ok(screen.includes('q-promo-step-copy'))
  assert.ok(styles.includes('#root #main nav.q-promo-steps > a > span:first-child'))
  assert.ok(styles.includes('width: 36px !important'))
  assert.ok(styles.includes('height: 36px !important'))
  assert.ok(styles.includes('border-radius: 50% !important'))
  assert.ok(styles.includes('q-promo-step-number::before'))
  assert.ok(styles.includes('clip-path: none !important'))
  assert.ok(styles.includes('q-promo-steps > a.q-promo-step'))
  assert.ok(styles.includes('padding: 5px 6px !important'))
  assert.ok(styles.includes('margin: -5px -6px !important'))
  assert.ok(styles.includes('border-radius: 14px !important'))
  assert.ok(styles.includes('color: #e8dfd3 !important'))
  assert.ok(styles.includes('color: #ffad83 !important'))
  assert.ok(styles.includes('is-current > span:first-child'))
})

test('Platform Admin and Community Creator use separate, animated role identities without generic creator sparkles', async () => {
  const [badges, styles, profile, communities, main] = await Promise.all([
    source('src/components/RoleBadges.tsx'),
    source('src/styles/role-badges.css'),
    source('src/screens/Me.tsx'),
    source('src/screens/Communities.tsx'),
    source('src/main.tsx'),
  ])

  assert.ok(badges.includes('export function PlatformAdminBadge'))
  assert.ok(badges.includes('export function CommunityCreatorBadge'))
  assert.ok(badges.includes('COMMUNITY CREATOR'))
  assert.ok(badges.includes('community-creator-seal__branches'))
  assert.ok(!badges.includes('✧'))

  assert.ok(styles.includes('@keyframes platformAdminBreath'))
  assert.ok(styles.includes('@keyframes platformAdminPresence'))
  assert.ok(styles.includes('@keyframes platformAdminSheen'))
  assert.ok(styles.includes('@keyframes platformAdminGlyph'))
  assert.ok(styles.includes('@keyframes communityCreatorBreath'))
  assert.ok(styles.includes('@keyframes communityCreatorSweep'))
  assert.ok(styles.includes('@keyframes communityCreatorMark'))
  assert.ok(styles.includes('@media (prefers-reduced-motion: reduce)'))

  assert.ok(profile.includes("import { CommunityCreatorBadge, PlatformAdminBadge } from '../components/RoleBadges'"))
  assert.ok(profile.includes('<CommunityCreatorBadge />'))
  assert.ok(profile.includes('<CommunityCreatorBadge compact />'))
  assert.ok(!profile.includes('✧ COMMUNITY OWNER'))
  assert.ok(communities.includes("import { CommunityCreatorBadge } from '../components/RoleBadges'"))
  assert.ok(communities.includes('<CommunityCreatorBadge />'))
  assert.ok(!communities.includes('✧</span> COMMUNITY CREATOR'))
  assert.ok(main.indexOf("import './styles/role-badges.css'") > main.indexOf("import './styles/contrast-hardening.css'"))
})
