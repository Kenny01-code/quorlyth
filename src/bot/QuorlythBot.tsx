import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { Av } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { Chat, ChatMsg } from '../lib/types'
import { cn, slug, when } from '../lib/util'
import { askJson, startRealtime, speakText, streamChat } from '../ai/client'
import { Robot, RobotApi } from './Robot'
import { ChatMenu } from './ChatMenu'
import { BotViews } from './views'
import { SKILLS, THEMES, TOUR_MEMBER, TOUR_OWNER, VOICES } from './config'
import { buildContext } from './context'
import { useBotData } from './useBotData'
import { reviewIdeas } from '../ai/review'

const PHRASES = {
  owner: ['Ask QuorlythBot anything', 'Summarize what my community is saying', 'Draft a post for my best idea', 'Which ideas should I pick this week?', 'Explain my analytics', 'Plan my week', 'Type / for skills'],
  member: ['Ask QuorlythBot anything', 'How do I get my idea noticed?', 'Improve my idea before I post it', 'Find ideas about live shows', 'What can I do here?', 'Type / for skills'],
  visitor: ['Ask QuorlythBot anything', 'How do I get access?', 'Show me around', 'What is Quorlyth?', 'Type / for skills'],
}

function usePlaceholder(role: 'owner' | 'member' | 'visitor', active: boolean) {
  const [ph, setPh] = useState('Message QuorlythBot')
  useEffect(() => {
    if (!active) { setPh('Message QuorlythBot'); return }
    const L = PHRASES[role]; let k = 0, i = 0, dir = 1, t: number
    const tick = () => {
      const s = L[k % L.length]
      if (dir > 0) { i++; setPh(s.slice(0, i) + '\u258d'); if (i >= s.length) { dir = -1; t = window.setTimeout(tick, 1900); return } t = window.setTimeout(tick, 32 + Math.random() * 34) }
      else { i -= 2; if (i <= 0) { i = 0; dir = 1; k++; setPh('\u258d'); t = window.setTimeout(tick, 280); return } setPh(s.slice(0, i) + '\u258d'); t = window.setTimeout(tick, 16) }
    }
    tick(); return () => clearTimeout(t)
  }, [role, active])
  return ph
}

type View = 'chat' | 'skills' | 'projects' | 'library' | 'custom' | 'voice' | 'settings'
type Live = null | { state: string; user: string; bot: string }
type PendingAction =
  | { type: 'community'; name: string; purpose: string; cover: string; vis: 'listed' | 'unlisted'; post: 'anyone' | 'members' | 'owner' }
  | { type: 'idea'; title: string; body: string; cid: string; tags: string[] }
  | { type: 'promote'; ideaId: string; text: string; credits: string[] }
  | { type: 'cover'; cid: string; cover: string }
  | { type: 'deleteCommunity'; cid: string; name: string; ideaCount: number }

function pendingActionDetail(action: PendingAction, communities: { id: string; name: string }[], ideas: { id: string; title: string }[]): string {
  switch (action.type) {
    case 'community': return action.name + (action.purpose ? ' · ' + action.purpose : '') + ' · ' + (({ a: 'Aurora', b: 'Halo', c: 'Grid', d: 'Dusk' } as any)[action.cover] || 'Aurora')
    case 'idea': return action.title + ' · ' + (communities.find(x => x.id === action.cid)?.name || 'Community')
    case 'promote': return ideas.find(x => x.id === action.ideaId)?.title || 'Selected idea'
    case 'cover': return (communities.find(x => x.id === action.cid)?.name || 'Community') + ' · ' + (({ a: 'Aurora', b: 'Halo', c: 'Grid', d: 'Dusk' } as any)[action.cover] || 'Aurora')
    case 'deleteCommunity': return action.name + ' · ' + action.ideaCount + ' linked idea' + (action.ideaCount === 1 ? '' : 's')
  }
}

