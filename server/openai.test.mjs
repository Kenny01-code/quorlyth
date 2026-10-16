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
const originalYoutubeKey = process.env.YOUTUBE_API_KEY

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
  if (originalYoutubeKey === undefined) delete process.env.YOUTUBE_API_KEY
  else process.env.YOUTUBE_API_KEY = originalYoutubeKey
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
  assert.equal(JSON.parse(request.options.body).generationConfig.maxOutputTokens, 768)
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

test('chat fails over from overloaded Gemini models to Grok automatically', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options) => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 })
    }
    assert.equal(String(url), 'https://api.x.ai/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer test-xai-secret')
    return new Response('data: {"choices":[{"delta":{"content":"Grok saved the reply"}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { tier: 'smart', messages: [{ role: 'user', content: 'Hi' }] } }, res)
  assert.equal(requested.length, 3)
  assert.match(requested[0], /gemini-3\.8-flash:streamGenerateContent/)
  assert.match(requested[1], /gemini-3\.5-flash-lite:streamGenerateContent/)
  assert.match(requested[2], /api\.x\.ai\/v1\/chat\/completions/)
  assert.match(res.output, /Grok saved the reply/)
  assert.match(res.output, /"done":true/)
  assert.equal(res.statusCode, 200)
})

test('structured JSON fails over from unavailable Gemini to Grok', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async url => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), { status: 503 })
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"fallback":true}' } }] }), { status: 200 })
  }
  const res = response()
  await json({ body: { prompt: 'Return fallback', system: 'Return JSON only' } }, res)
  assert.equal(requested.length, 3)
  assert.match(requested[2], /api\.x\.ai\/v1\/chat\/completions/)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.output), { fallback: true })
})

test('chat falls through from Gemini and unavailable Grok to OpenAI', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  const requested = []
  globalThis.fetch = async (url, options) => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), { status: 503 })
    }
    if (String(url).includes('api.x.ai')) {
      return new Response(JSON.stringify({ error: { message: 'Grok overloaded' } }), { status: 503 })
    }
    assert.equal(String(url), 'https://api.openai.com/v1/chat/completions')
    assert.equal(options.headers.Authorization, 'Bearer test-openai-secret')
    return new Response('data: {"choices":[{"delta":{"content":"OpenAI backup reply"}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { tier: 'smart', messages: [{ role: 'user', content: 'Hi' }] } }, res)
  assert.equal(requested.length, 5)
  assert.match(res.output, /OpenAI backup reply/)
  assert.match(res.output, /"done":true/)
  assert.equal(res.statusCode, 200)
})

test('chat fails over to Grok when Gemini fetches fail before returning headers', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async url => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) throw new Error('simulated network interruption')
    return new Response('data: {"choices":[{"delta":{"content":"Recovered on Grok"}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'Hi' }] } }, res)
  assert.equal(requested.length, 3)
  assert.match(requested[2], /api\.x\.ai\/v1\/chat\/completions/)
  assert.match(res.output, /Recovered on Grok/)
  assert.equal(res.statusCode, 200)
})

test('exhausted providers return a calm retryable message instead of the old Gemini error', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  delete process.env.XAI_API_KEY
  delete process.env.OPENAI_API_KEY
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 })
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'Hi' }] } }, res)
  const payload = JSON.parse(res.output)
  assert.equal(res.statusCode, 503)
  assert.equal(payload.retryable, true)
  assert.match(payload.error, /available AI services/i)
  assert.doesNotMatch(payload.error, /Gemini is under heavy demand/i)
})


