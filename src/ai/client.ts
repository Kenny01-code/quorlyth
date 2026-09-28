export interface StreamOpts { system?: string; tier?: 'quick' | 'smart'; signal?: AbortSignal; onText?: (full: string, piece: string) => void }

const SPEECH_PRESETS: Record<string, { gender: 'female' | 'male'; rate: number; pitch: number; names: RegExp }> = {
  coral: { gender: 'female', rate: 0.96, pitch: 1.08, names: /aria|jenny|zira|samantha|victoria|karen|susan|ava|allison|siri.*female/i },
  sage: { gender: 'female', rate: 0.9, pitch: 1.02, names: /samantha|karen|susan|serena|siri.*female/i },
  shimmer: { gender: 'female', rate: 1.05, pitch: 1.16, names: /jenny|zira|ava|siri.*female/i },
  ash: { gender: 'male', rate: 0.9, pitch: 0.86, names: /guy|david|mark|daniel|james|ryan|alex|fred|tom|siri.*male/i },
  echo: { gender: 'male', rate: 0.97, pitch: 0.94, names: /daniel|alex|ryan|mark|siri.*male/i },
  ballad: { gender: 'male', rate: 1.02, pitch: 1, names: /guy|james|david|fred|tom|siri.*male/i },
}

function browserVoice(voice: string) {
  const preset = SPEECH_PRESETS[voice] || SPEECH_PRESETS.coral
  const choices = window.speechSynthesis.getVoices().filter(v => /^en(-|$)/i.test(v.lang))
  return choices.find(v => preset.names.test(v.name)) || choices.find(v => /google us english/i.test(v.name) && preset.gender === 'female') || choices[0] || null
}

async function readError(r: Response) {
  try {
    const j = await r.json()
    let error = j.error || r.statusText
    if (typeof error === 'string') {
      try { error = JSON.parse(error) } catch {}
    }
    const code = error?.code || error?.error?.code
    if (code === 'credit_balance_exhausted' || code === 'insufficient_quota') {
      return 'QuorlythBot is temporarily unavailable because the OpenAI account has no API credits remaining. Add credits to the OpenAI project connected to this site, then try again.'
    }
    return error?.message || (typeof error === 'string' ? error : r.statusText)
  } catch { return r.statusText }
}

/** Streams a reply token by token. Resolves with the full text. */
export async function streamChat(messages: { role: 'user' | 'assistant'; content: string }[], o: StreamOpts = {}) {
  const r = await fetch('/api/chat', {
    method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system: o.system, tier: o.tier === 'quick' ? 'quick' : 'smart' }),
  })
  if (!r.ok || !r.body) throw new Error(await readError(r))
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = '', completed = false
  const consume = (block: string) => {
    const line = block.split(/\r?\n/).find(x => x.startsWith('data:'))
    if (!line) return
    try {
      const j = JSON.parse(line.slice(5).trim())
      if (j.t) { full += j.t; o.onText?.(full, j.t) }
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
  if (!completed) throw new Error('The reply was interrupted before it finished. Please try again.')
  return full
}

export async function askJson<T = any>(prompt: string, o: { system?: string; tier?: 'quick' | 'smart'; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch('/api/json', {
    method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system: o.system, tier: o.tier === 'quick' ? 'quick' : 'smart' }),
  })
  if (!r.ok) throw new Error(await readError(r))
  return r.json()
}

export type RealtimeEvent =
  | { type: 'state'; state: 'connecting' | 'listening' | 'thinking' | 'speaking' | 'closed' }
  | { type: 'user'; text: string }
  | { type: 'bot'; text: string; done: boolean }
  | { type: 'tool'; name: string; args: any }
  | { type: 'error'; message: string }

export interface RealtimeTool { type: 'function'; name: string; description: string; parameters: any }

/**
 * Live voice conversation over WebRTC with the OpenAI Realtime API.
 * The browser sends your microphone, the model answers with audio instantly, and you can interrupt it.
 */
