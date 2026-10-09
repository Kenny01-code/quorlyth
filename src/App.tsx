import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { Toast } from './components/ui'
import { Intro } from './components/Intro'
import { Palette } from './components/Palette'
import { Shortcuts } from './components/Shortcuts'
import { NotifPanel } from './components/NotifPanel'
const Landing = lazy(() => import('./screens/Landing').then(m => ({ default: m.Landing })))
const SignIn = lazy(() => import('./screens/SignIn').then(m => ({ default: m.SignIn })))
const Dashboard = lazy(() => import('./screens/Dashboard').then(m => ({ default: m.Dashboard })))
const Communities = lazy(() => import('./screens/Communities').then(m => ({ default: m.Communities })))
const Messages = lazy(() => import('./screens/Messages').then(m => ({ default: m.Messages })))
const IdeaPage = lazy(() => import('./screens/IdeaPage').then(m => ({ default: m.IdeaPage })))
const Queue = lazy(() => import('./screens/Queue').then(m => ({ default: m.Queue })))
const Promote = lazy(() => import('./screens/Promote').then(m => ({ default: m.Promote })))
const Me = lazy(() => import('./screens/Me').then(m => ({ default: m.Me })))
const Analytics = lazy(() => import('./screens/Analytics').then(m => ({ default: m.Analytics })))
const Settings = lazy(() => import('./screens/Settings').then(m => ({ default: m.Settings })))
const Database = lazy(() => import('./screens/Database').then(m => ({ default: m.Database })))
const Access = lazy(() => import('./screens/Access').then(m => ({ default: m.Access })))
const Onboarding = lazy(() => import('./screens/Onboarding').then(m => ({ default: m.Onboarding })))
const QuorlythBot = lazy(() => import('./bot/QuorlythBot').then(m => ({ default: m.QuorlythBot })))
import { useApp } from './data/AppProvider'
import { useUserState } from './lib/userState'
import { chime, useNotifs } from './lib/notifs'

