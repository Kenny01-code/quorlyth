import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { chat, json, realtimeSession, speak, speakElevenLabs, speakStream } from './openai.mjs'

const originalFetch = globalThis.fetch
const originalGeminiKey = process.env.GEMINI_API_KEY
const originalOpenAIKey = process.env.OPENAI_API_KEY
const originalElevenLabsKey = process.env.ELEVENLABS_API_KEY
const originalElevenLabsTtsModel = process.env.ELEVENLABS_TTS_MODEL
const originalElevenLabsNigerianVoiceId = process.env.ELEVENLABS_VOICE_NIGERIAN_ID
const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL
const originalXaiKey = process.env.XAI_API_KEY
const originalXaiModel = process.env.XAI_MODEL
const originalXaiQuickModel = process.env.XAI_QUICK_MODEL
const originalAiProvider = process.env.AI_PROVIDER
const originalAiTtsProvider = process.env.AI_TTS_PROVIDER
const originalFirstTokenTimeout = process.env.AI_FIRST_TOKEN_TIMEOUT_MS
const originalGeminiProviderTimeout = process.env.AI_GEMINI_PROVIDER_TIMEOUT_MS
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
  if (originalElevenLabsKey === undefined) delete process.env.ELEVENLABS_API_KEY
  else process.env.ELEVENLABS_API_KEY = originalElevenLabsKey
  if (originalElevenLabsTtsModel === undefined) delete process.env.ELEVENLABS_TTS_MODEL
  else process.env.ELEVENLABS_TTS_MODEL = originalElevenLabsTtsModel
  if (originalElevenLabsNigerianVoiceId === undefined) delete process.env.ELEVENLABS_VOICE_NIGERIAN_ID
  else process.env.ELEVENLABS_VOICE_NIGERIAN_ID = originalElevenLabsNigerianVoiceId
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
  if (originalAiTtsProvider === undefined) delete process.env.AI_TTS_PROVIDER
  else process.env.AI_TTS_PROVIDER = originalAiTtsProvider
  if (originalFirstTokenTimeout === undefined) delete process.env.AI_FIRST_TOKEN_TIMEOUT_MS
  else process.env.AI_FIRST_TOKEN_TIMEOUT_MS = originalFirstTokenTimeout
  if (originalGeminiProviderTimeout === undefined) delete process.env.AI_GEMINI_PROVIDER_TIMEOUT_MS
  else process.env.AI_GEMINI_PROVIDER_TIMEOUT_MS = originalGeminiProviderTimeout
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
  assert.match(body.session.instructions, /^Be helpful/)
  assert.match(body.session.instructions, /natural.*conversational/i)
  assert.equal(body.session.audio.output.voice, 'coral')
  assert.equal(JSON.parse(res.output).token, 'ephemeral-test-token')
  assert.equal(JSON.parse(res.output).model, 'gpt-realtime-2.1')
})

test('live voice can use multilingual text-only output for ElevenLabs playback', async () => {
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  let request
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options }
    return new Response(JSON.stringify({ value: 'ephemeral-text-token' }), { status: 200 })
  }
  const res = response()
  await realtimeSession({ body: { instructions: 'Be helpful', voice: 'marin', accent: 'international', textOnly: true } }, res)

  assert.equal(request.url, 'https://api.openai.com/v1/realtime/client_secrets')
  const payload = JSON.parse(request.options.body)
  assert.equal(payload.session.output_modalities[0], 'text')
  assert.equal(payload.session.audio.input.turn_detection.create_response, false)
  assert.equal(payload.session.audio.input.transcription.model, 'gpt-4o-mini-transcribe')
  assert.equal('language' in payload.session.audio.input.transcription, false)
  assert.equal('output' in payload.session.audio, false)
  assert.match(payload.session.instructions, /multilingual live conversation/i)
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

test('a timed-out Gemini JSON request falls through to Grok', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.AI_GEMINI_PROVIDER_TIMEOUT_MS = '1000'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted by timeout')), { once: true })
      })
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"A better idea","body":"A clear next step","tags":["test"]}' } }] }), { status: 200 })
  }

  const res = response()
  await json({ body: { prompt: 'Organize a rough idea', system: 'Return JSON only', tier: 'quick' } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0], /generativelanguage\.googleapis\.com/)
  assert.match(requested[1], /api\.x\.ai\/v1\/chat\/completions/)
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.output).title, 'A better idea')
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

