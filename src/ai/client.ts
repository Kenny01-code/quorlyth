// If a dedicated cloud AI service is configured, route AI requests there. An empty value
// preserves the current same-origin Vercel endpoints so deployment can be staged safely.
const AI_API_BASE_URL = (import.meta.env.VITE_AI_API_BASE_URL || '').trim().replace(/\/+$/, '')
function aiApiUrl(path: string): string {
  return AI_API_BASE_URL ? `${AI_API_BASE_URL}${path}` : path
}

export interface BotContextRequest { route?: string; pageContext?: string; projectId?: string; tone?: string; length?: string; emojis?: boolean; browserContext?: string; liveContext?: string; /** Marks requests as part of continuous Live Talk, never as a privileged role. */ liveTalk?: boolean }
export interface StreamOpts { system?: string; tier?: 'quick' | 'smart'; signal?: AbortSignal; onText?: (full: string, piece: string) => void; accessToken?: string; context?: BotContextRequest }

const SPEECH_PRESETS: Record<string, { gender: 'female' | 'male'; rate: number; pitch: number; names: RegExp }> = {
  marin: { gender: 'female', rate: 0.97, pitch: 1.02, names: /jenny|samantha|aria|ava|allison|siri.*female/i },
  cedar: { gender: 'male', rate: 0.97, pitch: 0.98, names: /guy|david|mark|daniel|james|ryan|alex|fred|tom|siri.*male/i },
  coral: { gender: 'female', rate: 0.97, pitch: 1.03, names: /aria|jenny|zira|samantha|victoria|karen|susan|ava|allison|siri.*female/i },
  sage: { gender: 'female', rate: 0.94, pitch: 1.00, names: /samantha|karen|susan|serena|siri.*female/i },
  shimmer: { gender: 'female', rate: 1.00, pitch: 1.06, names: /jenny|zira|ava|siri.*female/i },
  ash: { gender: 'male', rate: 0.94, pitch: 0.93, names: /guy|david|mark|daniel|james|ryan|alex|fred|tom|siri.*male/i },
  echo: { gender: 'male', rate: 0.97, pitch: 0.97, names: /daniel|alex|ryan|mark|siri.*male/i },
  ballad: { gender: 'male', rate: 0.99, pitch: 1.00, names: /guy|james|david|fred|tom|siri.*male/i },
}

export type VoiceAccent = 'auto' | 'nigerian' | 'american' | 'british' | 'international'
export interface SpeechPlayback {
  pause(): void
  resume(): void
  stop(): void
}

function detectAccent(preference: VoiceAccent = 'auto'): Exclude<VoiceAccent, 'auto'> {
  if (preference !== 'auto') return preference
  const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean).map(value => value.replace('_', '-').toLowerCase())
  // Auto mode must not force the Nigerian-only custom voice path; users can still select Nigerian explicitly.
  if (locales.some(value => value === 'en-gb' || value.startsWith('en-gb-') || value === 'en-ie' || value.startsWith('en-ie-'))) return 'british'
  if (locales.some(value => value === 'en-us' || value.startsWith('en-us-') || value === 'en-ca' || value.startsWith('en-ca-'))) return 'american'
  return 'international'
}

function accentLocale(accent: Exclude<VoiceAccent, 'auto'>) {
  return ({ nigerian: 'en-NG', american: 'en-US', british: 'en-GB', international: 'en-001' } as const)[accent]
}

