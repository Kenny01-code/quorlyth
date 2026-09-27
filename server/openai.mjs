// All OpenAI calls happen here, on the server. The key never reaches the browser.
const KEY = () => process.env.OPENAI_API_KEY
const MODEL = () => process.env.OPENAI_MODEL || 'gpt-4o'
const REALTIME_MODEL = () => process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview'
const GEMINI_KEY = () => process.env.GEMINI_API_KEY
const GEMINI_MODEL = (tier) => tier === 'quick'
  ? process.env.GEMINI_QUICK_MODEL || 'gemini-3.5-flash-lite'
  : process.env.GEMINI_MODEL || 'gemini-3.8-flash'

function needText() {
  if (!GEMINI_KEY() && !KEY()) { const e = new Error('Add GEMINI_API_KEY or OPENAI_API_KEY to the server environment.'); e.status = 500; throw e }
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

async function geminiError(r) {
  let payload = {}
  try { payload = await r.json() } catch {}
  const code = payload.error?.status || payload.error?.code
  if (code === 'RESOURCE_EXHAUSTED' || r.status === 429) return 'Gemini is temporarily unavailable because the API free-tier limit was reached. Check the project and model limits in Google AI Studio, then try again later.'
  if (code === 'UNAVAILABLE' || r.status === 503) return 'Gemini is under heavy demand right now. QuorlythBot tried its backup model too; please try again in a few minutes.'
  if (r.status === 401 || r.status === 403) return 'Gemini rejected the server API key. Check GEMINI_API_KEY in Vercel and redeploy.'
  return payload.error?.message || 'Gemini could not complete this request. Please try again.'
}

async function shouldFallbackGemini(r) {
  if (r.status === 429 || r.status >= 500) return true
  try {
    const payload = await r.clone().json()
    return ['RESOURCE_EXHAUSTED', 'UNAVAILABLE'].includes(payload.error?.status)
  } catch { return false }
}

async function fetchGeminiWithFallback(tier, makeRequest) {
  const primary = GEMINI_MODEL(tier)
  let r = await makeRequest(primary)
  const backup = GEMINI_MODEL(tier === 'quick' ? 'smart' : 'quick')
  if (!r.ok && backup !== primary && await shouldFallbackGemini(r)) r = await makeRequest(backup)
  return r
}

function geminiContents(messages) {
  return messages.filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }))
}

function geminiUrl(model, stream = false) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`
}

async function geminiChat(req, res, body) {
  const { messages = [], system, tier } = body
  const requestBody = JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
    contents: geminiContents(messages),
    generationConfig: { temperature: 0.7 },
  })
  const r = await fetchGeminiWithFallback(tier, model => fetch(geminiUrl(model, true), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY() },
    body: requestBody,
  }))
  if (!r.ok || !r.body) return send(res, r.status || 502, { error: await geminiError(r) })
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  const dec = new TextDecoder()
  let buf = ''
  const emit = line => {
    const l = line.trim()
    if (!l.startsWith('data:')) return
    try {
      const event = JSON.parse(l.slice(5).trim())
      const text = event.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')
      if (text) res.write(`data: ${JSON.stringify({ t: text })}\n\n`)
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
  } catch (e) {
    if (!res.headersSent) return send(res, 502, { error: 'Gemini stream was interrupted. Please try again.' })
    res.end()
  }
}

async function geminiJson(req, res, body) {
  const { prompt = '', system = 'Reply with only valid JSON.', tier } = body
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: String(system) }] },
    contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
    generationConfig: { responseMimeType: 'application/json' },
  })
  const r = await fetchGeminiWithFallback(tier, model => fetch(geminiUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY() },
    body: requestBody,
  }))
  if (!r.ok) return send(res, r.status, { error: await geminiError(r) })
  const payload = await r.json().catch(() => ({}))
  const text = payload.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '{}'
  try { send(res, 200, JSON.parse(text)) }
  catch { send(res, 502, { error: 'Gemini returned an invalid JSON response. Please try again.' }) }
}

/** Streams a chat reply as server-sent events: data: {"t":"next piece of text"} */
export async function chat(req, res) {
  try {
    needText()
    const body = await readBody(req)
    if (GEMINI_KEY()) return await geminiChat(req, res, body)
    const { messages = [], system, tier } = body
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        model: tier === 'quick' ? (process.env.OPENAI_QUICK_MODEL || 'gpt-4o-mini') : MODEL(),
        stream: true,
        temperature: 0.7,
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      }),
    })
    if (!r.ok || !r.body) return send(res, r.status || 500, { error: await providerError(r) })
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    const dec = new TextDecoder()
    let buf = ''
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const l = line.trim()
        if (!l.startsWith('data:')) continue
        const d = l.slice(5).trim()
        if (d === '[DONE]') continue
        try {
          const t = JSON.parse(d).choices?.[0]?.delta?.content
          if (t) res.write(`data: ${JSON.stringify({ t })}\n\n`)
        } catch {}
      }
    }
    res.write('data: {"done":true}\n\n')
    res.end()
  } catch (e) { send(res, e.status || 500, { error: String(e.message || e) }) }
}

/** Returns structured JSON for a prompt. */
export async function json(req, res) {
  try {
    needText()
    const body = await readBody(req)
    if (GEMINI_KEY()) return await geminiJson(req, res, body)
    const { prompt = '', system = 'Reply with only valid JSON.', tier } = body
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        model: tier === 'quick' ? (process.env.OPENAI_QUICK_MODEL || 'gpt-4o-mini') : MODEL(),
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      }),
    })
    const j = await r.json()
    if (!r.ok) return send(res, r.status, { error: j.error?.code === 'credit_balance_exhausted' || j.error?.code === 'insufficient_quota' ? 'QuorlythBot is temporarily unavailable because the OpenAI account has no API credits remaining. Add credits to the OpenAI project connected to this site, then try again.' : j.error?.message || 'The AI service could not complete this request. Please try again.' })
    send(res, 200, JSON.parse(j.choices?.[0]?.message?.content || '{}'))
  } catch (e) { send(res, e.status || 500, { error: String(e.message || e) }) }
}

/** Mints a short lived key so the browser can talk to the Realtime API directly (voice, live). */
export async function realtimeSession(req, res) {
  try {
    needOpenAI('Live voice')
    const { instructions = '', voice = 'alloy', tools = [] } = await readBody(req)
    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        model: REALTIME_MODEL(),
        voice,
        instructions,
        modalities: ['audio', 'text'],
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 450, create_response: true },
        tools,
        tool_choice: 'auto',
      }),
    })
    const j = await r.json()
    if (!r.ok) return send(res, r.status, { error: j.error?.code === 'credit_balance_exhausted' || j.error?.code === 'insufficient_quota' ? 'QuorlythBot is temporarily unavailable because the OpenAI account has no API credits remaining. Add credits to the OpenAI project connected to this site, then try again.' : j.error?.message || 'The AI service could not complete this request. Please try again.' })
    send(res, 200, { token: j.client_secret?.value, model: REALTIME_MODEL() })
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