test('structured JSON reports exhausted OpenAI credits with a useful retryable error', async () => {
  process.env.AI_PROVIDER = 'openai'
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  delete process.env.XAI_API_KEY
  delete process.env.GEMINI_API_KEY
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 'credit_balance_exhausted', message: 'credit balance is exhausted' },
  }), { status: 429 })

  const res = response()
  await json({ body: { prompt: 'Organize a rough idea', system: 'Return JSON only', tier: 'quick' } }, res)

  const payload = JSON.parse(res.output)
  assert.equal(res.statusCode, 503)
  assert.equal(payload.retryable, true)
  assert.match(payload.error, /OpenAI account has no API credits remaining/i)
})

test('chat recovers with a structured JSON reply when streaming fails', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  delete process.env.XAI_API_KEY
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), options })
    if (String(url).includes(':streamGenerateContent')) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE' } }), { status: 503 })
    }
    assert.match(String(url), /gemini-3\.8-flash:generateContent/)
    assert.equal(JSON.parse(options.body).generationConfig.responseMimeType, 'application/json')
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: 'Recovered without streaming.' }) }] } }],
    }), { status: 200 })
  }

  const res = response()
  await chat({ body: { system: 'Be helpful', tier: 'smart', messages: [{ role: 'user', content: 'Hi there' }] } }, res)

  assert.equal(requested.length, 2)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Content-Type'], /text\/event-stream/)
  assert.match(res.output, /"t":"Recovered without streaming\."/)
  assert.match(res.output, /"done":true/)
})
test('chat tries structured recovery before returning unavailable when Gemini streaming fails', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-secret'
  delete process.env.XAI_API_KEY
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async url => {
    requested.push(String(url))
    return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 })
  }
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0], /gemini-3\.8-flash:streamGenerateContent/)
  assert.match(requested[1], /gemini-3\.8-flash:generateContent/)
  assert.equal(res.statusCode, 503)
})

test('chat switches to Grok when Gemini returns headers but stalls before its first chunk', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  process.env.AI_FIRST_TOKEN_TIMEOUT_MS = '1000'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response('data: {"choices":[{"delta":{"content":"Grok recovered quickly"}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0], /gemini-3\.8-flash:streamGenerateContent/)
  assert.match(requested[1], /api\.x\.ai\/v1\/chat\/completions/)
  assert.match(res.output, /Grok recovered quickly/)
  assert.equal(res.statusCode, 200)
})

test('chat fails over from overloaded Gemini directly to Grok without repeating Gemini', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 })
    }
    return new Response('data: {"choices":[{"delta":{"content":"Grok saved the reply"}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { tier: 'smart', messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0], /gemini-3\.8-flash:streamGenerateContent/)
  assert.match(requested[1], /api\.x\.ai\/v1\/chat\/completions/)
  assert.match(res.output, /Grok saved the reply/)
  assert.match(res.output, /"done":true/)
  assert.equal(res.statusCode, 200)
})

test('structured JSON fails over from unavailable Gemini to Grok immediately', async () => {
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
  assert.equal(requested.length, 2)
  assert.match(requested[1], /api\.x\.ai\/v1\/chat\/completions/)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(res.output), { fallback: true })
})

test('chat falls through from Gemini to Grok to OpenAI without same-provider retries', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  process.env.XAI_API_KEY = 'test-xai-secret'
  process.env.OPENAI_API_KEY = 'test-openai-secret'
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
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
  assert.equal(requested.length, 3)
  assert.match(res.output, /OpenAI backup reply/)
  assert.match(res.output, /"done":true/)
  assert.equal(res.statusCode, 200)
})