function browserVoice(voice: string, accent: Exclude<VoiceAccent, 'auto'>) {
  const preset = SPEECH_PRESETS[voice] || SPEECH_PRESETS.coral
  const choices = window.speechSynthesis.getVoices().filter(v => /^en(-|$)/i.test(v.lang))
  if (!choices.length) return null

  const locale = accentLocale(accent).toLowerCase()
  const language = locale.split('-')[0]
  const scoreVoice = (candidate: SpeechSynthesisVoice) => {
    const lang = candidate.lang.toLowerCase()
    const identity = candidate.name + ' ' + candidate.lang
    let score = 0

    // Prefer natural voices when the browser exposes them (such as Microsoft Online/Natural voices).
    if (/online|natural|neural|premium|enhanced/i.test(identity)) score += 70
    if (/microsoft|google|apple/i.test(candidate.name)) score += 8
    if (preset.names.test(candidate.name)) score += 42
    if (/compact|robotic|espeak/i.test(identity)) score -= 50

    if (lang === locale) score += 65
    else if (lang.startsWith(language + '-')) score += 22

    if (accent === 'american' && /en-us|united states|american/i.test(identity)) score += 26
    if (accent === 'british' && /en-gb|united kingdom|british|english.*uk/i.test(identity)) score += 26
    if (accent === 'nigerian') {
      if (/en-ng|nigeria|nigerian/i.test(identity)) score += 70
      else if (/en-gb|british|south africa|en-za/i.test(identity)) score += 12
    }
    if (accent === 'international' && /en-001|international|english.*world/i.test(identity)) score += 24
    if (candidate.default) score += 2
    return score
  }

  return [...choices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null
}


async function readError(r: Response) {
  const fallback = r.status === 401
    ? 'Your Quorlyth session could not be verified. Refresh the page and try again.'
    : r.status === 429 || r.status >= 500
      ? 'QuorlythBot is temporarily unavailable. Please try again shortly.'
      : 'QuorlythBot could not process that request. Please check it and try again.'
  try {
    const payload = await r.json()
    const error = typeof payload?.error === 'string' ? payload.error : payload?.error?.message
    const code = payload?.code || payload?.error?.code
    if (code === 'credit_balance_exhausted' || code === 'insufficient_quota') {
      return 'QuorlythBot is temporarily unavailable because its AI service has no credits remaining. Please try again later.'
    }
    const safeClientMessages = [
      'Add a message before starting a chat.',
      'A JSON AI request is required.',
      'Add a prompt before requesting an AI result.',
      'The AI prompt is too large. Shorten it and try again.',
      'Each chat message must have a valid role and text content.',
      'This conversation is too long to send in one request. Shorten the recent messages and retry.',
      'Request body must be valid JSON.',
      'ElevenLabs voice is unavailable right now. Check the ElevenLabs API key and account quota. No alternate voice will be used.',
      'ElevenLabs returned Payment Required (402). Check your ElevenLabs plan, billing, and available credits. No alternate voice was used.',
      'ElevenLabs rejected the API key or its permissions. Check the ElevenLabs API key configured for Quorlyth. No alternate voice was used.',
      'ElevenLabs rate limit reached. Wait briefly or check your ElevenLabs usage limits. No alternate voice was used.',
      'The selected ElevenLabs accent needs a matching voice ID in your ElevenLabs account. No alternate voice will be used.',
      'No text AI provider is configured. Add GEMINI_API_KEY, XAI_API_KEY, or OPENAI_API_KEY to the server environment.',
      'No AI speech provider is configured. Add ELEVENLABS_API_KEY (primary), XAI_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY to the server environment.',
      'QuorlythBot could not prepare voice audio. Each configured speech provider was tried; check the provider quota or retry shortly.',
    ]
    if (typeof error === 'string' && safeClientMessages.includes(error)) return error
    return fallback
  } catch {
    return fallback
  }
}

/** Streams a reply token by token. Resolves with the full text. */
export async function streamChat(messages: { role: 'user' | 'assistant'; content: string }[], o: StreamOpts = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const body: Record<string, unknown> = { messages, tier: o.tier === 'quick' ? 'quick' : 'smart' }
  if (o.accessToken) {
    headers.Authorization = 'Bearer ' + o.accessToken
    body.context = o.context || {}
  } else if (o.system) {
    // Demo and local mode keep using their local sample context. Authenticated
    // Supabase chats never send browser-composed privileged context to the model.
    body.system = o.system
  }
  const r = await fetch(aiApiUrl('/api/chat'), { method: 'POST', signal: o.signal, headers, body: JSON.stringify(body) })
  if (!r.ok || !r.body) throw new Error(await readError(r))
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = '', completed = false, streamError = ''
  const consume = (block: string) => {
    const line = block.split(/\r?\n/).find(x => x.startsWith('data:'))
    if (!line) return
    try {
      const j = JSON.parse(line.slice(5).trim())
      if (typeof j.error === 'string' && j.error.trim()) streamError = j.error
      if (j.t && !streamError) { full += j.t; o.onText?.(full, j.t) }
      if (j.done) completed = true
    } catch {}
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split(/\r?\n\r?\n/)
    buf = parts.pop() || ''
    parts.forEach(consume)
  }
  if (buf.trim()) consume(buf)
  if (streamError) throw new Error(streamError)
  if (!completed) throw new Error('The reply was interrupted before it finished. Please try again.')
  return full
}

export async function askJson<T = any>(prompt: string, o: {
  system?: string
  tier?: 'quick' | 'smart'
  signal?: AbortSignal
  youtubeIdeas?: Array<{ id: string; title: string; body?: string; tags?: string[] }>
  forceYoutubeRefresh?: boolean
} = {}): Promise<T> {
  // Fast-by-default for compact utility tasks, writing help, and small structured actions.
  // Requests with richer evidence payloads stay on the smart tier unless the caller explicitly opts in to quick.
  const tier = o.tier || (prompt.length <= 4200 && !o.youtubeIdeas ? 'quick' : 'smart')
  const r = await fetch(aiApiUrl('/api/json'), {
    method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      system: o.system,
      tier,
      ...(o.youtubeIdeas ? { youtubeIdeas: o.youtubeIdeas } : {}),
      ...(o.forceYoutubeRefresh ? { forceYoutubeRefresh: true } : {}),
    }),
  })
  if (!r.ok) throw new Error(await readError(r))
  return r.json()
}

