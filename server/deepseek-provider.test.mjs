import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { chat, json } from './openai.mjs'

const originalFetch = globalThis.fetch
const envKeys = [
  'AI_PROVIDER',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'DEEPSEEK_QUICK_MODEL',
  'AI_DEEPSEEK_PROVIDER_TIMEOUT_MS',
  'GEMINI_API_KEY',
  'XAI_API_KEY',
  'OPENAI_API_KEY',
]
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))

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

function useOnlyDeepSeek() {
  process.env.AI_PROVIDER = 'deepseek'
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-secret'
  delete process.env.GEMINI_API_KEY
  delete process.env.XAI_API_KEY
  delete process.env.OPENAI_API_KEY
}

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

test('DeepSeek quick chat streams from the official endpoint with thinking disabled', async () => {
  useOnlyDeepSeek()
  let request
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), options }
    return new Response('data: {"choices":[{"delta":{"content":"DeepSeek reply"}}]}\n\n', { status: 200 })
  }

  const res = response()
  await chat({ body: { tier: 'quick', messages: [{ role: 'user', content: 'Hello' }] } }, res)

  assert.equal(request.url, 'https://api.deepseek.com/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer test-deepseek-secret')
  const payload = JSON.parse(request.options.body)
  assert.equal(payload.model, 'deepseek-flash')
  assert.deepEqual(payload.thinking, { type: 'disabled' })
  assert.equal(payload.stream, true)
  assert.equal('temperature' in payload, false)
  assert.match(res.output, /DeepSeek reply/)
  assert.match(res.output, /"done":true/)
  assert.equal(res.statusCode, 200)
})

test('DeepSeek smart chat uses V4 Pro with thinking enabled', async () => {
  useOnlyDeepSeek()
  let payload
  globalThis.fetch = async (_url, options = {}) => {
    payload = JSON.parse(options.body)
    return new Response('data: {"choices":[{"delta":{"content":"Thoughtful reply"}}]}\n\n', { status: 200 })
  }

  const res = response()
  await chat({ body: { tier: 'smart', messages: [{ role: 'user', content: 'Plan this carefully' }] } }, res)

  assert.equal(payload.model, 'deepseek-v4-pro')
  assert.deepEqual(payload.thinking, { type: 'enabled' })
  assert.match(res.output, /Thoughtful reply/)
})

test('DeepSeek structured requests enable JSON mode and parse the response', async () => {
  useOnlyDeepSeek()
  let request
  globalThis.fetch = async (url, options = {}) => {
    request = { url: String(url), options }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ready":true,"provider":"deepseek"}' } }],
    }), { status: 200 })
  }

  const res = response()
  await json({ body: { prompt: 'Return a JSON object with ready=true.' } }, res)

  assert.equal(request.url, 'https://api.deepseek.com/chat/completions')
  const payload = JSON.parse(request.options.body)
  assert.equal(payload.response_format.type, 'json_object')
  assert.equal(payload.model, 'deepseek-flash')
  assert.deepEqual(JSON.parse(res.output), { ready: true, provider: 'deepseek' })
  assert.equal(res.statusCode, 200)
})

test('auto mode tries DeepSeek first and falls back to Grok when DeepSeek is unavailable', async () => {
  process.env.AI_PROVIDER = 'auto'
  process.env.DEEPSEEK_API_KEY = 'test-deepseek-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  delete process.env.GEMINI_API_KEY
  delete process.env.OPENAI_API_KEY
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (String(url).includes('api.deepseek.com')) {
      return new Response(JSON.stringify({ error: { code: 'server_error' } }), { status: 503 })
    }
    return new Response('data: {"choices":[{"delta":{"content":"Grok fallback"}}]}\n\n', { status: 200 })
  }

  const res = response()
  await chat({ body: { tier: 'quick', messages: [{ role: 'user', content: 'Hello' }] } }, res)

  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, 'https://api.deepseek.com/chat/completions')
  assert.equal(requests[1].url, 'https://api.x.ai/v1/chat/completions')
  assert.match(res.output, /Grok fallback/)
  assert.equal(res.statusCode, 200)
})