test('chat fails over to Grok when Gemini fails before returning headers', async () => {
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
  assert.equal(requested.length, 2)
  assert.match(requested[1], /api\.x\.ai\/v1\/chat\/completions/)
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

test('natural voice uses Grok first when Grok is selected', async () => {
  process.env.AI_PROVIDER = 'grok'
  process.env.XAI_API_KEY = 'test-xai-tts-key'
  process.env.GEMINI_API_KEY = 'test-gemini-tts-key'
  delete process.env.ELEVENLABS_API_KEY
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), options })
    return new Response(Buffer.from([1, 2, 3, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }
  const res = response()
  await speak({ body: { text: 'Hello from Quorlyth', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requested.length, 1)
  assert.equal(requested[0].url, 'https://api.x.ai/v1/tts')
  assert.equal(requested[0].options.headers.Authorization, 'Bearer test-xai-tts-key')
  assert.equal(JSON.parse(requested[0].options.body).voice_id, 'carina')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'grok')
  assert.equal(res.headers['Content-Type'], 'audio/mpeg')
})

test('natural voice falls through from Grok payment errors to Gemini TTS immediately', async () => {
  process.env.AI_PROVIDER = 'grok'
  process.env.XAI_API_KEY = 'test-xai-tts-key'
  process.env.GEMINI_API_KEY = 'test-gemini-tts-key'
  delete process.env.ELEVENLABS_API_KEY
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), options })
    if (String(url).includes('api.x.ai')) {
      return new Response(JSON.stringify({ error: { code: 'payment_required' } }), { status: 402 })
    }
    return new Response(JSON.stringify({ output_audio: { data: Buffer.from([5, 6, 7, 8]).toString('base64') } }), { status: 200 })
  }
  const res = response()
  await speak({ body: { text: 'Hello from Quorlyth', voice: 'coral', accent: 'american' } }, res)

  assert.equal(requested.length, 2)
  assert.equal(requested[0].url, 'https://api.x.ai/v1/tts')
  assert.equal(requested[1].url, 'https://generativelanguage.googleapis.com/v1beta/interactions')
  assert.equal(JSON.parse(requested[1].options.body).model, 'gemini-3.8-flash-tts')
  assert.equal(JSON.parse(requested[1].options.body).generation_config.speech_config[0].voice, 'Kore')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'gemini')
  assert.equal(res.headers['Content-Type'], 'audio/wav')
})

test('chat switches to Gemini when Grok requires payment instead of retrying Grok', async () => {
  process.env.AI_PROVIDER = 'grok'
  process.env.XAI_API_KEY = 'test-xai-secret'
  process.env.GEMINI_API_KEY = 'test-gemini-secret'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    if (String(url).includes('api.x.ai')) {
      return new Response(JSON.stringify({ error: { code: 'payment_required' } }), { status: 402 })
    }
    return new Response('data: {"candidates":[{"content":{"parts":[{"text":"Gemini backup"}]}}]}\n\n', { status: 200 })
  }
  const res = response()
  await chat({ body: { messages: [{ role: 'user', content: 'Hi' }] } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0], /api\.x\.ai\/v1\/chat\/completions/)
  assert.match(requested[1], /generativelanguage\.googleapis\.com/)
  assert.match(res.output, /Gemini backup/)
  assert.equal(res.statusCode, 200)
})

