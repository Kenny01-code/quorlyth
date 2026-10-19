import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAiServer } from './railway-server.mjs'

const allowedOrigin = 'https://quorlyth.vercel.app'

async function withServer(t, options = {}) {
  const server = createAiServer({
    allowedOrigins: [allowedOrigin],
    handlers: { '/api/chat': (_req, res) => { res.statusCode = 200; res.end('ok') } },
    ...options,
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('health endpoint responds without AI keys or an Origin header', async t => {
  const base = await withServer(t)
  const response = await fetch(base + '/healthz')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', service: 'quorlyth-ai' })
})

test('rejects calls from an unapproved origin', async t => {
  const base = await withServer(t)
  const response = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
  })
  assert.equal(response.status, 403)
})

test('allows preflight and calls from the configured Quorlyth origin', async t => {
  const base = await withServer(t)
  const preflight = await fetch(base + '/api/chat', {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
  })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/i)

  const response = await fetch(base + '/api/chat', {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin)
  assert.equal(await response.text(), 'ok')
})

test('throttles requests that exceed the configured per-minute limit', async t => {
  const base = await withServer(t, { rateLimitPerMinute: 1 })
  const send = () => fetch(base + '/api/chat', {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
  })
  assert.equal((await send()).status, 200)
  const limited = await send()
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) >= 1)
})
