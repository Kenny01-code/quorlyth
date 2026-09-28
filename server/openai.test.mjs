import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { chat, json, realtimeSession } from './openai.mjs'

const originalFetch = globalThis.fetch
const originalGeminiKey = process.env.GEMINI_API_KEY
const originalOpenAIKey = process.env.OPENAI_API_KEY
const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL
const originalXaiKey = process.env.XAI_API_KEY
const originalXaiModel = process.env.XAI_MODEL
const originalXaiQuickModel = process.env.XAI_QUICK_MODEL
const originalAiProvider = process.env.AI_PROVIDER

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
  if (originalOpenAIKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = originalOpenAIKey
  if (originalRealtimeModel === undefined) delete process.env.OPENAI_REALTIME_MODEL
  else process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel
  if (originalXaiKey === undefined) delete process.env.XAI_API_KEY
  else process.env.XAI_API_KEY = originalXaiKey
  if (originalXaiModel === undefined) delete process.env.XAI_MODEL
  else process.env.XAI_MODEL = originalXaiModel
  if (originalXaiQuickModel === undefined) delete process.env.XAI_QUICK_MODEL
  else process.env.XAI_QUICK_MODEL = originalXaiQuickModel
  if (originalAiProvider === undefined) delete process.env.AI_PROVIDER
  else process.env.AI_PROVIDER = originalAiProvider
})

test('Grok streams chat from xAI when selected', async () => {
  process.env.AI_PROVIDER = 'grok'
  process.env.XAI_API_KEY = 'test-xai-secret'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return new Response('data: {"choices":[{"delta":{"content":"Grok reply"}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { system: 'Be helpful', tier: 'quick', messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.equal(request.url, 'https://api.x.ai/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer test-xai-secret')
  assert.equal(JSON.parse(request.options.body).model, 'grok-4.7')
  assert.match(res.output, /Grok reply/)
  assert.match(res.output, /"done":true/)
})

test('Grok returns structured JSON for bot skills', async () => {
  process.env.AI_PROVIDER = 'grok'
  process.env.XAI_API_KEY = 'test-xai-secret'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 })
  }
  const res = response()
  await json({ body: { prompt: 'Return ok', system: 'Return JSON only' } }, res)

  assert.equal(request.url, 'https://api.x.ai/v1/chat/completions')
  assert.equal(JSON.parse(request.options.body).response_format.type, 'json_object')
  assert.deepEqual(JSON.parse(res.output), { ok: true })
})

test('live voice mints a GA realtime client secret with the selected voice', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  process.env.OPENAI_REALTIME_MODEL = 'gpt-4o-realtime-preview'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return new Response(JSON.stringify({ value: 'ephemeral-test-token' }), { status: 200 })
  }
  const res = response()
  await realtimeSession({ body: { instructions: 'Be helpful', voice: 'coral' } }, res)

  assert.equal(request.url, 'https://api.openai.com/v1/realtime/client_secrets')
  const body = JSON.parse(request.options.body)
  assert.equal(body.session.type, 'realtime')
  assert.equal(body.session.model, 'gpt-realtime-2.1')
  assert.equal(body.session.instructions, 'Be helpful')
  assert.equal(body.session.audio.output.voice, 'coral')
  assert.equal(JSON.parse(res.output).token, 'ephemeral-test-token')
  assert.equal(JSON.parse(res.output).model, 'gpt-realtime-2.1')
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
  assert.equal(JSON.parse(request.options.body).generationConfig.maxOutputTokens, 1024)
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
  assert.equal(JSON.parse(request.options.body).generationConfig.maxOutputTokens, 2048)
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