test('natural voice endpoint applies the selected accent using server-side OpenAI fallback', async () => {
  process.env.AI_PROVIDER = 'openai'
  delete process.env.XAI_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.ELEVENLABS_API_KEY
  process.env.OPENAI_API_KEY = 'server-only-test-key'
  let requestUrl = ''
  let requestOptions
  globalThis.fetch = async (url, options = {}) => {
    requestUrl = String(url)
    requestOptions = options
    return new Response(Buffer.from([1, 2, 3, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }

  const res = response()
  await speak({ body: { text: 'Good morning. How are you doing today?', voice: 'coral', accent: 'nigerian' } }, res)

  assert.equal(requestUrl, 'https://api.openai.com/v1/audio/speech')
  assert.equal(requestOptions.headers.Authorization, 'Bearer server-only-test-key')
  const payload = JSON.parse(requestOptions.body)
  assert.equal(payload.voice, 'coral')
  assert.equal(payload.input, 'Good morning. How are you doing today?')
  assert.match(payload.instructions, /Nigerian English pronunciation/i)
  assert.match(payload.instructions, /natural.*conversational/i)
  assert.equal(payload.response_format, 'mp3')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Content-Type'], 'audio/mpeg')
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'openai')
  assert.ok(res.output.length > 0)
})

test('ElevenLabs is preferred for natural voice even when Grok is selected for chat', async () => {
  process.env.ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5'
  process.env.AI_PROVIDER = 'grok'
  process.env.AI_TTS_PROVIDER = 'elevenlabs'
  process.env.XAI_API_KEY = 'test-xai-key'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-test-key'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), options })
    return new Response(Buffer.from([4, 3, 2, 1]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }

  const res = response()
  await speak({ body: { text: 'Hey, how are you doing?', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requested.length, 1)
  assert.equal(requested[0].url, 'https://api.elevenlabs.io/v1/text-to-speech/9BWtsMINqrJLrRacOk9x?output_format=mp3_44100_128')
  assert.equal(requested[0].options.headers['xi-api-key'], 'server-only-elevenlabs-test-key')
  const payload = JSON.parse(requested[0].options.body)
  assert.equal(payload.model_id, 'eleven_flash_v2_5')
  assert.equal(payload.text, 'Hey, how are you doing?')
  assert.equal(payload.voice_settings.stability, 0.48)
  assert.equal(payload.voice_settings.similarity_boost, 0.82)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Content-Type'], 'audio/mpeg')
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'elevenlabs')
  assert.ok(res.output.length > 0)
})

test('voice falls back from ElevenLabs payment errors to Grok without trying Gemini first', async () => {
  process.env.AI_PROVIDER = 'gemini'
  process.env.AI_TTS_PROVIDER = 'elevenlabs'
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-test-key'
  process.env.XAI_API_KEY = 'test-xai-key'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  delete process.env.OPENAI_API_KEY
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), options })
    if (String(url).includes('api.elevenlabs.io')) {
      return new Response(JSON.stringify({ detail: { status: 'payment_required' } }), { status: 402 })
    }
    if (String(url).includes('api.x.ai')) {
      return new Response(Buffer.from([3, 2, 1]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    }
    throw new Error('Unexpected provider should not be reached')
  }

  const res = response()
  await speak({ body: { text: 'Hello there', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0].url, /api\.elevenlabs\.io\/v1\/text-to-speech/)
  assert.equal(requested[1].url, 'https://api.x.ai/v1/tts')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'grok')
})

test('natural voice falls back to OpenAI when ElevenLabs fails', async () => {
  process.env.AI_PROVIDER = 'auto'
  delete process.env.XAI_API_KEY
  delete process.env.GEMINI_API_KEY
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-test-key'
  process.env.OPENAI_API_KEY = 'server-only-openai-test-key'
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push({ url: String(url), options })
    if (String(url).includes('api.elevenlabs.io')) return new Response(JSON.stringify({ detail: 'invalid key' }), { status: 401 })
    return new Response(Buffer.from([8, 7, 6]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }

  const res = response()
  await speak({ body: { text: 'Hello there', voice: 'cedar', accent: 'american' } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0].url, /api\.elevenlabs\.io\/v1\/text-to-speech/)
  assert.equal(requested[1].url, 'https://api.openai.com/v1/audio/speech')
  assert.equal(requested[1].options.headers.Authorization, 'Bearer server-only-openai-test-key')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'openai')
})

test('a configured Nigerian ElevenLabs voice ID is used instead of a mismatched default accent', async () => {
  process.env.AI_PROVIDER = 'auto'
  delete process.env.XAI_API_KEY
  delete process.env.GEMINI_API_KEY
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-test-key'
  process.env.ELEVENLABS_VOICE_NIGERIAN_ID = 'user-owned-nigerian-voice-id'
  delete process.env.OPENAI_API_KEY
  let requestUrl = ''
  let requestOptions
  globalThis.fetch = async (url, options = {}) => {
    requestUrl = String(url)
    requestOptions = options
    return new Response(Buffer.from([9, 8, 7]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }

  const res = response()
  await speak({ body: { text: 'Good morning', voice: 'marin', accent: 'nigerian' } }, res)

  assert.equal(requestUrl, 'https://api.elevenlabs.io/v1/text-to-speech/user-owned-nigerian-voice-id?output_format=mp3_44100_128')
  assert.equal(requestOptions.headers['xi-api-key'], 'server-only-elevenlabs-test-key')
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'elevenlabs')
})

test('a Nigerian accent never silently uses an American ElevenLabs voice', async () => {
  process.env.AI_PROVIDER = 'auto'
  delete process.env.XAI_API_KEY
  delete process.env.GEMINI_API_KEY
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-test-key'
  process.env.OPENAI_API_KEY = 'server-only-openai-test-key'
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    return new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }

  const res = response()
  await speak({ body: { text: 'Welcome to Quorlyth', voice: 'marin', accent: 'nigerian' } }, res)

  assert.deepEqual(requested, ['https://api.openai.com/v1/audio/speech'])
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'openai')
})

test('speech endpoint refuses to silently substitute a default Studio voice', async () => {
  const res = response()
  await speak({ body: { text: 'Hello from QuorlythBot' } }, res)

  assert.equal(res.statusCode, 400)
  assert.match(JSON.parse(res.output).error, /choose a voice.*Voice Studio/i)
})


test('streaming ElevenLabs voice begins sending MP3 before the full clip is generated', async () => {
  process.env.ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5'
  process.env.AI_TTS_PROVIDER = 'elevenlabs'
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-stream-test-key'
  delete process.env.XAI_API_KEY
  delete process.env.GEMINI_API_KEY
  delete process.env.OPENAI_API_KEY
  let requestUrl = ''
  let requestOptions
  globalThis.fetch = async (url, options = {}) => {
    requestUrl = String(url)
    requestOptions = options
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([4, 3, 2]))
        controller.close()
      },
    }), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }

  const res = response()
  await speakStream({ body: { text: 'Hello, I am here.', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requestUrl, 'https://api.elevenlabs.io/v1/text-to-speech/9BWtsMINqrJLrRacOk9x/stream?output_format=mp3_22050_32')
  assert.equal(requestOptions.headers['xi-api-key'], 'server-only-elevenlabs-stream-test-key')
  assert.equal(JSON.parse(requestOptions.body).model_id, 'eleven_flash_v2_5')
  assert.equal(res.headers['Content-Type'], 'audio/mpeg')
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'elevenlabs')
  assert.equal(res.headers['X-Quorlyth-Voice-Stream'], '1')
  assert.ok(res.output.length > 0)
})

