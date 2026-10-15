import { fetchYouTubeSignalsForIdeas, formatYouTubeSignalsContext } from './youtube.mjs'
// All OpenAI calls happen here, on the server. The key never reaches the browser.
const KEY = () => process.env.OPENAI_API_KEY
const MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o'
const REALTIME_MODEL = () => {
  const configured = process.env.OPENAI_REALTIME_MODEL
  return !configured || configured === 'gpt-4o-realtime-preview' ? 'gpt-realtime-2.1' : configured
}
const GEMINI_KEY = () => process.env.GEMINI_API_KEY
const XAI_KEY = () => process.env.XAI_API_KEY
const XAI_MODEL = (tier) => tier === 'quick'
  ? process.env.XAI_QUICK_MODEL || process.env.XAI_MODEL || 'grok-4.7'
  : process.env.XAI_MODEL || 'grok-4.7'
const TEXT_PROVIDER_ORDER = ['gemini', 'grok', 'openai']

function hasTextProviderKey(provider) {
  if (provider === 'gemini') return Boolean(GEMINI_KEY())
  if (provider === 'grok') return Boolean(XAI_KEY())
  if (provider === 'openai') return Boolean(KEY())
  return false
}

// AI_PROVIDER selects the preferred provider, not a single point of failure.
function textProviders() {
  const selected = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase()
  const order = TEXT_PROVIDER_ORDER.includes(selected)
    ? [selected, ...TEXT_PROVIDER_ORDER.filter(provider => provider !== selected)]
    : TEXT_PROVIDER_ORDER
  return order.filter((provider, index) => order.indexOf(provider) === index && hasTextProviderKey(provider))
}
const GEMINI_MODEL = (tier) => tier === 'quick'
  ? process.env.GEMINI_QUICK_MODEL || 'gemini-3.5-flash-lite'
  : process.env.GEMINI_MODEL || 'gemini-3.8-flash'

function needText() {
  const providers = textProviders()
  if (!providers.length) {
    const e = new Error('No text AI provider is configured. Add GEMINI_API_KEY, XAI_API_KEY, or OPENAI_API_KEY to the server environment.')
    e.status = 503
    throw e
  }
  return providers
}
function needOpenAI(feature) {
  if (!KEY()) { const e = new Error(`${feature} needs OPENAI_API_KEY. Gemini is configured for chat, but does not provide this OpenAI voice endpoint.`); e.status = 503; throw e }
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  const chunks = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}') } catch { return {} }
}
function send(res, status, obj) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

async function providerError(r) {
  let payload = {}
  try { payload = await r.json() } catch {}
  const code = payload.error?.code || payload.error?.type
  if (code === 'credit_balance_exhausted' || code === 'insufficient_quota') {
    return 'QuorlythBot is temporarily unavailable because the OpenAI account has no API credits remaining. Add credits to the OpenAI project connected to this site, then try again.'
  }
  return payload.error?.message || 'The AI service could not complete this request. Please try again.'
}

async function xaiError(r) {
  let payload = {}
  try { payload = await r.json() } catch {}
  if (r.status === 401 || r.status === 403) return 'xAI rejected the server API key. Check XAI_API_KEY in your environment settings.'
  return payload.error?.message || 'Grok could not complete this request. Please try again.'
}

async function geminiError(r) {
  let payload = {}
  try { payload = await r.json() } catch {}
  const code = payload.error?.status || payload.error?.code
  if (code === 'RESOURCE_EXHAUSTED' || r.status === 429) return 'Gemini is temporarily rate-limited.'
  if (code === 'UNAVAILABLE' || r.status === 503) return 'Gemini is temporarily overloaded.'
  if (r.status === 401 || r.status === 403) return 'Gemini rejected the server API key. Check GEMINI_API_KEY in Vercel and redeploy.'
  return payload.error?.message || 'Gemini could not complete this request.'
}

const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const PROVIDER_FALLBACK_STATUSES = new Set([401, 403, 404, ...TRANSIENT_STATUSES])

function isTransientResponse(response) {
  return TRANSIENT_STATUSES.has(response.status) || response.status >= 500
}

