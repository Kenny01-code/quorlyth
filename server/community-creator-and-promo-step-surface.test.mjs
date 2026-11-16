import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('Community creator names stay black and clearly readable in discovery cards and community detail', async () => {
  const [screen, styles, main] = await Promise.all([
    source('src/screens/Communities.tsx'),
    source('src/styles/community-creator-name-contrast.css'),
    source('src/main.tsx'),
  ])

  assert.ok(screen.includes('community-creator-name__link'))
  assert.ok(screen.includes('community-creator-detail__copy'))
  assert.ok(screen.includes('className="lk community-creator-name__link"'))
  assert.ok(styles.includes('#root #main .community-creator-name__link'))
  assert.ok(styles.includes('color: #000000 !important'))
  assert.ok(styles.includes('-webkit-text-fill-color: #000000 !important'))
  assert.ok(styles.includes('font-weight: 700 !important'))
  assert.ok(styles.includes('overflow-wrap: anywhere !important'))
  assert.ok(main.includes("import './styles/community-creator-name-contrast.css'"))
})

test('All four Promotion Studio steps keep complete rounded hover panels and clean circular number discs', async () => {
  const [screen, styles] = await Promise.all([
    source('src/screens/Promote.tsx'),
    source('src/styles/promotion-studio.css'),
  ])

  assert.ok(screen.includes('q-promo-step is-current'))
  assert.ok(screen.includes('q-promo-step-number'))
  assert.ok(screen.includes('q-promo-step-number__value'))
  assert.ok(screen.includes('q-promo-step-copy'))
  assert.ok(styles.includes('/* Final Promotion Studio correction: inset complete hover cards'))
  assert.ok(styles.includes('padding: 5px 6px !important'))
  assert.ok(styles.includes('margin: -5px -6px !important'))
  assert.ok(styles.includes('a.q-promo-step:hover'))
  assert.ok(styles.includes('border-radius: 14px !important'))
  assert.ok(styles.includes('.q-promo-step-number::before'))
  assert.ok(styles.includes('clip-path: none !important'))
  assert.ok(styles.includes('mask-image: none !important'))
  assert.ok(styles.includes('.q-promo-step-copy b'))
})