test('streaming voice falls back from ElevenLabs payment errors to Grok before other providers', async () => {
  process.env.AI_TTS_PROVIDER = 'elevenlabs'
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-stream-test-key'
  process.env.XAI_API_KEY = 'test-xai-stream-fallback-key'
  process.env.GEMINI_API_KEY = 'test-gemini-stream-fallback-key'
  process.env.OPENAI_API_KEY = 'test-openai-stream-fallback-key'
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    if (String(url).includes('api.elevenlabs.io')) {
      return new Response(JSON.stringify({ detail: { status: 'payment_required' } }), { status: 402 })
    }
    if (String(url) === 'https://api.x.ai/v1/tts') {
      return new Response(new Uint8Array([73, 68, 51, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    }
    throw new Error('Grok should be the first configured fallback')
  }

  const res = response()
  await speakStream({ body: { text: 'Hello there', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requested.length, 2)
  assert.match(requested[0], /api\.elevenlabs\.io\/v1\/text-to-speech\/.*\/stream/)
  assert.equal(requested[1], 'https://api.x.ai/v1/tts')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'grok')
})

test('streaming voice uses Grok when the ElevenLabs key is missing', async () => {
  process.env.AI_TTS_PROVIDER = 'elevenlabs'
  delete process.env.ELEVENLABS_API_KEY
  process.env.XAI_API_KEY = 'test-xai-stream-fallback-key'
  process.env.GEMINI_API_KEY = 'test-gemini-stream-fallback-key'
  process.env.OPENAI_API_KEY = 'test-openai-stream-fallback-key'
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    if (String(url) === 'https://api.x.ai/v1/tts') {
      return new Response(new Uint8Array([73, 68, 51, 4]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
    }
    throw new Error('Only the first available alternative should be requested')
  }

  const res = response()
  await speakStream({ body: { text: 'Hello there', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requested.length, 1)
  assert.equal(requested[0], 'https://api.x.ai/v1/tts')
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['X-Quorlyth-Voice-Provider'], 'grok')
})


test('buffered ElevenLabs retry never falls back to another voice provider', async () => {
  process.env.ELEVENLABS_API_KEY = 'server-only-elevenlabs-buffered-test-key'
  process.env.XAI_API_KEY = 'test-xai-buffered-fallback-key'
  process.env.GEMINI_API_KEY = 'test-gemini-buffered-fallback-key'
  process.env.OPENAI_API_KEY = 'test-openai-buffered-fallback-key'
  const requested = []
  globalThis.fetch = async (url, options = {}) => {
    requested.push(String(url))
    if (String(url).includes('api.elevenlabs.io')) {
      return new Response(JSON.stringify({ detail: { status: 'payment_required' } }), { status: 402 })
    }
    throw new Error('Only ElevenLabs may be requested')
  }

  const res = response()
  await speakElevenLabs({ body: { text: 'Hello there', voice: 'marin', accent: 'american' } }, res)

  assert.equal(requested.length, 1)
  assert.match(requested[0], /api\.elevenlabs\.io\/v1\/text-to-speech/)
  assert.equal(res.statusCode, 503)
  assert.match(JSON.parse(res.output).error, /No alternate voice/i)
})