test('structured idea review includes real YouTube evidence server-side and returns the signal section', async () => {
  process.env.AI_PROVIDER = 'openai'
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  process.env.YOUTUBE_API_KEY = 'test-youtube-secret'
  let providerPrompt = ''
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    const parsedUrl = new URL(String(url))
    requested.push(parsedUrl)
    if (parsedUrl.hostname === 'www.googleapis.com' && parsedUrl.pathname.endsWith('/search')) {
      assert.equal(parsedUrl.searchParams.get('key'), 'test-youtube-secret')
      return new Response(JSON.stringify({ items: [
        { id: { videoId: 'video-e2e' }, snippet: { title: 'Solar study lamp test', channelTitle: 'Real channel', publishedAt: '2026-10-01T00:00:00Z' } },
      ] }), { status: 200 })
    }
    if (parsedUrl.hostname === 'www.googleapis.com' && parsedUrl.pathname.endsWith('/videos')) {
      return new Response(JSON.stringify({ items: [
        { id: 'video-e2e', snippet: { title: 'Solar study lamp test', channelTitle: 'Real channel', publishedAt: '2026-10-01T00:00:00Z' }, statistics: { viewCount: '4300', likeCount: '155', commentCount: '21' } },
      ] }), { status: 200 })
    }
    assert.equal(parsedUrl.hostname, 'api.openai.com')
    const sent = JSON.parse(options.body)
    providerPrompt = sent.messages[1].content
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      reviews: [{ id: 'idea-e2e', originality: 82, feasibility: 76, relevance: 88, reason: 'The idea description identifies a clear use case for students.', youtubeRationale: 'The public video “Solar study lamp test” from Real channel (published 2026-10-01) has 4,300 views and 155 likes.' }],
    }) } }] }), { status: 200 })
  }
  const res = response()
  await json({ body: {
    prompt: 'Review the synthetic idea and return one JSON review.',
    system: 'Return JSON only.',
    tier: 'smart',
    youtubeIdeas: [{ id: 'idea-e2e', title: 'Solar powered study lamp', body: 'Affordable light for students', tags: ['solar', 'education'] }],
  } }, res)
  const payload = JSON.parse(res.output)
  assert.equal(res.statusCode, 200)
  assert.match(providerPrompt, /YOUTUBE SOCIAL SIGNALS/)
  assert.match(providerPrompt, /4300|Recent public video|Real channel/)
  assert.match(providerPrompt, /do not calculate averages/i)
  assert.equal(payload.reviews[0].id, 'idea-e2e')
  assert.equal(payload.youtubeSignalsByIdea['idea-e2e'].videos[0].likeCount, 155)
  assert.equal(payload.youtubeSignalsByIdea['idea-e2e'].expiresAt - payload.youtubeSignalsByIdea['idea-e2e'].fetchedAt, 29 * 24 * 60 * 60 * 1000)
  assert.equal(res.output.includes('test-youtube-secret'), false)
  assert.match(payload.reviews[0].youtubeRationale, /4,300 views/)
  assert.equal(requested.filter(url => url.hostname === 'www.googleapis.com').length, 2)
})

test('idea review without YouTube key still uses AI and returns an explicit fallback', async () => {
  process.env.AI_PROVIDER = 'openai'
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  delete process.env.YOUTUBE_API_KEY
  let requests = 0
  let sentPrompt = ''
  globalThis.fetch = async (url, options = {}) => {
    requests++
    const parsedUrl = new URL(String(url))
    assert.equal(parsedUrl.hostname, 'api.openai.com')
    const sent = JSON.parse(options.body)
    sentPrompt = sent.messages[1].content
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        reviews: [{ id: 'idea-no-key', originality: 70, feasibility: 75, relevance: 80, reason: 'Based on the idea text.', youtubeRationale: '' }],
      }) } }],
    }), { status: 200 })
  }
  const res = response()
  await json({ body: {
    prompt: 'Review the idea using only supplied context.',
    system: 'Return JSON only.',
    tier: 'smart',
    youtubeIdeas: [{ id: 'idea-no-key', title: 'Accessible solar study lamp', body: 'Affordable study lighting', tags: ['solar'] }],
  } }, res)
  const payload = JSON.parse(res.output)
  assert.equal(requests, 1)
  assert.equal(res.statusCode, 200)
  assert.match(sentPrompt, /not configured/i)
  assert.equal(payload.reviews[0].id, 'idea-no-key')
  assert.equal(payload.youtubeSignalsByIdea['idea-no-key'].status, 'not_configured')
  assert.match(payload.youtubeSignalsByIdea['idea-no-key'].message, /AI scoring continued/i)
})

test('rejects oversized chat bodies before calling an AI provider', async () => {
  let fetchCalls = 0
  globalThis.fetch = async () => {
    fetchCalls += 1
    return new Response('data: [DONE]\\n\\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'x'.repeat(300_000) }] } }, res)

  assert.equal(res.statusCode, 413)
  assert.match(JSON.parse(res.output).error, /request body is too large/i)
  assert.equal(fetchCalls, 0)
})

test('returns a 400 for malformed JSON instead of silently treating it as an empty request', async () => {
  const req = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('{not-json', 'utf8')
    },
  }
  const res = response()
  await chat(req, res)

  assert.equal(res.statusCode, 400)
  assert.match(JSON.parse(res.output).error, /valid JSON/i)
})