export type RealtimeEvent =
  | { type: 'state'; state: 'connecting' | 'listening' | 'thinking' | 'speaking' | 'closed' }
  | { type: 'speech_started' }
  | { type: 'user_preview'; text: string }
  | { type: 'user'; text: string }
  | { type: 'bot'; text: string; delta?: string; done: boolean }
  | { type: 'response_done' }
  | { type: 'tool'; name: string; args: any }
  | { type: 'error'; message: string }

export interface RealtimeTool { type: 'function'; name: string; description: string; parameters: any }

/**
 * Live voice conversation over WebRTC with the OpenAI Realtime API.
 * The browser sends your microphone, the model answers with audio instantly, and you can interrupt it.
 */
export async function startRealtime(opts: {
  instructions: string; voice?: string; accent?: VoiceAccent; tools?: RealtimeTool[]; accessToken?: string; context?: BotContextRequest; textOnly?: boolean
  onEvent: (e: RealtimeEvent) => void
  onTool?: (name: string, args: any) => Promise<any> | any
}) {
  opts.onEvent({ type: 'state', state: 'connecting' })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const body: Record<string, unknown> = { voice: opts.voice || 'coral', accent: detectAccent(opts.accent || 'auto'), tools: opts.tools || [], textOnly: opts.textOnly === true }
  if (opts.accessToken) { headers.Authorization = 'Bearer ' + opts.accessToken; body.context = opts.context || {} }
  else body.instructions = opts.instructions
  const s = await fetch(aiApiUrl('/api/realtime-session'), { method: 'POST', headers, body: JSON.stringify(body) })
  if (!s.ok) throw new Error(await readError(s))
  const { token, model } = await s.json()

  const pc = new RTCPeerConnection()
  const audio = document.createElement('audio')
  // In strict ElevenLabs mode the Realtime model emits text only; it must never play its own built-in voice.
  audio.autoplay = !opts.textOnly
  audio.muted = opts.textOnly === true
  pc.ontrack = e => { if (!opts.textOnly) audio.srcObject = e.streams[0] }
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  pc.addTrack(mic.getTracks()[0], mic)
  const dc = pc.createDataChannel('oai-events')
  let botText = ''
  let userText = ''
  const pendingEvents: any[] = []
  const send = (o: any) => {
    if (dc.readyState === 'open') dc.send(JSON.stringify(o))
    else if (dc.readyState === 'connecting') pendingEvents.push(o)
  }

  dc.onmessage = async ev => {
    let m: any
    try { m = JSON.parse(ev.data) } catch { return }
    switch (m.type) {
      case 'input_audio_buffer.speech_started':
        userText = ''
        opts.onEvent({ type: 'speech_started' })
        opts.onEvent({ type: 'state', state: 'listening' }); break
      case 'input_audio_buffer.speech_stopped':
        opts.onEvent({ type: 'state', state: 'thinking' }); break
      case 'conversation.item.input_audio_transcription.delta':
        userText += String(m.delta || '')
        if (userText) opts.onEvent({ type: 'user_preview', text: userText })
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (m.transcript?.trim()) opts.onEvent({ type: 'user', text: m.transcript.trim() })
        userText = ''
        break
      case 'response.audio_transcript.delta':
        botText += m.delta || ''
        opts.onEvent({ type: 'state', state: 'speaking' })
        opts.onEvent({ type: 'bot', text: botText, done: false }); break
      case 'response.audio_transcript.done':
        opts.onEvent({ type: 'bot', text: m.transcript || botText, done: true }); botText = ''; break
      case 'response.output_text.delta': {
        const delta = String(m.delta || '')
        botText += delta
        opts.onEvent({ type: 'bot', text: botText, delta, done: false })
        break
      }
      case 'response.output_text.done':
        opts.onEvent({ type: 'bot', text: m.text || botText, delta: '', done: true }); botText = ''; break
      case 'response.done':
        if (!opts.textOnly) opts.onEvent({ type: 'state', state: 'listening' })
        opts.onEvent({ type: 'response_done' })
        for (const out of m.response?.output || []) {
          if (out.type === 'function_call') {
            let args: any = {}
            try { args = JSON.parse(out.arguments || '{}') } catch {}
            opts.onEvent({ type: 'tool', name: out.name, args })
            const result = await opts.onTool?.(out.name, args)
            send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: out.call_id, output: JSON.stringify(result ?? { ok: true }) } })
            send({ type: 'response.create' })
          }
        }
        break
      case 'error':
        opts.onEvent({ type: 'error', message: m.error?.message || 'Realtime error' }); break
    }
  }
  dc.onopen = () => {
    while (pendingEvents.length) dc.send(JSON.stringify(pendingEvents.shift()))
    opts.onEvent({ type: 'state', state: 'listening' })
  }

  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    const r = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
    })
    if (!r.ok) throw new Error((await r.text()).slice(0, 500) || 'Could not connect to the live voice service')
    await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() })
  } catch (error) {
    try { dc.close() } catch {}
    try { pc.close() } catch {}
    mic.getTracks().forEach(track => track.stop())
    audio.srcObject = null
    throw error
  }

  return {
    say: (text: string) => {
      send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })
      send({ type: 'response.create', ...(opts.textOnly ? { response: { output_modalities: ['text'] } } : {}) })
    },
    respond: () => { if (opts.textOnly) send({ type: 'response.create', response: { output_modalities: ['text'] } }) },
    interrupt: () => {
      send({ type: 'response.cancel' })
      if (!opts.textOnly) send({ type: 'output_audio_buffer.clear' })
    },
    mute: (m: boolean) => mic.getAudioTracks().forEach(t => (t.enabled = !m)),
    stop: () => { try { dc.close() } catch {} ; try { pc.close() } catch {}; mic.getTracks().forEach(t => t.stop()); audio.srcObject = null; opts.onEvent({ type: 'state', state: 'closed' }) },
  }
}