function shouldTryAnotherProvider(response) {
  return PROVIDER_FALLBACK_STATUSES.has(response.status) || response.status >= 500
}

async function fetchWithHeaderTimeout(url, options = {}) {
  // Timeout only the wait for response headers, never a healthy streaming body.
  const configuredTimeout = Number(process.env.AI_PROVIDER_TIMEOUT_MS)
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
    ? Math.min(configuredTimeout, 30000)
    : 10000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('AI provider timed out before returning headers')), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function discardResponse(response) {
  try { await response.body?.cancel() } catch {}
}

async function retryTransientRequest(makeRequest) {
  let response
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await makeRequest()
    if (response.ok || !isTransientResponse(response) || attempt === 1) return response
    await discardResponse(response)
    await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)))
  }
  return response
}

async function shouldFallbackGemini(r) {
  if (shouldTryAnotherProvider(r)) return true
  try {
    const payload = await r.clone().json()
    return ['RESOURCE_EXHAUSTED', 'UNAVAILABLE'].includes(payload.error?.status)
  } catch { return false }
}

async function fetchGeminiWithFallback(tier, makeRequest) {
  const primary = GEMINI_MODEL(tier)
  const backup = GEMINI_MODEL(tier === 'quick' ? 'smart' : 'quick')
  let response
  try {
    response = await makeRequest(primary)
  } catch (primaryError) {
    if (backup === primary) throw primaryError
    try { return await makeRequest(backup) } catch { throw primaryError }
  }
  if (!response.ok && backup !== primary && await shouldFallbackGemini(response)) {
    try { return await makeRequest(backup) } catch { return response }
  }
  return response
}

function geminiContents(messages) {
  return messages.filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }))
}

