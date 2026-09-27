import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { chat, json } from './openai.mjs'

const originalFetch = globalThis.fetch
const originalGeminiKey = process.env.GEMINI_API_KEY

function response() {
  return {
    statusCode: 0,
    headers: {},
    output: '',
    setHeader(key, value) { this.headers[key] = value },
    write(value) { this.output += value },
    end(value = '') { this.output += value; this.ended = true },
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalGeminiKey
})

test('chat uses Gemini server-side and streams text as Quorlyth SSE', async () => {
  process.env.GEMINI_API_KEY = 'test-secret'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { system: 'Be helpful', tier: 'quick', messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.match(request.url, /gemini-3\.5-flash-lite:streamGenerateContent/)
  assert.equal(request.options.headers['x-goog-api-key'], 'test-secret')
  assert.match(res.output, /"t":"Hello"/)
  assert.match(res.output, /"done":true/)
})

test('structured JSON requests use Gemini JSON output mode', async () => {
  process.env.GEMINI_API_KEY = 'test-secret'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 })
  }
  const res = response()
  await json({ body: { prompt: 'Return ok', system: 'Return JSON only' } }, res)

  assert.match(request.url, /gemini-3\.8-flash:generateContent/)
  assert.equal(JSON.parse(request.options.body).generationConfig.responseMimeType, 'application/json')
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.output), { ok: true })
})

test('chat retries the lighter Gemini model when the primary is overloaded', async () => {
  process.env.GEMINI_API_KEY = 'test-secret'
  const requested = []
  globalThis.fetch = async url => {
    requested.push(String(url))
    if (requested.length === 1) return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 })
    return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Backup reply"}]}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.match(requested[0], /gemini-3\.8-flash:streamGenerateContent/)
  assert.match(requested[1], /gemini-3\.5-flash-lite:streamGenerateContent/)
  assert.match(res.output, /Backup reply/)
})