// Voice playback is exclusive across QuorlythBot, Live Talk, and Voice Studio previews.
// Aborting an older request before it reaches playback prevents delayed clips from overlapping.
let speechRun = 0
let activeSpeechController: AbortController | null = null
let activeSpeechPlayback: SpeechPlayback | null = null

export function stopSpeechPlayback(): void {
  speechRun += 1
  const controller = activeSpeechController
  const playback = activeSpeechPlayback
  activeSpeechController = null
  activeSpeechPlayback = null
  controller?.abort()
  playback?.stop()
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}

type StreamSpeechOwnership = {
  isCurrent: () => boolean
  onStart?: () => void
  onEnd?: () => void
  register: (playback: SpeechPlayback) => void
  release: () => void
}

/** Play streamed MP3 chunks through MediaSource; resolves as soon as the first audio begins. */
function streamMediaSourceSpeech(response: Response, signal: AbortSignal, owner: StreamSpeechOwnership): Promise<SpeechPlayback> {
  if (!response.body || typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported('audio/mpeg')) {
    return Promise.reject(new Error('Streaming playback is not supported by this browser.'))
  }

  const mediaSource = new MediaSource()
  const objectUrl = URL.createObjectURL(mediaSource)
  const audio = new Audio()
  audio.preload = 'auto'
  audio.src = objectUrl
  let sourceBuffer: SourceBuffer | null = null
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  let started = false
  let finished = false
  let openTimer = 0
  let resolveStart: (playback: SpeechPlayback) => void = () => {}
  let rejectStart: (error: unknown) => void = () => {}
  const startedPromise = new Promise<SpeechPlayback>((resolve, reject) => { resolveStart = resolve; rejectStart = reject })

  const clearUrl = () => {
    if (openTimer) window.clearTimeout(openTimer)
    URL.revokeObjectURL(objectUrl)
  }
  const finish = (notify = true) => {
    if (finished) return
    finished = true
    signal.removeEventListener('abort', abortAudio)
    clearUrl()
    if (!started) {
      try { audio.pause(); audio.removeAttribute('src'); audio.load() } catch {}
    }
    try { reader?.cancel() } catch {}
    owner.release()
    if (notify) owner.onEnd?.()
  }
  const abortAudio = () => {
    try {
      audio.pause()
      audio.currentTime = 0
      audio.removeAttribute('src')
      audio.load()
    } catch { /* The media element may not have started yet. */ }
    if (!started) rejectStart(new DOMException('Speech cancelled', 'AbortError'))
    finish()
  }
  const playback: SpeechPlayback = {
    pause: () => { if (owner.isCurrent() && !finished) audio.pause() },
    resume: () => { if (owner.isCurrent() && !finished) void audio.play().catch(() => finish()) },
    stop: abortAudio,
  }
  owner.register(playback)
  signal.addEventListener('abort', abortAudio, { once: true })

  const waitForOpen = () => new Promise<void>((resolve, reject) => {
    if (mediaSource.readyState === 'open') { resolve(); return }
    const opened = () => { window.clearTimeout(openTimer); resolve() }
    const closed = () => { window.clearTimeout(openTimer); reject(new Error('The streamed audio source closed before playback.')) }
    mediaSource.addEventListener('sourceopen', opened, { once: true })
    mediaSource.addEventListener('sourceclose', closed, { once: true })
    openTimer = window.setTimeout(() => reject(new Error('Timed out opening the streamed audio source.')), 8000)
  })
  const waitForUpdate = () => new Promise<void>((resolve, reject) => {
    if (!sourceBuffer) { reject(new Error('The audio buffer is not ready.')); return }
    const current = sourceBuffer
    const updated = () => { current.removeEventListener('error', failed); resolve() }
    const failed = () => { current.removeEventListener('updateend', updated); reject(new Error('The streamed audio buffer failed.')) }
    current.addEventListener('updateend', updated, { once: true })
    current.addEventListener('error', failed, { once: true })
  })

  audio.onplay = () => {
    if (!owner.isCurrent()) { abortAudio(); return }
    if (started) return
    started = true
    owner.onStart?.()
    resolveStart(playback)
  }
  audio.onended = () => finish()
  audio.onerror = () => {
    const error = new Error('The streamed voice could not be played.')
    if (!started) rejectStart(error)
    finish(started)
  }

  void (async () => {
    try {
      await waitForOpen()
      if (!owner.isCurrent()) throw new DOMException('Speech cancelled', 'AbortError')
      sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
      reader = response.body!.getReader()
      let receivedAudio = false
      let playRequested = false
      while (true) {
        const next = await reader.read()
        if (!owner.isCurrent()) throw new DOMException('Speech cancelled', 'AbortError')
        if (next.done) break
        if (!next.value?.byteLength) continue
        if (sourceBuffer.updating) await waitForUpdate()
        const chunk = next.value.slice()
        sourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer)
        await waitForUpdate()
        receivedAudio = true
        if (!started && !playRequested) {
          playRequested = true
          // Do not wait for audio.play() before reading the next chunk: some browsers
          // need more than one MP3 fragment buffered before playback can begin.
          void audio.play().catch(error => {
            if (!started) rejectStart(error)
            finish(false)
          })
        }
      }
      if (!receivedAudio) throw new Error('The speech stream returned no audio.')
      if (sourceBuffer.updating) await waitForUpdate()
      if (mediaSource.readyState === 'open') mediaSource.endOfStream()
    } catch (error) {
      if (!started) rejectStart(error)
      finish(started)
    }
  })()

  return startedPromise
}