export function QuorlythBot() {
  const a = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const bd = useBotData()
  const { settings: bs } = bd
  const role = !a.me ? 'visitor' : a.owner ? 'owner' : 'member'
  const communityOwner = !!a.me && a.data.communities.some(c => a.ownsCommunity(c.id))
  const robot = useRef<RobotApi | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const ctl = useRef<AbortController | null>(null)
  const rt = useRef<Awaited<ReturnType<typeof startRealtime>> | null>(null)
  const liveFallback = useRef(false)
  const liveRecognition = useRef<any>(null)
  const audio = useRef<{ stop(): void } | null>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'compact' | 'large' | 'full' | 'custom'>('full')
  const [viewportNarrow, setViewportNarrow] = useState(() => window.innerWidth <= 980)
  const [side, setSide] = useState(() => window.innerWidth > 980)
  const [view, setView] = useState<View>('chat')
  const [cur, setCur] = useState<Chat | null>(null)
  const [pj, setPj] = useState('')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState<'std' | 'big' | 'off'>('std')
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState('Online')
  const [thinkingTask, setThinkingTask] = useState('')
  const [q, setQ] = useState('')
  const [menu, setMenu] = useState<null | { id: string | null; x: number; y: number }>(null)
  const [ren, setRen] = useState('')
  const [showArch, setShowArch] = useState(false)
  const [live, setLive] = useState<Live>(null)
  const [pend, setPend] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [tour, setTour] = useState(-1)
  const [greet, setGreet] = useState('')
  const [size, setSize] = useState<null | { w: number; h: number }>(null)
  const [position, setPosition] = useState<null | { x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('qbot-panel-position-v1')
      if (!saved) return null
      const parsed = JSON.parse(saved)
      return Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y) ? { x: parsed.x, y: parsed.y } : null
    } catch { return null }
  })
  const panel = useRef<HTMLDivElement>(null)
  const ph = usePlaceholder(role, open && view === 'chat' && !input)
  const project = bd.projects.find(p => p.id === pj) || null
  const theme = bs.theme
  const narrow = mode === 'compact' || viewportNarrow || (mode === 'custom' && !!size && size.w <= 900)
  const wide = !narrow

  useEffect(() => {
    const resize = () => {
      const isNarrow = window.innerWidth <= 980
      setViewportNarrow(isNarrow)
      setSize(current => {
        if (!current) return current
        const maxW = Math.max(240, window.innerWidth - 24)
        const maxH = Math.max(300, window.innerHeight - 24)
        return { w: Math.min(current.w, maxW), h: Math.min(current.h, maxH) }
      })
      setPosition(current => {
        if (!current || mode === 'full') return current
        const el = panel.current
        const w = el?.offsetWidth || 1180
        const h = el?.offsetHeight || 860
        return {
          x: Math.max(8, Math.min(current.x, window.innerWidth - Math.min(w, window.innerWidth) - 8)),
          y: Math.max(8, Math.min(current.y, window.innerHeight - Math.min(h, window.innerHeight) - 8)),
        }
      })
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [mode])

  useEffect(() => {
    try {
      if (position) localStorage.setItem('qbot-panel-position-v1', JSON.stringify(position))
    } catch { /* Position still works for this session if storage is unavailable. */ }
  }, [position])

  useEffect(() => {
    if (narrow) setSide(false)
  }, [narrow])

  useEffect(() => {
    if (!a.me || !bd.doc('botset')) return
    const themeKey = 'qbot-onyx-default-v1:' + a.me.id
    const modelKey = 'qbot-smart-default-v1:' + a.me.id
    const updates: any = {}
    if (!localStorage.getItem(themeKey)) {
      if (bs.theme === 'pearl') updates.theme = 'onyx'
      localStorage.setItem(themeKey, '1')
    }
    if (!localStorage.getItem(modelKey)) {
      if (bs.model === 'quick') updates.model = 'smart'
      localStorage.setItem(modelKey, '1')
    }
    if (Object.keys(updates).length) bd.saveSettings(updates)
  }, [a.me?.id, bd.doc('botset')?.theme, bd.doc('botset')?.model])

  // greeting bubble on the launcher, first time visitors get a wave when opened
  useEffect(() => {
    if (!a.ready) return
    const first = !localStorage.getItem('qseen')
    setGreet(first ? 'Hi, I am QuorlythBot' : a.me ? `Welcome back, ${a.me.name.split(' ')[0]}` : '')
    const t = setTimeout(() => setGreet(''), 7000)
    return () => clearTimeout(t)
  }, [a.ready, a.me?.id])
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight }, [cur?.msgs.length, busy])

  const accent = (cur?.color && (THEMES as any)[cur.color]) || null
  const style = accent ? ({ ['--ac1' as any]: accent.g1, ['--ac2' as any]: accent.g2, ['--acr' as any]: accent.cr } as React.CSSProperties) : undefined

  function openPanel() {
    setOpen(true)
    const first = !localStorage.getItem('qseen')
    localStorage.setItem('qseen', '1')
    const name = a.me?.name.split(' ')[0]
    const msg = !a.me ? 'Welcome to Quorlyth. Sign in to enter your space.' : first ? `Welcome, ${name}. I am QuorlythBot, your concierge. Ask me anything, or let me show you around.` : `Welcome back, ${name}.`
    setTimeout(() => { setCaption(msg); first ? robot.current?.welcome() : robot.current?.wave(); say(msg); setTimeout(() => setCaption(''), 6000) }, 700)
  }

  async function requestLiveContext(text: string) {
    const asksLocalWeather = /\b(weather|forecast|temperature)\b/i.test(text) && !/\b(?:in|at|for)\s+[A-Z][a-z]+/i.test(text)
    const asksLocation = /\b(near me|my location|where am i|weather here|forecast here|temperature here|local weather|nearby)\b/i.test(text)
    if (!asksLocalWeather && !asksLocation) return ''
    if (!navigator.geolocation) return 'The browser does not support geolocation. Ask the user to name their city for local weather or nearby results.'
    try {
      const position: GeolocationPosition = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }))
      if (asksLocalWeather) {
        const { latitude, longitude } = position.coords
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(String(latitude)) + '&longitude=' + encodeURIComponent(String(longitude)) + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto'
        const response = await fetch(url)
        if (!response.ok) return 'Location permission was granted, but the live weather service is unavailable. Do not invent weather; ask the user to try again or name a city.'
        const weather = await response.json()
        return 'The user explicitly requested local weather and granted browser location permission. Live weather data from Open-Meteo for their approximate current coordinates: ' + JSON.stringify({ timezone: weather.timezone, current: weather.current, units: weather.current_units }) + '. Use these values as current weather, state that they are approximate to the browser location, and do not claim a more precise address.'
      }
      return 'The user explicitly requested location-based results and granted browser location permission. Approximate current coordinates: latitude ' + position.coords.latitude.toFixed(3) + ', longitude ' + position.coords.longitude.toFixed(3) + '. Use these only for the requested nearby/location task; do not infer a street address.'
    } catch {
      return 'The user did not share browser location or the location request timed out. Do not guess their location; ask them for a city or permission if location-based results are needed.'
    }
  }

  function browserContext() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown timezone'
    const lang = navigator.language || 'unknown language'
    const localTime = new Date().toLocaleString(lang, { dateStyle: 'full', timeStyle: 'long' })
    const speech = 'speechSynthesis' in window
    const recognition = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    return `Browser language: ${lang}. Device time zone: ${zone}. Current local date and time: ${localTime}. Browser online: ${navigator.onLine ? 'yes' : 'no'}. Browser speech output: ${speech ? 'available' : 'unavailable'}. Browser speech recognition: ${recognition ? 'available' : 'unavailable'}. Precise device location has not been read; ask before requesting location permission and never pretend to know GPS coordinates.`
  }

  function say(text: string) {
    const clean = text.replace(/\[\[.*?\]\]/g, '').trim()
    if (!clean) return
    const v = VOICES.find(x => x.id === bs.vid) || VOICES[0]
    if (!bs.voice) { robot.current?.talk(true); setTimeout(() => robot.current?.talk(false), Math.min(9000, 700 + clean.length * 52)); return }
    audio.current?.stop()
    speakText(clean.slice(0, 600), v.ai, () => { robot.current?.talk(true); setStatus('Speaking') }, () => { robot.current?.talk(false); setStatus('Online') })
      .then(h => (audio.current = h))
      .catch(() => {
        if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
          robot.current?.talk(true); setTimeout(() => robot.current?.talk(false), Math.min(9000, 700 + clean.length * 52)); setStatus('Online'); return
        }
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(clean.slice(0, 900))
        utterance.lang = 'en-US'; utterance.rate = 1; utterance.pitch = 1.02
        const voices = window.speechSynthesis.getVoices()
        utterance.voice = voices.find(x => x.lang === 'en-US') || voices.find(x => x.lang.startsWith('en')) || null
        utterance.onstart = () => { robot.current?.talk(true); setStatus('Speaking') }
        utterance.onend = utterance.onerror = () => { robot.current?.talk(false); setStatus('Online') }
        audio.current = { stop: () => window.speechSynthesis.cancel() }
        window.speechSynthesis.speak(utterance)
      })
  }

  function persist(c: Chat) {
    const next = { ...c, upd: Date.now() }
    setCur(next)
    if (a.me && next.msgs.length) bd.put(next.id, { title: next.title, pj: next.pj || '', at: next.at, upd: next.upd, pin: !!next.pin, color: next.color || '', arch: !!next.arch, unread: !!next.unread, msgs: next.msgs.slice(-40).map(m => ({ ...m, t: m.t.slice(0, 3000) })) })
  }
  const add = (c: Chat | null, m: ChatMsg, title?: string): Chat => {
    const base = c || { id: 'c_' + slug(), title: (title || m.t).slice(0, 44), pj, at: Date.now(), upd: Date.now(), msgs: [] }
    const next = { ...base, msgs: [...base.msgs, m] }
    setCur(next); return next
  }

  function taskPreview(text: string) {
    if (/\b(delete|remove|destroy)\b/i.test(text) && /\bcommunity\b/i.test(text)) return 'Preparing a deletion confirmation'
    if (/\b(create|make|start|set up)\b/i.test(text) && /\bcommunity\b/i.test(text)) return 'Creating your community'
    if (/\b(add|create|write|submit|post)\b/i.test(text) && /\bidea\b/i.test(text)) return 'Preparing your idea'
    if (/\b(open|show|take me to|go to|view|enter)\b/i.test(text)) return 'Opening the right place'
    if (/\b(weather|forecast|temperature|latest|current|today|right now|live|news|search|look up|source)\b/i.test(text)) return 'Checking current information'
    if (/\b(review|score|rank|analy[sz]e|analytics|summari[sz]e|compare)\b/i.test(text)) return 'Reviewing the available information'
    if (/\b(write|draft|rewrite|improve|generate|design|plan)\b/i.test(text)) return 'Working on your request'
    return 'Finding the most useful answer'
  }

  async function send(text?: string, raw = false) {
    const t = (text ?? input).trim()
    if (!t || busy) return
    setInput('')
    if (!raw && t.startsWith('/')) { const m = t.match(/^\/(\w+)\s*(.*)$/s); if (m && SKILLS.some(s => s.id === m[1])) return skill(m[1], m[2]) }
    if (!raw && a.owner && /^(please\s+)?(can you\s+)?(run|start|do|perform|review|score)\b/i.test(t) && /\b(review|score|ideas?|queue)\b/i.test(t)) return skill('review')
    if (!raw) {
      const direct = handleDirectNavigation(t)
      if (direct) return
      if (/\b(create|make|start|set up)\b/i.test(t) && /\bcommunity\b/i.test(t) && !a.owner) {
        const draft = add(cur, { r: 'u', t })
        const msg = !a.me ? 'Sign in first. Creating a community requires the space owner account.' : 'Your current account is not recognized as the space owner, so I cannot create a community from this session. Sign in with the owner account, then ask me again. I can still open communities and help draft ideas where you have permission.'
        persist({ ...draft, msgs: [...draft.msgs, { r: 'a', t: msg }] })
        return
      }
      const action = planAction(t)
      if (action) {
        audio.current?.stop(); setView('chat')
        if (action.type === 'deleteCommunity') {
          const draft = add(cur, { r: 'u', t })
          const prompt = `I found ${action.name}. It has ${action.ideaCount} linked idea${action.ideaCount === 1 ? '' : 's'}. Review the confirmation below before I delete the community.`
          persist({ ...draft, msgs: [...draft.msgs, { r: 'a', t: prompt }] })
          setPendingAction(action)
          return
        }
        if (action.type === 'community' || action.type === 'idea' || action.type === 'cover') {
          const draft = add(cur, { r: 'u', t })
          setBusy(true); setStatus('Applying action'); setThinkingTask(taskPreview(t)); robot.current?.think(true)
          try {
            let ok = false
            let message = ''
            if (action.type === 'community') {
              if (!a.owner) throw new Error('Only the space owner can create a community. Sign in with the owner account and try again.')
              const result = await a.createCommunityDetailed(action)
              ok = result.ok
              message = ok ? `Created ${action.name}. Opening your communities now so you can enter it and add ideas.` : `I couldn't save ${action.name}: ${result.error || 'The save failed for an unknown reason.'}`
            } else if (action.type === 'idea') {
              const community = a.data.communities.find(x => x.id === action.cid)
              if (!a.me || !community || community.arch || !a.canPost() || (!a.owner && (community.post === 'owner' || (community.post === 'members' && !a.joined(community.id))))) throw new Error('Your account does not currently have permission to post in that community.')
              const result = await a.postIdeaDetailed({ title: action.title, body: action.body, cid: action.cid, tags: action.tags })
              ok = result.ok
              message = ok ? `Submitted “${action.title}”. Opening ${community.name} now.` : `I couldn't submit “${action.title}”: ${result.error || 'The database rejected the write.'}`
            } else {
              if (!a.canManageCommunity(action.cid)) throw new Error('Only this community’s owner or a platform administrator can change its cover.')
              ok = await a.saveCommunity(action.cid, { cover: action.cover as any })
              message = ok ? 'Community cover updated.' : 'I could not update that cover.'
            }
            if (ok) {
              const next = { ...draft, msgs: [...draft.msgs, { r: 'a' as const, t: message }] }
              persist(next)
              if (action.type === 'community') nav('/communities')
              if (action.type === 'idea') nav('/communities/' + action.cid)
            } else {
              persist({ ...draft, msgs: [...draft.msgs, { r: 'a', t: message }] })
            }
          } catch (e: any) {
            persist({ ...draft, msgs: [...draft.msgs, { r: 'a', t: e?.message || 'That action could not be completed.' }] })
          } finally { setBusy(false); setThinkingTask(''); setStatus('Online'); robot.current?.think(false) }
          return
        }
        let draft = add(cur, { r: 'u', t })
        const summary = `I have prepared this in-app promotion for review. It will not be posted to an external social network. Confirm to mark the idea as promoted inside Quorlyth.`
        draft = { ...draft, msgs: [...draft.msgs, { r: 'a', t: summary }] }
        persist(draft); setPendingAction(action); return
      }
    }
    audio.current?.stop(); setView('chat')
    let c = add(cur, { r: 'u', t })
    setBusy(true); robot.current?.think(true); setStatus('Thinking'); setThinkingTask(taskPreview(t)); setCaption('')
    ctl.current = new AbortController()
    try {
      const turns = c.msgs.slice(-14).map(m => ({ role: (m.r === 'u' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.t }))
      const liveContext = await requestLiveContext(t)
      let first = true
      const full = await streamChat(turns, {
        system: buildContext(a, bs, loc.pathname, project) + '\\nBrowser/device context: ' + browserContext() + (liveContext ? '\\nLocation and live weather context: ' + liveContext : ''), tier: bs.model, signal: ctl.current.signal,
        onText: f => {
          if (first) { first = false; setThinkingTask(''); robot.current?.think(false); robot.current?.talk(true); setStatus('Typing') }
          const clean = f.replace(/\[\[[\s\S]*$/, '').trim()
          setCaption(clean.slice(-140))
          setCur(prev => prev ? { ...prev, msgs: prev.msgs.filter(m => !(m as any).live).concat([{ r: 'a', t: clean, live: true } as any]) } : prev)
        },
      })
      const btns: ChatMsg['btns'] = []
      const g = full.match(/\[\[go:([^\]]+)\]\]/), o = full.match(/\[\[open:([\w-]+)\]\]/)
      if (g) btns.push({ a: 'go', id: g[1], l: 'Open ' + g[1].replace('/', '') || 'home' })
      if (o && a.data.ideas.some(i => i.id === o[1])) btns.push({ a: 'idea', id: o[1], l: 'Open that idea' })
      const clean = full.replace(/\[\[[\s\S]*?\]\]/g, '').trim()
      c = { ...c, msgs: [...c.msgs, { r: 'a', t: clean, btns }] }
      persist(c)
      robot.current?.talk(false); say(clean)
      setTimeout(() => setCaption(''), 1500)
    } catch (e: any) {
      robot.current?.think(false); robot.current?.talk(false)
      if (e.name !== 'AbortError') { c = { ...c, msgs: [...c.msgs, { r: 'a', t: e.message?.includes('OPENAI_API_KEY') ? 'The AI key is missing on the server. Add OPENAI_API_KEY to your .env file and restart npm run dev:ai.' : 'Sorry, that did not go through. ' + (e.message || '') }] }; persist(c) }
      else setCur(c)
    }
    setBusy(false); setThinkingTask(''); setStatus('Online'); ctl.current = null
  }

  async function skill(id: string, arg = '') {
    setView('chat')
    if (SKILLS.find(s => s.id === id)?.own && !a.owner && !(id === 'analytics' && communityOwner)) { setCur(add(cur, { r: 'a', t: 'That skill is for the owner of the space.' })); return }
    if (id === 'tour') return startTour()
    if ((id === 'find' || id === 'improve') && !arg) { setInput('/' + id + ' '); return }
    if (id === 'review') {
      const pending = a.data.ideas.filter(i => a.statusOf(i.id) === 'review')
      if (!pending.length) { setCur(add(cur, { r: 'a', t: 'The review queue is clear. There are no ideas waiting for review.' })); return }
      let n = add(cur, { r: 'u', t: `Run an AI review on ${pending.length} pending idea${pending.length === 1 ? '' : 's'}.` })
      setBusy(true); setStatus('Reviewing ideas'); robot.current?.think(true)
      try {
        const count = await reviewIdeas(a, pending, { onProgress: setStatus })
        n = { ...n, msgs: [...n.msgs, { r: 'a', t: `Review complete. I scored ${count} idea${count === 1 ? '' : 's'} for originality, feasibility, and audience relevance.`, btns: [{ a: 'go', id: '/queue', l: 'Open review queue' }] }] }
        persist(n); robot.current?.cheer(); say(`Review complete. I scored ${count} idea${count === 1 ? '' : 's'} for originality, feasibility, and audience relevance.`)
      } catch (e: any) {
        n = { ...n, msgs: [...n.msgs, { r: 'a', t: e.message || 'I could not finish the review. Your ideas are still in the queue.' }] }; persist(n); say(n.msgs[n.msgs.length - 1].t)
      }
      setBusy(false); setStatus('Online'); return
    }
    if (id === 'welcome') {
      const c = a.data.communities[0]
      if (!c) { setCur(add(cur, { r: 'a', t: 'Create a community first, then I can write its welcome and guidelines.' })); return }
      let n = add(cur, { r: 'u', t: 'Write a welcome message and guidelines for ' + c.name }); setBusy(true)
      try {
        const o = await askJson<{ welcome: string; rules: string }>(`Write a welcome message (two warm sentences) and four short community guidelines (one line each, joined with newlines) for this fan community. Reply with only JSON: {"welcome":"text","rules":"line one\\nline two\\nline three\\nline four"}\nCommunity: ${c.name}. Purpose: ${c.purpose || 'share ideas'}. Tone: ${bs.tone}.`)
        setPend(JSON.stringify({ cid: c.id, ...o }))
        n = { ...n, msgs: [...n.msgs, { r: 'a', t: `Here is a welcome message:\n${o.welcome}\n\nAnd guidelines:\n${o.rules}`, btns: [{ a: 'apply', id: c.id, l: 'Apply to ' + c.name }] }] }; persist(n); say(n.msgs[n.msgs.length - 1].t)
      } catch (e: any) { n = { ...n, msgs: [...n.msgs, { r: 'a', t: e.message }] }; setCur(n); say(e.message) }
      setBusy(false); return
    }
    if (id === 'find') {
      let n = add(cur, { r: 'u', t: 'Find ideas about: ' + arg }); setBusy(true)
      try {
        const o = await askJson<{ matches: { id: string; why: string }[] }>(`Find up to five ideas that best match the request. Reply with only JSON: {"matches":[{"id":"idea id","why":"one short sentence"}]}. Use only ids from the list.\nRequest: ${arg}\nIdeas: ${JSON.stringify(a.data.ideas.slice(0, 60).map(i => ({ id: i.id, title: i.title, details: (i.body || '').slice(0, 160) })))}`, { tier: 'quick' })
        const m = (o.matches || []).filter(x => a.data.ideas.some(i => i.id === x.id)).slice(0, 5)
        n = { ...n, msgs: [...n.msgs, { r: 'a', t: m.length ? 'Here is what I found:\n' + m.map(x => a.data.ideas.find(i => i.id === x.id)!.title + ': ' + String(x.why).slice(0, 120)).join('\n') : 'I did not find a close match.', btns: m.map(x => ({ a: 'idea', id: x.id, l: a.data.ideas.find(i => i.id === x.id)!.title.slice(0, 28) })) }] }; persist(n); say(n.msgs[n.msgs.length - 1].t)
      } catch (e: any) { n = { ...n, msgs: [...n.msgs, { r: 'a', t: e.message }] }; setCur(n); say(e.message) }
      setBusy(false); return
    }
    const best = [...a.data.ideas].sort((x, y) => ((a.data.reviews[y.id]?.score || 0) + a.votesOf(y.id)) - ((a.data.reviews[x.id]?.score || 0) + a.votesOf(x.id)))[0]
    const P: Record<string, string> = {
      brief: 'Give me a briefing on my community: the top themes, what people want most, and three concrete next steps.',
      post: best ? `Draft a short social post (under 60 words) announcing that I am acting on this idea from my community: "${best.title}". ${best.body || ''} Credit the community and do not name individuals.` : 'I have no ideas yet. Tell me how to get my first ideas flowing.',
      ideas: 'Suggest five fresh discussion prompts I could post in my community to get members sharing ideas. One line each.',
      analytics: 'Explain what my numbers mean, what is working and what I should do about it.',
      plan: 'Plan my week as the owner of this space in five short steps based on what is waiting.',
      improve: 'Improve this idea so it is clearer and more likely to get backed. Give a sharper title, a tighter description and up to three tags:\n' + arg,
      reply: loc.pathname.startsWith('/idea/') ? 'Suggest two thoughtful replies I could post on the idea I am viewing.' : 'Open an idea first, then ask me for a reply and I will suggest two.',
    }
    if (P[id]) send(P[id], true)
  }

  function startTour() {
    setTour(0); const steps = a.owner ? TOUR_OWNER : TOUR_MEMBER; step(steps, 0)
  }
  function step(steps: [string, string][], i: number) {
    const s = steps[i]
    if (!s) { setTour(-1); setCur(c => add(c, { r: 'a', t: 'That is the tour. Ask me anything whenever you like.' })); robot.current?.cheer(); return }
    nav(s[0]); setCur(c => add(c, { r: 'a', t: s[1] })); setCaption(s[1]); robot.current?.set('point'); setTimeout(() => robot.current?.set('explain'), 900); say(s[1])
  }

  // ----- live voice -----
  async function startLive() {
    if (live) return stopLive()
    if (!a.me) return a.toast('Sign in to talk live')
    setLive({ state: 'connecting', user: '', bot: '' })
    liveFallback.current = false
    const v = VOICES.find(x => x.id === bs.vid) || VOICES[0]
    let c = cur
    const browserLive = () => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR || !('speechSynthesis' in window)) {
        liveFallback.current = false
        setLive(null)
        a.toast('Live voice needs microphone speech recognition and speech output. Try Chrome or Edge, or enable the OpenAI Realtime key.')
        return
      }
      if (!liveFallback.current) return
      const recognition = new SR()
      liveRecognition.current = recognition
      recognition.lang = navigator.language || 'en-US'
      recognition.interimResults = true
      recognition.continuous = false
      recognition.onstart = () => setLive(l => l ? { ...l, state: 'listening' } : l)
      recognition.onerror = (event: any) => {
        liveRecognition.current = null
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          liveFallback.current = false; setLive(null); a.toast('Microphone permission was denied. Allow microphone access in your browser settings.')
        } else if (liveFallback.current) {
          setLive(l => l ? { ...l, state: 'listening' } : l)
          window.setTimeout(browserLive, 500)
        }
      }
      recognition.onresult = async (event: any) => {
        const spoken = String(event.results?.[0]?.[0]?.transcript || '').trim()
        const result = event.results?.[event.resultIndex ?? 0]
        if (result && !result.isFinal) {
          setLive(l => l ? { ...l, state: 'listening', user: String(result[0]?.transcript || l.user) } : l)
          return
        }
        liveRecognition.current = null
        if (!spoken || !liveFallback.current) { if (liveFallback.current) browserLive(); return }
        setLive(l => l ? { ...l, state: 'thinking', user: spoken, bot: '' } : l)
        c = add(c, { r: 'u', t: spoken }, 'Live conversation')
        try {
          let first = true
          const answer = await streamChat(c.msgs.slice(-14).map(m => ({ role: (m.r === 'u' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.t })), {
            system: buildContext(a, bs, loc.pathname, project) + '\nBrowser/device context: ' + browserContext() + '\nThis is a voice conversation. Speak naturally in short sentences. You can help with the app, but do not claim to execute an action unless the app has actually done it.',
            tier: bs.model,
            onText: full => { if (first) first = false; setLive(l => l ? { ...l, state: 'speaking', bot: full } : l) },
          })
          c = { ...c, msgs: [...c.msgs, { r: 'a', t: answer }] }
          persist(c)
          setLive(l => l ? { ...l, state: 'speaking', bot: answer } : l)
          await new Promise<void>(resolve => {
            speakText(answer.slice(0, 900), v.ai, () => robot.current?.talk(true), () => { robot.current?.talk(false); resolve() })
              .catch(() => { try { const utterance = new SpeechSynthesisUtterance(answer.slice(0, 900)); utterance.lang = navigator.language || 'en-US'; utterance.onend = utterance.onerror = () => resolve(); window.speechSynthesis.speak(utterance) } catch { resolve() } })
          })
        } catch (error: any) {
          const message = error?.message || 'I could not finish that voice reply. Please try again.'
          a.toast(message)
          c = { ...c, msgs: [...c.msgs, { r: 'a', t: message }] }; persist(c)
        }
        if (liveFallback.current) browserLive()
      }
      try { recognition.start() } catch { liveRecognition.current = null; if (liveFallback.current) window.setTimeout(browserLive, 500) }
    }
    // Prefer the low-latency Realtime API; fall back to browser recognition only if it cannot connect.
    try {
      rt.current = await startRealtime({
        instructions: buildContext(a, bs, loc.pathname, project) + '\nBrowser/device context: ' + browserContext() + '\nThis is a live spoken conversation, like a phone call. Reply in one to three short natural sentences, the way a warm person would speak. Use contractions. No lists or markdown. You can call the tools to take the person to a page or open an idea.',
        voice: v.ai,
        tools: [
          { type: 'function', name: 'navigate', description: 'Take the person to a page of the app.', parameters: { type: 'object', properties: { page: { type: 'string', enum: ['home', 'dashboard', 'communities', 'queue', 'promote', 'analytics', 'settings', 'profile'] } }, required: ['page'] } },
          { type: 'function', name: 'open_idea', description: 'Open an idea by its id.', parameters: { type: 'object', properties: { idea_id: { type: 'string' } }, required: ['idea_id'] } },
        ],
        onTool: (name, args) => {
          if (name === 'navigate') { const m: any = { home: '/', dashboard: '/dashboard', communities: '/communities', queue: '/queue', promote: '/promote', analytics: '/analytics', settings: '/settings', profile: '/me' }; nav(m[args.page] || '/'); return { ok: true } }
          if (name === 'open_idea') { if (!a.data.ideas.some(i => i.id === args.idea_id)) return { ok: false, error: 'Idea not found' }; nav('/idea/' + args.idea_id); return { ok: true } }
          return { ok: false }
        },
        onEvent: e => {
          if (e.type === 'state') { setLive(l => (e.state === 'closed' ? null : { ...(l || { user: '', bot: '' }), ...(e.state === 'listening' ? { user: '' } : {}), state: e.state })); robot.current?.listen(e.state === 'listening'); robot.current?.think(e.state === 'thinking'); robot.current?.talk(e.state === 'speaking') }
          if (e.type === 'user_preview') setLive(l => l && { ...l, state: 'listening', user: e.text })
          if (e.type === 'user') { c = add(c, { r: 'u', t: e.text }, 'Live conversation'); setLive(l => l && { ...l, state: 'thinking', user: e.text }) }
          if (e.type === 'bot') { setLive(l => l && { ...l, bot: e.text }); setCaption(e.text.slice(-140)); if (e.done) { c = add(c, { r: 'a', t: e.text }); persist(c!); robot.current?.bump() } }
          if (e.type === 'error') a.toast(e.message)
        },
      })
    } catch (e: any) {
      rt.current = null
      if ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) {
        liveFallback.current = true
        setLive({ state: 'listening', user: '', bot: '' })
        a.toast('Using browser voice with Gemini chat. Allow microphone access to speak.')
        browserLive()
      } else {
        setLive(null)
        a.toast(/NotAllowed|Permission/i.test(e.name + e.message) ? 'The microphone is blocked. Allow it in your browser settings.' : e.message || 'Live voice could not start')
      }
    }
  }
  function stopLive() { liveFallback.current = false; try { liveRecognition.current?.stop() } catch {}; liveRecognition.current = null; rt.current?.stop(); rt.current = null; try { window.speechSynthesis?.cancel() } catch {}; setLive(null); setCaption('') }
  useEffect(() => () => { rt.current?.stop() }, [])

  // ----- dictation -----
  const recRef = useRef<any>(null)
  const dictationText = useRef('')
  const noteSilenceTimer = useRef<number | null>(null)
  const restartNote = useRef(false)
  const [recordingNote, setRecordingNote] = useState(false)
  function dictate() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return a.toast('Voice notes need speech recognition. Try Chrome or Edge and allow microphone access.')
    if (recRef.current) {
      // If the previous browser session is still closing, queue the next start.
      if (!recordingNote) {
        restartNote.current = true
        setStatus('Restarting voice note')
      } else {
        restartNote.current = false
        setRecordingNote(false)
        setStatus('Finishing voice note')
      }
      window.clearTimeout(noteSilenceTimer.current || undefined)
      try { recRef.current.stop() } catch {
        recRef.current = null
        if (restartNote.current) { restartNote.current = false; window.setTimeout(() => dictate(), 0) }
        else setStatus('Online')
      }
      return
    }
    const r = new SR()
    recRef.current = r
    dictationText.current = ''
    r.lang = navigator.language || 'en-US'
    r.interimResults = true
    r.continuous = true
    const armSilenceStop = (delay: number) => {
      window.clearTimeout(noteSilenceTimer.current || undefined)
      noteSilenceTimer.current = window.setTimeout(() => {
        try { recRef.current?.stop() } catch {}
      }, delay)
    }
    r.onresult = (e: any) => {
      const pieces: string[] = []
      for (let i = 0; i < e.results.length; i++) {
        const item = e.results[i]
        if (item?.[0]?.transcript) pieces.push(String(item[0].transcript))
      }
      dictationText.current = pieces.join(' ').replace(/\s+/g, ' ').trim()
      setInput(dictationText.current)
      armSilenceStop(1900)
    }
    r.onend = () => {
      window.clearTimeout(noteSilenceTimer.current || undefined)
      noteSilenceTimer.current = null
      if (recRef.current === r) recRef.current = null
      setRecordingNote(false)
      robot.current?.listen(false)
      const transcript = dictationText.current.trim()
      if (transcript && !busy) {
        setStatus('Sending voice note')
        setInput('')
        void send(transcript)
      } else if (transcript) {
        setInput(transcript)
        a.toast('QuorlythBot is busy. Your voice note is ready in the composer.')
      } else {
        setStatus('Online')
      }
      if (restartNote.current) {
        restartNote.current = false
        window.setTimeout(() => dictate(), 0)
      }
    }
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        restartNote.current = false
        window.clearTimeout(noteSilenceTimer.current || undefined)
        if (recRef.current === r) recRef.current = null
        setRecordingNote(false)
        setStatus('Online')
        a.toast('Microphone permission was denied. Allow microphone access in your browser settings.')
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        if (recRef.current === r) recRef.current = null
        setRecordingNote(false)
        setStatus('Online')
        a.toast('Voice note stopped. Try recording again.')
      }
    }
    setRecordingNote(true)
    setStatus('Recording voice note')
    robot.current?.listen(true)
    armSilenceStop(5000)
    try { r.start() } catch {
      window.clearTimeout(noteSilenceTimer.current || undefined)
      recRef.current = null
      setRecordingNote(false)
      setStatus('Online')
      a.toast('Could not start recording. Check microphone permission and try again.')
    }
  }

  // ----- chat list actions -----
  const chat = (id: string) => bd.chats.find(c => c.id === id) || null
  const patch = (id: string, p: Partial<Chat>, message = 'Chat updated') => {
    const c = chat(id)
    if (!c) return
    const n = { ...c, ...p, upd: Date.now() }
    if (cur?.id === id) setCur(n)
    void bd.put(id, n).then(ok => {
      if (!ok && cur?.id === id) setCur(c)
      a.toast(ok ? message : 'Could not save that chat change. Please try again.')
    })
  }
  const menuChat = menu?.id ? chat(menu.id) : null
  const actions = useMemo(() => ({
    pin: () => patch(menu!.id!, { pin: !menuChat?.pin }, menuChat?.pin ? 'Chat unpinned' : 'Chat pinned'),
    rename: () => setRen(menu!.id!),
    color: (k: string) => { if (menu?.id) patch(menu.id, { color: k }, 'Chat colour updated'); else setCur(c => c ? { ...c, color: k } : ({ id: 'c_' + slug(), title: 'New chat', pj, at: Date.now(), upd: Date.now(), msgs: [], color: k })) },
    move: (p: string) => patch(menu!.id!, { pj: p }, p ? 'Chat moved to project' : 'Chat removed from project'),
    unread: () => patch(menu!.id!, { unread: !menuChat?.unread }, menuChat?.unread ? 'Chat marked as read' : 'Chat marked as unread'),
    archive: () => patch(menu!.id!, { arch: !menuChat?.arch }, menuChat?.arch ? 'Chat unarchived' : 'Chat archived'),
    duplicate: () => { const c = menuChat!; const id = 'c_' + slug(); const { id: _oldId, ...data } = c; void bd.put(id, { ...data, title: c.title.slice(0, 40) + ' copy', at: Date.now(), upd: Date.now(), pin: false, unread: false }).then(ok => a.toast(ok ? 'Chat duplicated' : 'Could not duplicate this chat. Please try again.')) },
    exportChat: () => { const c = menuChat!; const u = URL.createObjectURL(new Blob([`${c.title}\n${new Date(c.at).toLocaleString()}\n\n` + c.msgs.map(m => (m.r === 'u' ? 'You' : 'QuorlythBot') + ': ' + m.t).join('\n\n')], { type: 'text/plain' })); const l = document.createElement('a'); l.href = u; l.download = 'quorlyth-chat.txt'; l.click(); URL.revokeObjectURL(u); a.toast('Chat exported') },
    clear: () => { patch(menu!.id!, { msgs: [] }, 'Messages cleared') },
    remove: () => { const id = menu!.id!; void bd.remove(id).then(ok => a.toast(ok ? 'Chat deleted' : 'Could not delete this chat. Please try again.')); if (cur?.id === id) setCur(null) },
  }), [menu, menuChat, cur, bd.chats])

  const query = q.trim().toLowerCase()
  const shown = bd.chats.filter(c => {
    if (pj && c.pj !== pj) return false
    if (!query) return true
    return c.title.toLowerCase().includes(query) || c.msgs.some(m => m.t.toLowerCase().includes(query))
  })
  const searchResults = [...new Map(shown.map(c => [c.id, c])).values()]
  const active = shown.filter(c => !c.arch), pinned = active.filter(c => c.pin), recent = active.filter(c => !c.pin), arch = shown.filter(c => c.arch)
  const item = (c: Chat) => {
    const T = (THEMES as any)[c.color || '']
    return (
      <div key={c.id} className={cn('bci', cur?.id === c.id && view === 'chat' && 'on', T && 'tint', c.unread && 'unread')} tabIndex={0} role="button" aria-label={'Open chat: ' + c.title}
        style={T ? ({ ['--c1' as any]: T.g1, ['--c2' as any]: T.g2, ['--cr' as any]: T.cr } as any) : undefined}
        onClick={() => { if (busy) return; setCur(c); setView('chat'); if (c.pj) setPj(c.pj); if (c.unread) patch(c.id, { unread: false }); if (narrow) setSide(false) }}
        onContextMenu={e => { e.preventDefault(); setMenu({ id: c.id, x: e.clientX, y: e.clientY }) }}
        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCur(c); setView('chat'); if (narrow) setSide(false) } }}>
        <span className={cn('cd', !T && 'none')} />
        {ren === c.id ? <input autoFocus defaultValue={c.title} maxLength={60} aria-label="Rename chat" onClick={e => e.stopPropagation()}
          onBlur={e => { patch(c.id, { title: e.target.value.trim() || c.title }); setRen('') }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRen('') }} /> : <span className="bct">{c.title}</span>}
        {c.pin && <span className="bpn"><Icon name="pin" size={12} /></span>}{c.unread && <i className="bud" />}
        <button className="bcm" aria-label={'Options for ' + c.title} title="Chat options" onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ id: c.id, x: r.left, y: r.bottom + 6 }) }}><Icon name="more" size={18} /></button>
      </div>
    )
  }

  const [slashSel, setSlashSel] = useState(0)
  const slash = input.startsWith('/') && !input.includes(' ') ? SKILLS.filter(s => (a.owner || !s.own || (communityOwner && s.id === 'analytics')) && (s.id.startsWith(input.slice(1).toLowerCase()) || s.n.toLowerCase().includes(input.slice(1).toLowerCase()))).slice(0, 6) : []
  const msgs = cur?.msgs || []
  const sideShown = side

  function handleDirectNavigation(text: string): boolean {
    const s = text.trim()
    const lower = s.toLowerCase()
    const go = (path: string, reply: string) => {
      nav(path)
      const draft = add(cur, { r: 'u', t: s })
      persist({ ...draft, msgs: [...draft.msgs, { r: 'a', t: reply }] })
      setView('chat')
      return true
    }
    const openList = /\b(open|show|take me to|go to|view|browse)\b/i.test(s) && /\b(communities|all communities|community list)\b/i.test(s) && !/\bcommunity\s+(?:called|named)\b/i.test(s)
    if (openList) return go('/communities', 'Opening the communities page now.')
    const wantsOpen = /\b(open|show|take me to|go to|view|enter|visit)\b/i.test(s)
    const matchedNamedCommunity = wantsOpen ? a.data.communities.filter(x => lower.includes(x.name.toLowerCase())).sort((x,y) => y.name.length-x.name.length)[0] : undefined
    if (matchedNamedCommunity && !/\b(community list|all communities)\b/i.test(s)) return go('/communities/' + matchedNamedCommunity.id, 'Opening ' + matchedNamedCommunity.name + ' now.')
    const askedToOpen = wantsOpen && /\bcommunity\b/i.test(s)
    if (askedToOpen) {
      const explicit = s.match(/\b(?:community|called|named)\s+["“]?(.+?)["”]?\s*$/i)
      const byName = explicit?.[1] ? a.data.communities.find(x => x.name.toLowerCase() === explicit[1].trim().replace(/["“”]+$/g, '').toLowerCase()) : undefined
      const included = a.data.communities.filter(x => lower.includes(x.name.toLowerCase())).sort((x,y) => y.name.length-x.name.length)[0]
      const community = byName || included
      if (community) return go('/communities/' + community.id, 'Opening ' + community.name + ' now.')
      return go('/communities', 'I opened the communities list. Choose the community you want, or tell me its exact name and I will open it if it is available to your account.')
    }
    const routeRules: [RegExp,string,string][] = [
      [/\b(open|show|take me to|go to|view)\b[\s\S]*\b(dashboard|home)\b/i, '/dashboard', 'Opening your dashboard.'],
      [/\b(open|show|take me to|go to|view)\b[\s\S]*\b(review queue|queue|ideas to review)\b/i, '/queue', 'Opening the review queue.'],
      [/\b(open|show|take me to|go to|view)\b[\s\S]*\b(analytics|insights)\b/i, '/analytics', 'Opening analytics.'],
      [/\b(open|show|take me to|go to|view)\b[\s\S]*\b(profile|my profile)\b/i, '/me', 'Opening your profile.'],
      [/\b(open|show|take me to|go to|view)\b[\s\S]*\b(settings)\b/i, '/settings', 'Opening settings.'],
      [/\b(open|show|take me to|go to|view)\b[\s\S]*\b(promote|promotion)\b/i, '/promote', 'Opening the promotion workspace.'],
    ]
    for (const [pattern, path, reply] of routeRules) if (pattern.test(s)) return go(path, reply)
    return false
  }

  function planAction(text: string): PendingAction | null {
    const s = text.trim()
    const lower = s.toLowerCase()

    // Destructive actions are always previewed and require an explicit confirmation click.
    if (a.me && /\b(delete|remove|permanently delete|destroy)\b/i.test(s) && /\bcommunity\b/i.test(s)) {
      const community = a.data.communities
        .filter(x => lower.includes(x.name.toLowerCase()))
        .sort((x, y) => y.name.length - x.name.length)[0]
      if (community && a.canManageCommunity(community.id)) {
        return { type: 'deleteCommunity', cid: community.id, name: community.name, ideaCount: a.data.ideas.filter(i => i.cid === community.id).length }
      }
    }

    const createCommunity = /\b(create|make|start|set up)\b/i.test(s) && /\bcommunity\b/i.test(s) && !!a.me
    if (createCommunity) {
      const quoted = s.match(/\b(?:called|named)\s+["“]([^"”]+)["”]/i)
      const named = s.match(/\b(?:called|named)\s+(.+?)(?=\s+(?:about|for)\b|[,;]|$)/i)
      const plain = s.match(/\bcommunity\s+(?!called\b|named\b)(.+?)\s*$/i)
      const rawName = quoted?.[1] || named?.[1] || plain?.[1]
      if (rawName?.trim()) {
        const name = rawName.trim().replace(/^['"“]|['"”]$/g, '').replace(/\s+(?:about|for)\s+[\s\S]+$/i, '').slice(0, 60)
        if (name) return { type: 'community', name, purpose: '', cover: 'a', vis: 'listed', post: 'anyone' }
      }
    }

    const coverMatch = s.match(/\b(?:change|set|switch|update)\b[\s\S]*?\bcover\b[\s\S]*?\b(?:to|style)\s+(aurora|halo|grid|dusk)\b/i)
    if (coverMatch && a.me) {
      const pathId = loc.pathname.match(/^\/communities\/([^/]+)/)?.[1]
      const nameMention = a.data.communities.filter(x => lower.includes(x.name.toLowerCase())).sort((x, y) => y.name.length - x.name.length)[0]
      const community = a.data.communities.find(x => x.id === pathId) || nameMention
      if (community && a.canManageCommunity(community.id)) return { type: 'cover', cid: community.id, cover: ({ aurora: 'a', halo: 'b', grid: 'c', dusk: 'd' } as Record<string, string>)[coverMatch[1].toLowerCase()] }
    }

    const wantsIdea = /\b(create|write|submit|post|add)\b/i.test(s) && /\bidea\b/i.test(s)
    if (wantsIdea && a.me) {
      const pathCid = loc.pathname.match(/^\/communities\/([^/]+)/)?.[1]
      const mentioned = a.data.communities
        .filter(x => lower.includes(x.name.toLowerCase()))
        .sort((x, y) => y.name.length - x.name.length)[0]
      const community = (pathCid && a.data.communities.find(x => x.id === pathCid)) || mentioned

      // Keep the title separate from its destination and the description instructions.
      const titleMatch = s.match(/\bidea\s+(?:called|named)\s+["“]?([\s\S]+?)(?=["”]?\s+(?:in|for|to)\s+|[,;]\s*(?:with|and)\s+(?:a\s+)?description\b|\s+with\s+(?:a\s+)?description\b|\s+describing\b|$)/i)
      let title = titleMatch?.[1]?.trim().replace(/^['"“]|['"”]$/g, '') || ''
      if (!title && /\bidea\s*:/i.test(s)) title = s.split(/\bidea\s*:/i)[1]?.trim().split(/[,;]\s*(?:with|and)\s+(?:a\s+)?description\b/i)[0] || ''

      const descriptionMatch = s.match(/\b(?:with|and)\s+(?:a\s+)?description\s+(?:explaining|describing|saying|about|that\s+says)?\s*([\s\S]+)$/i)
        || s.match(/\bdescribing\s+([\s\S]+)$/i)
      const body = (descriptionMatch?.[1] || '').trim().replace(/[.\s]+$/, '')

      const allowed = !!community && !community.arch && a.canPost() &&
        (a.owner || (community.post !== 'owner' && (community.post !== 'members' || a.joined(community.id))))
      if (community && allowed && title) {
        return { type: 'idea', title: title.slice(0, 120), body: body.slice(0, 2000), cid: community.id, tags: [] }
      }
    }

    if (a.owner && /\b(publish|promote|push)\b/i.test(s) && /\bidea\b/i.test(s)) {
      const requested = a.data.ideas.find(x => lower.includes(x.title.toLowerCase()))
      const best = requested || [...a.data.ideas].filter(x => a.statusOf(x.id) === 'selected').sort((x, y) => (a.data.reviews[y.id]?.score || 0) - (a.data.reviews[x.id]?.score || 0))[0]
      if (best && a.statusOf(best.id) !== 'declined') return { type: 'promote', ideaId: best.id, text: [best.title, best.body || '', 'Shared from the Quorlyth community.'].filter(Boolean).join('\n\n'), credits: [best.authorId] }
    }
    return null
  }

  async function confirmPendingAction() {
    const action = pendingAction
    if (!action) return
    setBusy(true); setStatus('Applying action')
    let ok = false
    try {
      if (action.type === 'community') {
        if (!a.me) throw new Error('Sign in before creating a community.')
        const result = await a.createCommunityDetailed(action)
        ok = result.ok
        if (!ok) throw new Error(result.error || 'Community creation failed.')
      } else if (action.type === 'idea') {
        const community = a.data.communities.find(x => x.id === action.cid)
        if (!a.me || !community || community.arch || !a.canPost() || (!a.owner && (community.post === 'owner' || (community.post === 'members' && !a.joined(community.id))))) throw new Error('Your account does not currently have permission to post in that community.')
        const result = await a.postIdeaDetailed({ title: action.title, body: action.body, cid: action.cid, tags: action.tags })
        ok = result.ok
        if (!ok) throw new Error(result.error || 'Idea submission failed.')
      } else if (action.type === 'promote') {
        if (!a.owner) throw new Error('Only the space owner can promote ideas.')
        const idea = a.data.ideas.find(x => x.id === action.ideaId)
        if (!idea || a.statusOf(idea.id) === 'declined') throw new Error('That idea is no longer available to promote.')
        ok = await a.publish(action.ideaId, action.text, action.credits)
      } else if (action.type === 'cover') {
        if (!a.canManageCommunity(action.cid)) throw new Error('Only this community’s owner or a platform administrator can change its cover.')
        ok = await a.saveCommunity(action.cid, { cover: action.cover as any })
      } else if (action.type === 'deleteCommunity') {
        if (!a.canManageCommunity(action.cid)) throw new Error('Only this community’s owner or a platform administrator can delete it.')
        if (!a.data.communities.some(c => c.id === action.cid)) throw new Error('That community no longer exists.')
        ok = await a.deleteCommunity(action.cid)
      }
      if (ok) {
        const labels: Record<PendingAction['type'], string> = {
          community: 'Community created successfully.',
          idea: 'Idea submitted successfully.',
          promote: 'Idea marked as promoted in Quorlyth. It has not been posted to an external platform.',
          cover: 'Community cover updated successfully.',
          deleteCommunity: 'Community and its linked ideas deleted successfully.'
        }
        const next = add(cur, { r: 'a', t: labels[action.type] })
        persist(next); setPendingAction(null)
        if (action.type === 'community' || action.type === 'deleteCommunity') nav('/communities')
        if (action.type === 'idea') nav('/communities/' + action.cid)
      }
    } catch (e: any) { a.toast(e?.message || 'That action could not be completed.') }
    finally { setBusy(false); setStatus('Online') }
  }

  function act(b: { a: string; id?: string }) {
    if (b.a === 'go') nav(b.id || '/'); else if (b.a === 'idea') nav('/idea/' + b.id)
    else if (b.a === 'apply') { const p = JSON.parse(pend || '{}'); a.saveCommunity(p.cid, { welcome: p.welcome, rules: p.rules }) }
  }

  return (
    <>
      <button id="astl" className={cn('astl', open && 'hide')} aria-label="Open QuorlythBot" onClick={openPanel}>
        <span className="astm"><Logo size={30} /></span>{greet && <span className="astb">{greet}</span>}
      </button>
      {open && (
        <div id="ast">
          <div id="bot" className={cn('astp glass bot', 'm-' + mode, sideShown && 'side-on', !wide && 'narrow', live && 'live', accent && 'tinted')} style={{ ...style, ...(size && mode === 'custom' ? { width: size.w, height: size.h } : {}), ...(position && mode !== 'full' ? { position: 'fixed', left: position.x, top: position.y, right: 'auto', bottom: 'auto', transform: 'none', margin: 0 } : {}) }} ref={panel} role="dialog" aria-label="QuorlythBot">
            {mode !== 'full' && <div className="bresz" title="Drag to resize" onPointerDown={e => {
              e.preventDefault(); const el = panel.current!, sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight
              const mv = (ev: PointerEvent) => { const maxW = Math.max(240, window.innerWidth - 24), maxH = Math.max(300, window.innerHeight - 24); setMode('custom'); setSize({ w: Math.max(Math.min(340, maxW), Math.min(maxW, sw + (sx - ev.clientX))), h: Math.max(Math.min(420, maxH), Math.min(maxH, sh + (sy - ev.clientY))) }) }
              const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up) }
              addEventListener('pointermove', mv); addEventListener('pointerup', up)
            }} />}
            {narrow && sideShown && <button className="bsscrim" aria-label="Close sidebar" onClick={() => setSide(false)} />}
            <aside className="bs">
              <div className="bs-t"><span className="astm2"><Logo size={24} /></span><b className="bwm">{wm('Quorlyth')}</b><button className="bib" aria-label="Close sidebar" onClick={() => setSide(false)}><Icon name="panel" size={18} /></button></div>
              <div className="bs-n">
                <button className="bsb p" onClick={() => { if (busy) return; setCur(null); setView('chat') }}><Icon name="plus" size={18} />New chat</button>
                {([['skills', 'spark', 'Skills'], ['projects', 'folder', 'Projects'], ['library', 'book', 'Library'], ['custom', 'sliders', 'Customize'], ['voice', 'voice', 'Voice studio']] as [View, string, string][]).map(([v, ic, l]) => <button key={v} className={cn('bsb', view === v && 'on')} onClick={() => { setView(v); if (!wide) setSide(false) }}><Icon name={ic} size={18} />{l}</button>)}
              </div>
              <div className="bs-s"><div className="iw"><Icon name="search" size={18} /><input placeholder="Search chats" aria-label="Search chats" value={q} onChange={e => setQ(e.target.value)} /></div></div>
              <div className="bs-l">
                {project && <div className="bpj"><span><Icon name="folder" size={14} />{project.name}</span><button className="chip" onClick={() => setPj('')}>Clear</button></div>}
                {query ? <><p className="bgh">Results</p>{searchResults.length ? searchResults.map(item) : <p className="dim" style={{ padding: '8px 10px' }}>No chats match.</p>}</> : <>
                  {pinned.length > 0 && <><p className="bgh">Pinned</p>{pinned.map(item)}</>}
                  <p className="bgh">Recents</p>
                  {recent.length ? recent.map(item) : <p className="dim" style={{ padding: '8px 10px' }}>No chats yet. Start one.</p>}
                  {arch.length > 0 && <><button className="bgh bga" onClick={() => setShowArch(!showArch)}><Icon name="book" size={13} />Archived ({arch.length})<span>{showArch ? 'Hide' : 'Show'}</span></button>{showArch && arch.map(item)}</>}
                </>}
              </div>
              <div className="bs-f">
                <button className={cn('bsb', view === 'settings' && 'on')} onClick={() => { setView('settings'); if (narrow) setSide(false) }}><Icon name="settings" size={18} />Settings</button>
                <button className="bsu" onClick={() => { nav('/me'); if (narrow) setSide(false) }}>{a.me ? <Av id={a.me.id} size={34} /> : <Icon name="member" size={18} />}<span><b>{a.me ? a.nm(a.me.id) : 'Visitor'}</b><i>{role === 'owner' ? 'Platform owner' : communityOwner ? 'Community owner' : role === 'member' ? 'Member' : 'Signed out'}</i></span></button>
              </div>
            </aside>
            <section className="bm">
              <header className="bh" onPointerDown={e => {
                if (mode === 'full' || (e.target as HTMLElement).closest('button, input, textarea, a, [role="button"]')) return
                const el = panel.current
                if (!el) return
                e.preventDefault()
                const rect = el.getBoundingClientRect()
                const offsetX = e.clientX - rect.left
                const offsetY = e.clientY - rect.top
                const move = (ev: PointerEvent) => {
                  const w = el.offsetWidth, h = el.offsetHeight
                  setPosition({
                    x: Math.max(8, Math.min(ev.clientX - offsetX, window.innerWidth - Math.min(w, window.innerWidth) - 8)),
                    y: Math.max(8, Math.min(ev.clientY - offsetY, window.innerHeight - Math.min(h, window.innerHeight) - 8)),
                  })
                }
                const end = () => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', end)
                  window.removeEventListener('pointercancel', end)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', end)
                window.addEventListener('pointercancel', end)
              }}>
                <button className="bib" aria-label="Sidebar" onClick={e => { e.stopPropagation(); setSide(!side) }}><Icon name="menu" size={18} /></button>
                <div className="bht"><b className="bwm big">{wm('QuorlythBot')}</b><span className="bst"><i />{live ? ({ connecting: 'Connecting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' } as any)[live.state] || 'Live' : status}</span></div>
                <div className="bha">
                  <button className="bib" aria-label="Robot size" title="Robot size" onClick={() => setStage(stage === 'std' ? 'big' : stage === 'big' ? 'off' : 'std')}><Icon name="stage" size={18} /></button>
                  <button className={cn('bib', bs.voice && 'on')} aria-label="Voice" title="Voice" onClick={() => bd.saveSettings({ voice: !bs.voice })}><Icon name="voice" size={18} /></button>
                  <button className="bib" aria-label="Resize" title="Expand" onClick={() => { setSize(null); setMode(mode === 'compact' ? 'large' : mode === 'large' ? 'full' : 'compact') }}><Icon name={mode === 'full' ? 'shrink' : 'expand'} size={18} /></button>
                  <button className="bib" aria-label="Close" onClick={() => { stopLive(); audio.current?.stop(); setOpen(false) }}><Icon name="decline" size={18} /></button>
                </div>
              </header>
              <div className={cn('bstage', stage, !bs.robot && 'off', view === 'voice' && 'studio')} style={{ display: (view === 'chat' || view === 'voice' || live) && bs.robot && stage !== 'off' || view === 'voice' || live ? '' : 'none' }}>
                <Robot ref={robot} theme={theme} calm={bs.calm} drag />
                <div className={cn('ast-cap', caption && 'on')}>{caption}</div><div className="bnm">QuorlythBot</div>
              </div>
              {live && (
                <div className="blive">
                  <span className="bls">{({ connecting: 'Connecting', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' } as any)[live.state] || 'Live'}</span>
                  <div className="blc">{live.state === 'listening' ? (live.user ? <><span className="dim">You · live transcript</span><br />{live.user}</> : <span className="dim">Listening to you… start speaking whenever you’re ready.</span>) : live.state === 'thinking' ? (live.user ? <><span className="dim">You</span><br />{live.user}</> : <span className="dim">Thinking…</span>) : live.bot ? <><span className="dim">QuorlythBot</span><br />{live.bot.slice(-220)}</> : <span className="dim">Connecting your conversation…</span>}</div>
                  <div className="acts" style={{ justifyContent: 'center', margin: 0 }}>
                    <span className="dim" style={{ fontSize: 12 }}>Hands-free conversation · Tap Talk live again to end</span>
                  </div>
                </div>
              )}
              <div className="bv" style={view === 'chat' ? undefined : { padding: '6px 4px' }}>
                {view === 'chat' ? (
                  !msgs.length ? (
                    <div className="bhero"><p className="dim">{role === 'owner' ? 'Platform owner' : communityOwner ? 'Community owner' : role === 'member' ? 'Member' : 'Visitor'}</p><h3>{project ? project.name : 'How can I help?'}</h3><p className="mut">Ask anything about your space, or pick a skill.</p>
                      <div className="bgrid sm">{SKILLS.filter(s => a.owner || !s.own || (communityOwner && s.id === 'analytics')).slice(0, 6).map(s => <button key={s.id} className="bsk" onClick={() => skill(s.id)}><span className="bski"><Icon name={s.icon} size={20} /></span><b>{s.n}</b></button>)}</div></div>
                  ) : (
                    <div className="ast-log" ref={log} aria-live="polite">
                      {msgs.map((m, i) => m.r === 'u' ? <div key={i} className="am mu">{m.t}</div> : (
                        <div key={i} className="am ma"><div className="mt">{m.t}{(m as any).live && <span className="btyping" aria-label="QuorlythBot is typing"><i /><i /><i /></span>}</div>
                          {m.btns?.length ? <div style={{ marginTop: 8 }}>{m.btns.map((b, k) => <button key={k} className="chip on" onClick={() => act(b)}>{b.l}</button>)}</div> : null}
                          <div className="mact"><button aria-label="Copy" onClick={() => navigator.clipboard.writeText(m.t).then(() => a.toast('Copied'))}><Icon name="copy" size={14} /></button>
                            <button aria-label="Save" onClick={() => { bd.put('l_' + slug(), { title: m.t.slice(0, 48), text: m.t, at: Date.now() }); a.toast('Saved to your library') }}><Icon name="star" size={14} /></button>
                            {i === msgs.length - 1 && !busy && <button aria-label="Try again" onClick={() => { const u = msgs[msgs.length - 2]; if (u) { setCur({ ...cur!, msgs: msgs.slice(0, -2) }); send(u.t, true) } }}><Icon name="redo" size={14} /></button>}</div>
                        </div>
                      ))}
                      {busy && !msgs.some(m => (m as any).live) && <div className="am ma typing" role="status" aria-label="QuorlythBot is thinking"><span>QuorlythBot is thinking</span>{thinkingTask && <small className="qbot-task-status">{thinkingTask}</small>}<i /><i /><i /></div>}
                    </div>
                  )
                ) : <BotViews view={view} bd={bd} role={role} skill={id => skill(id)} setPj={setPj} pj={pj} theme={theme} robot={robot} stage={stage} setStage={setStage} mode={mode} setMode={setMode as any} />}
                {view === 'chat' && pendingAction && <div className="glass qbot-action" role="group" aria-label="Confirm QuorlythBot action"><div><span className="dim">ACTION PREVIEW</span><h3>{({ community: 'Create community', idea: 'Submit idea', promote: 'Promote idea', cover: 'Change cover style', deleteCommunity: 'Delete community' } as any)[pendingAction.type]}</h3><p className="mut">{pendingActionDetail(pendingAction, a.data.communities, a.data.ideas)}</p><p className="dim">{pendingAction.type === 'deleteCommunity' ? 'This is permanent. Confirming deletes the community, its linked ideas, and related collaboration records.' : 'Review the details, then confirm. QuorlythBot will use your signed-in account permissions.'}</p></div><div className="acts" style={{ marginTop: 14 }}><button className="btn p" disabled={busy} onClick={confirmPendingAction}>Confirm action</button><button className="btn" disabled={busy} onClick={() => setPendingAction(null)}>Cancel</button></div></div>}
              </div>
              {view === 'chat' && !live && (
                <div className="bc">
                  {slash.length > 0 && <div className="bsl">{slash.map((s, i) => <button key={s.id} className={cn('bsi', i === slashSel && 'on')} onClick={() => { setInput(''); if (s.id === 'find' || s.id === 'improve') setInput('/' + s.id + ' '); else skill(s.id) }}><Icon name={s.icon} size={16} /><b>/{s.id}</b><span className="dim">{s.d}</span></button>)}</div>}
                  <div className="ast-q">{tour >= 0 && <><button className="chip on" onClick={() => { const steps = a.owner ? TOUR_OWNER : TOUR_MEMBER; setTour(tour + 1); step(steps, tour + 1) }}>Next</button><button className="chip" onClick={() => { setTour(-1); robot.current?.set('rest') }}>End tour</button></>}</div>
                  <div className="ast-in">
                    <textarea rows={1} value={input} placeholder={ph} aria-label="Message" onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (slash.length) { const s = slash[slashSel] || slash[0]; setInput(''); if (s.id === 'find' || s.id === 'improve') setInput('/' + s.id + ' '); else skill(s.id) } else send() } }} />
                    <button className={cn('btn', recordingNote && 'rec')} aria-label={recordingNote ? 'Stop voice note' : 'Record voice note'} title={recordingNote ? 'Recording — click to stop and send' : 'Record a voice note'} style={{ padding: 12 }} onClick={dictate}><Icon name="mic" size={18} /></button>
                    <button className={cn('btn', live && 'rec')} aria-label={live ? 'End live talk' : 'Talk live'} title={live ? 'End live talk' : 'Start live talk'} style={{ padding: 12 }} onClick={startLive}><Icon name={live ? 'stop' : 'live'} size={18} /></button>
                    <button className="btn p" aria-label="Send" style={{ padding: '12px 18px' }} onClick={() => send()}><Icon name="send" size={18} /></button>
                  </div>
                  <p className="dim" style={{ fontSize: 11, textAlign: 'center', marginTop: 8 }}>QuorlythBot can make mistakes. Check important details.</p>
                </div>
              )}
            </section>
          </div>
          {menu && <ChatMenu chat={menuChat} x={menu.x} y={menu.y} projects={bd.projects} act={actions as any} onClose={() => setMenu(null)} />}
        </div>
      )}
    </>
  )
}

function wm(t: string) {
  return t.split('').map((c, i) => <span key={i} style={{ ['--i' as any]: i }}>{c}</span>)
}