function geminiUrl(model, stream = false) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`
}

async function requestGeminiChat(body) {
  const { messages = [], system, tier } = body
  const lastMessage = Array.isArray(messages) ? messages[messages.length - 1]?.content || '' : ''
  const requestBody = JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
    contents: geminiContents(Array.isArray(messages) ? messages : []),
    ...((String(lastMessage).match(/\b(latest|current|today|tonight|right now|live|breaking|recent|news|weather|forecast|temperature|price today|this week|opening hours|near me|nearby|search the web|look up online|source links)\b/i))
      ? { tools: [{ google_search: {} }] }
      : {}),
    generationConfig: { temperature: 0.55, maxOutputTokens: tier === 'quick' ? 768 : 1536 },
  })
  return fetchGeminiWithFallback(tier, model => fetchWithHeaderTimeout(geminiUrl(model, true), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY() },
    body: requestBody,
  }))
}

async function requestGeminiJson(body) {
  const { prompt = '', system = 'Reply with only valid JSON.', tier } = body
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: String(system) }] },
    contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: tier === 'quick' ? 1024 : 2048 },
  })
  return fetchGeminiWithFallback(tier, model => fetchWithHeaderTimeout(geminiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY() },
    body: requestBody,
  }))
}

function openAICompatibleRequest(provider, body, structured = false) {
  const grok = provider === 'grok'
  const url = grok ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions'
  const key = grok ? XAI_KEY() : KEY()
  const { messages = [], prompt = '', system = 'Reply with only valid JSON.', tier } = body
  const requestBody = structured
    ? {
        model: grok ? XAI_MODEL(tier) : tier === 'quick' ? (process.env.OPENAI_QUICK_MODEL || 'gpt-4o-mini') : MODEL(),
        response_format: { type: 'json_object' },
        max_tokens: tier === 'quick' ? 1024 : 2048,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }
    : {
        model: grok ? XAI_MODEL(tier) : tier === 'quick' ? (process.env.OPENAI_QUICK_MODEL || 'gpt-4o-mini') : MODEL(),
        stream: true,
        temperature: 0.7,
        max_tokens: tier === 'quick' ? 1024 : 2048,
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...(Array.isArray(messages) ? messages : [])],
      }
  return () => fetchWithHeaderTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(requestBody),
  })
}

async function requestProviderChat(provider, body) {
  if (provider === 'gemini') return requestGeminiChat(body)
  return retryTransientRequest(openAICompatibleRequest(provider, body))
}

async function requestProviderJson(provider, body) {
  if (provider === 'gemini') return requestGeminiJson(body)
  return retryTransientRequest(openAICompatibleRequest(provider, body, true))
}

async function chooseProvider(providers, request, requireStream = false) {
  let lastFailure = null
  for (const provider of providers) {
    try {
      const response = await request(provider)
      if (response.ok) {
        if (!requireStream || response.body) return { provider, response }
        lastFailure = { provider, error: new Error('The provider returned no response stream.') }
        continue
      }
      lastFailure = { provider, response }
      if (!shouldTryAnotherProvider(response)) return lastFailure
      await discardResponse(response)
    } catch (error) {
      lastFailure = { provider, error }
    }
  }
  return lastFailure
}

async function providerErrorMessage(provider, response) {
  if (provider === 'gemini') return geminiError(response)
  if (provider === 'grok') return xaiError(response)
  return providerError(response)
}

async function sendProviderFailure(res, failure) {
  const response = failure?.response
  if (response && !shouldTryAnotherProvider(response)) {
    return send(res, response.status || 502, { error: await providerErrorMessage(failure.provider, response) })
  }
  return send(res, 503, {
    error: 'QuorlythBot could not get a response from the available AI services. Please try again shortly.',
    retryable: true,
  })
}

async function streamGeminiResponse(r, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  const dec = new TextDecoder()
  let buf = ''
  const emit = line => {
    const l = line.trim()
    if (!l.startsWith('data:')) return
    try {
      const event = JSON.parse(l.slice(5).trim())
      const text = event.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')
      if (text) res.write('data: ' + JSON.stringify({ t: text }) + '\n\n')
    } catch {}
  }
  try {
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      lines.forEach(emit)
    }
    if (buf) emit(buf)
    res.write('data: {"done":true}\n\n')
    res.end()
  } catch {
    if (!res.headersSent) return send(res, 502, { error: 'The AI response was interrupted before it began.' })
    res.end()
  }
}

async function streamOpenAICompatibleResponse(r, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  const dec = new TextDecoder()
  let buf = ''
  try {
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const l = line.trim()
        if (!l.startsWith('data:')) continue
        const data = l.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const piece = JSON.parse(data).choices?.[0]?.delta?.content
          if (piece) res.write('data: ' + JSON.stringify({ t: piece }) + '\n\n')
        } catch {}
      }
    }
    res.write('data: {"done":true}\n\n')
    res.end()
  } catch {
    if (!res.headersSent) return send(res, 502, { error: 'The AI response was interrupted before it began.' })
    res.end()
  }
}

/** Streams a chat reply. Provider failures are handled before the response starts. */
export async function chat(req, res) {
  try {
    const body = await readBody(req)
    const providers = needText()
    const failure = await chooseProvider(providers, provider => requestProviderChat(provider, body), true)
    if (!failure?.response?.ok || !failure.response.body) return await sendProviderFailure(res, failure)
    if (failure.provider === 'gemini') return await streamGeminiResponse(failure.response, res)
    return await streamOpenAICompatibleResponse(failure.response, res)
  } catch (e) {
    return send(res, e.status || 500, { error: String(e.message || e) })
  }
}

function parseProviderJson(provider, payload) {
  if (provider === 'gemini') {
    const generated = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '{}'
    return JSON.parse(generated)
  }
  return JSON.parse(payload.choices?.[0]?.message?.content || '{}')
}

/** Returns structured JSON for a prompt, failing over on availability and parse errors. */
export async function json(req, res) {
  try {
    const body = await readBody(req)
    const providers = needText()
    let providerBody = body
    let youtubeSignalsByIdea = null
    if (Array.isArray(body.youtubeIdeas)) {
      const { youtubeIdeas, ...safeBody } = body
      const safeIdeas = youtubeIdeas.slice(0, 10).map(idea => ({
        id: String(idea?.id || '').slice(0, 100),
        title: String(idea?.title || '').slice(0, 200),
        body: String(idea?.body || '').slice(0, 600),
        tags: Array.isArray(idea?.tags) ? idea.tags.slice(0, 10).map(tag => String(tag).slice(0, 60)) : [],
      }))
      try {
        const enrichment = await fetchYouTubeSignalsForIdeas(safeIdeas)
        youtubeSignalsByIdea = enrichment.byIdea
      } catch {
        youtubeSignalsByIdea = Object.fromEntries(safeIdeas.map(idea => [idea.id, {
          ideaId: idea.id,
          status: 'unavailable',
          message: 'YouTube enrichment failed unexpectedly. AI scoring continued without external video data.',
          query: '',
          fetchedAt: Date.now(),
          expiresAt: Date.now() + 29 * 24 * 60 * 60 * 1000,
          videos: [],
        }]))
      }
      providerBody = {
        ...safeBody,
        prompt: String(body.prompt || '') + String.fromCharCode(10, 10) + formatYouTubeSignalsContext(youtubeSignalsByIdea)
          + String.fromCharCode(10, 10) + 'Score the idea and write the main reason using idea text and supplied Quorlyth in-app data only; do not let YouTube data affect numeric scores or the main reason. If available, use youtubeRationale for at most one specific video and its exact title/channel/date/individual counts. Do not calculate averages or aggregate video metrics. YouTube counts are external platform data, never Quorlyth votes, members, or in-app activity; missing data cannot imply demand.',
      }
    }
    let lastFailure = null

    for (const provider of providers) {
      let response
      try {
        response = await requestProviderJson(provider, providerBody)
      } catch (error) {
        lastFailure = { provider, error }
        continue
      }

      if (!response.ok) {
        lastFailure = { provider, response }
        if (shouldTryAnotherProvider(response)) {
          await discardResponse(response)
          continue
        }
        return send(res, response.status || 502, { error: await providerErrorMessage(provider, response) })
      }

      try {
        const payload = await response.json()
        const parsed = parseProviderJson(provider, payload)
        if (youtubeSignalsByIdea) {
          const result = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { result: parsed }
          return send(res, 200, { ...result, youtubeSignalsByIdea })
        }
        return send(res, 200, parsed)
      } catch (error) {
        lastFailure = { provider, error }
      }
    }

    return await sendProviderFailure(res, lastFailure)
  } catch (e) {
    return send(res, e.status || 500, { error: String(e.message || e) })
  }
}

/** Mints a short lived key so the browser can talk to the Realtime API directly (voice, live). */
export async function realtimeSession(req, res) {
  try {
    needOpenAI('Live voice')
    const { instructions = '', voice = 'alloy', tools = [] } = await readBody(req)
    const model = REALTIME_MODEL()
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model,
          instructions,
          audio: {
            input: {
              transcription: { model: 'gpt-4o-mini-transcribe' },
              turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 450, create_response: true },
            },
            output: { voice },
          },
          tools,
          tool_choice: 'auto',
        },
      }),
    })
    const j = await r.json()
    if (!r.ok) return send(res, r.status, { error: j.error?.code === 'credit_balance_exhausted' || j.error?.code === 'insufficient_quota' ? 'QuorlythBot is temporarily unavailable because the OpenAI account has no API credits remaining. Add credits to the OpenAI project connected to this site, then try again.' : j.error?.message || 'The AI service could not complete this request. Please try again.' })
    send(res, 200, { token: j.value, model })
  } catch (e) { send(res, e.status || 500, { error: String(e.message || e) }) }
}

/** Natural voice for replies and previews. Returns an mp3. */
export async function speak(req, res) {
  try {
    needOpenAI('Natural voice playback')
    const { text = '', voice = 'coral' } = await readBody(req)
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({ model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts', voice, input: String(text).slice(0, 1500), response_format: 'mp3' }),
    })
    if (!r.ok) return send(res, r.status, { error: (await r.text()).slice(0, 300) })
    res.statusCode = 200
    res.setHeader('Content-Type', 'audio/mpeg')
    res.end(Buffer.from(await r.arrayBuffer()))
  } catch (e) { send(res, e.status || 500, { error: String(e.message || e) }) }
}