/** Uses the selected Studio persona through the server-side ElevenLabs endpoint. Device speech is opt-in only; one speech run can play at a time. */
export async function speakText(
  text: string,
  voice: string,
  onStart?: () => void,
  onEnd?: () => void,
  options: { accent?: VoiceAccent; signal?: AbortSignal; onBrowserFallback?: () => void; allowBrowserFallback?: boolean; browserFallbackTimeoutMs?: number; elevenLabsOnly?: boolean; preferElevenLabsVoice?: boolean; liveTalk?: boolean; /** @deprecated Kept as a backwards-compatible alias for preferElevenLabsVoice. */ preferBrowserVoice?: boolean } = {},
): Promise<SpeechPlayback> {
  const accent = detectAccent(options.accent || 'auto')
  const source = text.trim().slice(0, 1500)
  if (!source) throw new Error('There is no text to speak.')
  if (options.signal?.aborted) throw new DOMException('Speech cancelled', 'AbortError')

  // A single shared owner avoids duplicate audio when a message, live response,
  // and voice preview are triggered close together.
  stopSpeechPlayback()
  const run = speechRun
  const controller = new AbortController()
  const externalSignal = options.signal
  const abortFromCaller = () => {
    if (activeSpeechController === controller) stopSpeechPlayback()
    else controller.abort()
  }
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  activeSpeechController = controller
  const signal = controller.signal
  let handedOff = false
  let browserFallbackNotified = false
  let ownedPlayback: SpeechPlayback | null = null

  const isSuperseded = () => signal.aborted || run !== speechRun
  const assertCurrent = () => {
    if (isSuperseded()) throw new DOMException('Speech cancelled or replaced by a newer voice request.', 'AbortError')
  }
  const releaseOwner = () => {
    externalSignal?.removeEventListener('abort', abortFromCaller)
    if (activeSpeechController === controller) activeSpeechController = null
    if (ownedPlayback && activeSpeechPlayback === ownedPlayback) activeSpeechPlayback = null
  }
  const notifyBrowserFallback = () => {
    if (browserFallbackNotified) return
    browserFallbackNotified = true
    options.onBrowserFallback?.()
  }
  const preferElevenLabsVoice = options.preferElevenLabsVoice === true || options.preferBrowserVoice === true

  try {
    // ElevenLabs is the primary voice. Browser speech is reserved for a quick fallback.
    let response: Response | null = null
    let retryBufferedSpeech = false
    let forceBrowserFallback = false
    const providerRequest = new AbortController()
    const abortProviderRequest = () => providerRequest.abort()
    signal.addEventListener('abort', abortProviderRequest, { once: true })
    let providerRequestTimer: number | null = null
    // Bound provider latency, including ElevenLabs-only calls. If browser fallback
    // is enabled, callers can choose a fast timeout; streamed provider failover keeps
    // its longer window. An explicit stop still aborts this request immediately.
    const requestedTimeout = options.browserFallbackTimeoutMs
    const defaultTimeout = options.elevenLabsOnly && options.allowBrowserFallback === true ? 10_000 : 7500
    const providerTimeout = typeof requestedTimeout === 'number' && Number.isFinite(requestedTimeout)
      ? Math.max(250, Math.min(30_000, requestedTimeout))
      : defaultTimeout
    if (preferElevenLabsVoice) {
      providerRequestTimer = window.setTimeout(() => providerRequest.abort(), providerTimeout)
    }
    try {
      response = await fetch(aiApiUrl(options.elevenLabsOnly ? '/api/speak-eleven' : '/api/speak-stream'), {
        method: 'POST',
        signal: providerRequest.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: source, voice, accent, liveTalk: options.liveTalk === true }),
      })
    } catch (error) {
      if (isSuperseded()) throw new DOMException('Speech cancelled', 'AbortError')
      if (preferElevenLabsVoice && options.allowBrowserFallback === true) {
        forceBrowserFallback = true
      } else if (options.elevenLabsOnly) {
        throw new Error('ElevenLabs is temporarily unavailable. No alternate voice will be used.')
      } else {
        // Older routes, network intermediaries, or deployments may not support the streaming endpoint.
        retryBufferedSpeech = true
      }
    } finally {
      if (providerRequestTimer !== null) window.clearTimeout(providerRequestTimer)
      signal.removeEventListener('abort', abortProviderRequest)
    }

    assertCurrent()

    if (response?.ok && response.headers.get('X-Quorlyth-Voice-Stream') === '1' && typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg') && response.body) {
      try {
        const playback = await streamMediaSourceSpeech(response, signal, {
          isCurrent: () => !isSuperseded(),
          onStart,
          onEnd,
          register: next => { ownedPlayback = next; activeSpeechPlayback = next },
          release: releaseOwner,
        })
        assertCurrent()
        handedOff = true
        return playback
      } catch (error) {
        const wasReplaced = isSuperseded() || (error instanceof Error && error.name === 'AbortError')
        if (wasReplaced) throw new DOMException('Speech cancelled', 'AbortError')
        if (preferElevenLabsVoice && options.allowBrowserFallback === true) {
          // Don't wait through a second network request after the primary voice stalls.
          forceBrowserFallback = true
          response = null
        } else {
          // Re-attempt with the same selected persona using the original buffered endpoint.
          retryBufferedSpeech = true
          response = null
          externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
          activeSpeechController = controller
        }
        if (isSuperseded()) throw new DOMException('Speech cancelled', 'AbortError')
      }
    }

    if (!forceBrowserFallback && !response && retryBufferedSpeech) {
      try {
        response = await fetch(aiApiUrl('/api/speak-eleven'), {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: source, voice, accent, liveTalk: options.liveTalk === true }),
        })
      } catch (error) {
        if (isSuperseded() || (error instanceof Error && error.name === 'AbortError')) throw error
      }
      assertCurrent()
    }

    if (!forceBrowserFallback && response && !response.ok) {
      if (preferElevenLabsVoice && options.allowBrowserFallback === true) {
        forceBrowserFallback = true
      } else {
        throw new Error(await readError(response))
      }
    }

    if (!forceBrowserFallback && response?.ok) {
      const blob = await response.blob()
      assertCurrent()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.preload = 'auto'
      let cleaned = false
      let finished = false
      let started = false

      const cleanupUrl = () => {
        if (cleaned) return
        cleaned = true
        URL.revokeObjectURL(url)
      }
      const finish = (notify = true) => {
        if (finished) return
        finished = true
        cleanupUrl()
        signal.removeEventListener('abort', abortAudio)
        releaseOwner()
        if (notify) onEnd?.()
      }
      const abortAudio = () => {
        try {
          audio.pause()
          audio.currentTime = 0
          audio.removeAttribute('src')
          audio.load()
        } catch { /* Audio may not have entered playback yet. */ }
        finish()
      }

      audio.onplay = () => {
        if (isSuperseded()) {
          abortAudio()
          return
        }
        started = true
        onStart?.()
      }
      audio.onpause = () => { /* Pausing is a supported user action, not completion. */ }
      audio.onended = () => finish()
      audio.onerror = () => { if (started) finish() }

      ownedPlayback = {
        pause: () => { if (!isSuperseded()) audio.pause() },
        resume: () => { if (!isSuperseded()) void audio.play().catch(() => finish()) },
        stop: abortAudio,
      }
      activeSpeechPlayback = ownedPlayback
      signal.addEventListener('abort', abortAudio, { once: true })

      try {
        await audio.play()
        assertCurrent()
        handedOff = true
        return ownedPlayback
      } catch (error) {
        const wasReplaced = isSuperseded() || (error instanceof Error && error.name === 'AbortError')
        if (started) finish()
        else {
          try {
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
          } catch { /* Ignore cleanup errors before playback. */ }
          finish(false)
        }
        if (wasReplaced) throw new DOMException('Speech cancelled', 'AbortError')
        if (options.allowBrowserFallback !== true) {
          throw new Error('The selected QuorlythBot Studio voice could not play. Your written reply is still available; please retry in a moment.')
        }
        notifyBrowserFallback()
        // Restore cancellation wiring if the request falls back to browser TTS.
        externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
        activeSpeechController = controller
        if (isSuperseded()) throw new DOMException('Speech cancelled', 'AbortError')
      }
    }

    assertCurrent()
    if (options.allowBrowserFallback !== true) {
      throw new Error('The selected QuorlythBot Studio voice is temporarily unavailable. Your written reply is still available.')
    }
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      throw new Error('Natural voice playback is unavailable. Your text response is still available.')
    }

    notifyBrowserFallback()
    window.speechSynthesis.cancel()
    const preset = SPEECH_PRESETS[voice] || SPEECH_PRESETS.coral
    const utterance = new SpeechSynthesisUtterance(source.slice(0, 900))
    utterance.lang = accentLocale(accent)
    utterance.rate = preset.rate
    utterance.pitch = preset.pitch
    utterance.voice = browserVoice(voice, accent)
    let finished = false
    const finishNative = () => {
      if (finished) return
      finished = true
      signal.removeEventListener('abort', stopNative)
      releaseOwner()
      onEnd?.()
    }
    const stopNative = () => {
      window.speechSynthesis.cancel()
      finishNative()
    }
    utterance.onstart = () => {
      if (isSuperseded()) stopNative()
      else onStart?.()
    }
    utterance.onend = finishNative
    utterance.onerror = finishNative
    signal.addEventListener('abort', stopNative, { once: true })

    ownedPlayback = {
      pause: () => { if (!isSuperseded()) window.speechSynthesis.pause() },
      resume: () => { if (!isSuperseded()) window.speechSynthesis.resume() },
      stop: stopNative,
    }
    activeSpeechPlayback = ownedPlayback
    window.speechSynthesis.speak(utterance)
    handedOff = true
    return ownedPlayback
  } finally {
    if (!handedOff) releaseOwner()
  }
}