export default function App() {
  const a = useApp()
  const loc = useLocation()
  const nav = useNavigate()
  const [palette, setPalette] = useState(false)
  const [keys, setKeys] = useState(false)
  const [bell, setBell] = useState(false)
  const [intro, setIntro] = useState(() => !sessionStorage.getItem('qintro'))
  const [replay, setReplay] = useState(0)
  const [sound, setSound] = useState(() => localStorage.getItem('qsnd') !== '0')
  const us = useUserState()
  const notifs = useNotifs(a, us.st)
  const unread = notifs.filter(n => n.unread).length
  const pendingRequests = a.owner ? a.data.requests.filter(r => { const d = a.data.decisions[r.id]; return !d || d.at < r.at }).length : 0
  const unreadRequests = notifs.filter(n => n.kind === 'settings' && n.unread).length
  const ownRequest = a.me && a.data.requests.find(r => r.id === a.me!.id)
  const ownDecision = a.me && a.data.decisions[a.me.id]
  const accessSent = !!(!a.owner && ownRequest && (!ownDecision || ownDecision.at < ownRequest.at))
  const known = useRef<Set<string> | null>(null)
  const knownMessages = useRef<Set<string> | null>(null)
  const g = useRef(0)

  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])

  useEffect(() => {
    if (!a.me || (loc.pathname === '/signin' && new URLSearchParams(loc.search).get('recovery') === '1')) return
    const dest = sessionStorage.getItem('qreturn')
    if (dest) {
      sessionStorage.removeItem('qreturn')
      nav(dest, { replace: true })
    }
  }, [a.me?.id, loc.pathname, nav])

  // a chime and a toast when something new arrives
  useEffect(() => {
    if (!a.ready) return
    if (known.current === null) { const t = setTimeout(() => (known.current = new Set(notifs.map(n => n.key))), 3000); return () => clearTimeout(t) }
    const fresh = notifs.filter(n => n.unread && !known.current!.has(n.key))
    if (fresh.length) { if (sound) chime(); a.toast(fresh[0].text); fresh.forEach(n => known.current!.add(n.key)) }
  }, [notifs, a.ready])

  // Message notifications are account-scoped and work from every page, not only the inbox.
  useEffect(() => {
    const store = a.backend?.store
    const uid = a.me?.id
    if (!store || !uid || a.demo) { knownMessages.current = null; return }
    let conversations: any[] = []
    const offConversations = store.subscribe('conversations', docs => {
      conversations = docs.map(d => ({ id: d.id, ...d.data })).filter(c => Array.isArray(c.members) && c.members.includes(uid))
    }, e => console.warn('Could not load conversations for notifications', e))
    const offMessages = store.subscribe('messages', docs => {
      const all = docs.map(d => ({ id: d.id, ...d.data })).filter(m => typeof m.conversationId === 'string' && typeof m.senderId === 'string' && typeof m.text === 'string')
      if (knownMessages.current === null) {
        knownMessages.current = new Set(all.map(m => m.id))
        return
      }
      const incoming = all.filter(m => m.senderId !== uid && !knownMessages.current!.has(m.id) && conversations.some(c => c.id === m.conversationId))
      for (const m of all) knownMessages.current.add(m.id)
      if (!incoming.length) return
      const latest = incoming[incoming.length - 1]
      const convo = conversations.find(c => c.id === latest.conversationId)
      const title = convo?.type === 'group' ? (convo.title || 'group chat') : 'your private chat'
      const sender = a.nm(latest.senderId)
      a.toast('New message from ' + sender + ' · ' + title)
      if (sound) chime()
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        try { new Notification('New message from ' + sender, { body: latest.text.slice(0, 120), tag: latest.conversationId }) } catch {}
      }
    }, e => console.warn('Could not load messages for notifications', e))
    return () => { offConversations(); offMessages(); knownMessages.current = null }
  }, [a.backend, a.me?.id, a.demo, a.nm, a.toast, sound])

  // keyboard: Ctrl K, /, ?, g then a letter, Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const typing = !!el && (/INPUT|TEXTAREA/.test(el.tagName) || el.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); return }
      if (e.key === 'Escape') { setPalette(false); setKeys(false); setBell(false); return }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); setPalette(true); return }
      if (e.key === '?') { setKeys(true); return }
      if (g.current && Date.now() - g.current < 1200) { const m: any = { d: '/dashboard', c: '/communities', q: '/queue', a: '/analytics', m: '/me', s: '/settings' }; g.current = 0; if (m[e.key]) nav(m[e.key]); return }
      if (e.key === 'g') g.current = Date.now()
    }
    addEventListener('keydown', h); return () => removeEventListener('keydown', h)
  }, [nav])

  // Keep the page progress indicator in sync without intercepting browser zoom controls.
  useEffect(() => {
    const sp = document.getElementById('sp'); let raf = 0
    const sc = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const m = document.documentElement.scrollHeight - innerHeight; if (sp) sp.style.transform = `scaleX(${m > 0 ? Math.min(1, scrollY / m) : 0})` }) }
    addEventListener('scroll', sc, { passive: true })
    return () => { if (raf) cancelAnimationFrame(raf); removeEventListener('scroll', sc) }
  }, [])

  if (!a.ready) return <main aria-label="Loading Quorlyth" />
  if (a.startupError) return (
    <main className="app-error">
      <section className="glass pad" role="alert">
        <h2>Quorlyth could not start.</h2>
        <p className="mut">{a.startupError}</p>
        <button className="btn p" onClick={() => window.location.reload()}>Reload Quorlyth</button>
      </section>
    </main>
  )
  return (
    <>
      <div id="sp" />
      {intro && <Intro replay={replay} onDone={() => { setIntro(false); sessionStorage.setItem('qintro', '1') }} />}
      <Nav onSearch={() => setPalette(true)} onBell={() => setBell(b => !b)} unread={unread} pendingRequests={pendingRequests} unreadRequests={unreadRequests} accessSent={accessSent} demo={a.demo} onDemo={() => { a.enterDemo(); nav('/dashboard') }} onReplay={() => { setIntro(true); setReplay(r => r + 1) }} />
      {a.demo && <div className="demo-banner" role="status"><span><b>Interactive demo</b><small>Sample data only · changes reset when you leave</small></span><div><button className="chip" onClick={async () => { await a.exitDemo(); nav('/signin') }}>Sign in</button>{' '}<button className="chip" onClick={async () => { await a.exitDemo(); nav('/') }}>Exit demo</button></div></div>}
      <main id="main">
        <section className="on">
          <Suspense fallback={<div className="route-loading" role="status" aria-label="Loading page"><span className="ast-ld"><i /><i /><i /></span></div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/communities" element={<Communities />} />
              <Route path="/communities/:cid" element={<Communities />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="/idea/:id" element={<IdeaPage />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/promote" element={<Promote />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/database" element={<Database />} />
              <Route path="/access" element={<Access />} />
              <Route path="/request-access" element={<Access />} />
              <Route path="/me" element={<Me />} />
              <Route path="/me/:id" element={<Me />} />
            </Routes>
          </Suspense>
        </section>
      </main>
      {bell && <NotifPanel list={notifs} sound={sound} onSound={() => { const n = !sound; setSound(n); localStorage.setItem('qsnd', n ? '1' : '0'); if (n) chime() }} onOpen={n => us.patch({ read: { [n.key]: true } })} onMarkAll={us.markAll} onClose={() => setBell(false)} />}
      {palette && <Palette onClose={() => setPalette(false)} onReplay={() => { setIntro(true); setReplay(r => r + 1) }} onKeys={() => setKeys(true)} />}
      {keys && <Shortcuts onClose={() => setKeys(false)} />}
      <Suspense fallback={null}><QuorlythBot /></Suspense>
      <Toast />
    </>
  )
}