export async function startRealtime(opts: {
  instructions: string; voice?: string; tools?: RealtimeTool[]
  onEvent: (e: RealtimeEvent) => void
  onTool?: (name: string, args: any) => Promise<any> | any
}) {
  opts.onEvent({ type: 'state', state: 'connecting' })
  const s = await fetch('/api/realtime-session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instructions: opts.instructions, voice: opts.voice || 'alloy', tools: opts.tools || [] }),
  })
  if (!s.ok) throw new Error(await readError(s))
  const { token, model } = await s.json()

  const pc = new RTCPeerConnection()
  const audio = document.createElement('audio')
  audio.autoplay = true
  pc.ontrack = e => { audio.srcObject = e.streams[0] }
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  pc.addTrack(mic.getTracks()[0], mic)
  const dc = pc.createDataChannel('oai-events')
  let botText = ''
  const send = (o: any) => dc.readyState === 'open' && dc.send(JSON.stringify(o))

  dc.onmessage = async ev => {
    let m: any
    try { m = JSON.parse(ev.data) } catch { return }
    switch (m.type) {
      case 'input_audio_buffer.speech_started':
        opts.onEvent({ type: 'state', state: 'listening' }); break
      case 'input_audio_buffer.speech_stopped':
        opts.onEvent({ type: 'state', state: 'thinking' }); break
      case 'conversation.item.input_audio_transcription.completed':
        if (m.transcript?.trim()) opts.onEvent({ type: 'user', text: m.transcript.trim() }); break
      case 'response.audio_transcript.delta':
        botText += m.delta || ''
        opts.onEvent({ type: 'state', state: 'speaking' })
        opts.onEvent({ type: 'bot', text: botText, done: false }); break
      case 'response.audio_transcript.done':
        opts.onEvent({ type: 'bot', text: m.transcript || botText, done: true }); botText = ''; break
      case 'response.done':
        opts.onEvent({ type: 'state', state: 'listening' })
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
  dc.onopen = () => opts.onEvent({ type: 'state', state: 'listening' })

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  const r = await fetch('https://api.openai.com/v1/realtime/calls', {
    method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
  })
  if (!r.ok) throw new Error((await r.text()).slice(0, 500) || 'Could not connect to the live voice service')
  await pc.setRemoteDescription({ type: 'answer', sdp: await r.text() })

  return {
    say: (text: string) => { send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }); send({ type: 'response.create' }) },
    interrupt: () => { send({ type: 'response.cancel' }); send({ type: 'output_audio_buffer.clear' }) },
    mute: (m: boolean) => mic.getAudioTracks().forEach(t => (t.enabled = !m)),
    stop: () => { try { dc.close() } catch {} ; try { pc.close() } catch {}; mic.getTracks().forEach(t => t.stop()); audio.srcObject = null; opts.onEvent({ type: 'state', state: 'closed' }) },
  }
}

/** Uses the selected studio voice, with a gender/style-matched browser voice as fallback. */
export async function speakText(text: string, voice: string, onStart?: () => void, onEnd?: () => void) {
  const r = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }) })
  if (!r.ok) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) throw new Error('Voice is not available in this browser')
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 900))
    utterance.lang = 'en-US'
    const preset = SPEECH_PRESETS[voice] || SPEECH_PRESETS.coral
    utterance.rate = preset.rate
    utterance.pitch = preset.pitch
    utterance.voice = browserVoice(voice)
    utterance.onstart = () => onStart?.()
    utterance.onend = utterance.onerror = () => onEnd?.()
    window.speechSynthesis.speak(utterance)
    return { stop: () => { window.speechSynthesis.cancel(); onEnd?.() } }
  }
  const url = URL.createObjectURL(await r.blob())
  const au = new Audio(url)
  au.onplay = () => onStart?.()
  const done = () => { URL.revokeObjectURL(url); onEnd?.() }
  au.onended = done; au.onerror = done
  await au.play()
  return { stop: () => { au.pause(); done() } }
}
