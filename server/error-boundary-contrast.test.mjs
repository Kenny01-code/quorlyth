import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = path => readFile(new URL('../' + path, import.meta.url), 'utf8')

test('standalone Quorlyth error screen uses true-black copy on its light glass card', async () => {
  const [boundary, styles] = await Promise.all([
    source('src/components/AppErrorBoundary.tsx'),
    source('src/styles/contrast-system.css'),
  ])

  assert.match(boundary, /Quorlyth hit a snag\./)
  assert.match(boundary, /Your work should still be saved/)

  const errorInkRule = styles.slice(styles.lastIndexOf('/* Standalone app error screen: keep copy black on its light card. */'))
  assert.match(errorInkRule, /\.app-error > section\.glass[\s\S]*?color:\s*#000000 !important/)
  assert.match(errorInkRule, /:is\(h1,h2,h3,h4,h5,h6,p,span,label,strong,em,b,small,li,blockquote,a\)[\s\S]*?color:\s*#000000 !important/)
  assert.doesNotMatch(errorInkRule, /\.app-error[^}]*button[^}]*color:/)
})
