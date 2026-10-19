import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { Toast } from './components/ui'
import { Intro } from './components/Intro'
import { Palette } from './components/Palette'
import { Shortcuts } from './components/Shortcuts'
import { NotifPanel } from './components/NotifPanel'
import { WritingAssistant } from './components/WritingAssistant'
import { Logo } from './lib/Logo'
import { QuorlythLoader } from './components/QuorlythLoader'
const Landing = lazy(() => import('./screens/Landing').then(m => ({ default: m.Landing })))
const SignIn = lazy(() => import('./screens/SignIn').then(m => ({ default: m.SignIn })))
const Dashboard = lazy(() => import('./screens/Dashboard').then(m => ({ default: m.Dashboard })))
const Communities = lazy(() => import('./screens/Communities').then(m => ({ default: m.Communities })))
const Messages = lazy(() => import('./screens/Messages').then(m => ({ default: m.Messages })))
const IdeaPage = lazy(() => import('./screens/IdeaPage').then(m => ({ default: m.IdeaPage })))
const Queue = lazy(() => import('./screens/Queue').then(m => ({ default: m.Queue })))
const Projects = lazy(() => import('./screens/Projects').then(m => ({ default: m.Projects })))
const Collaborations = lazy(() => import('./screens/Collaborations').then(m => ({ default: m.Collaborations })))
const CollaborationWorkspace = lazy(() => import('./screens/Collaborations').then(m => ({ default: m.CollaborationWorkspace })))
const Promote = lazy(() => import('./screens/Promote').then(m => ({ default: m.Promote })))
const Me = lazy(() => import('./screens/Me').then(m => ({ default: m.Me })))
const Analytics = lazy(() => import('./screens/Analytics').then(m => ({ default: m.Analytics })))
const Settings = lazy(() => import('./screens/Settings').then(m => ({ default: m.Settings })))
const Database = lazy(() => import('./screens/Database').then(m => ({ default: m.Database })))
const Access = lazy(() => import('./screens/Access').then(m => ({ default: m.Access })))
const Onboarding = lazy(() => import('./screens/Onboarding').then(m => ({ default: m.Onboarding })))
const loadQuorlythBot = () => import('./bot/QuorlythBot').then(m => ({ default: m.QuorlythBot }))
const QuorlythBot = lazy(loadQuorlythBot)
import { useApp } from './data/AppProvider'
import { useUserState } from './lib/userState'
import { chime, useNotifs } from './lib/notifs'

function DemoRedirect({ onBeforeRedirect }: { onBeforeRedirect: () => void }) {
  const a = useApp()
  const nav = useNavigate()
  useEffect(() => {
    if (!a.demo) a.enterDemo()
    onBeforeRedirect()
    nav('/dashboard', { replace: true })
  // The callback only writes to a stable ref; it intentionally doesn't trigger another redirect on parent rerenders.
  }, [a.demo, a.enterDemo, nav])
  return null
}

function DelayedRouteLoader() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    // Keep fast route changes visually quiet; only show the Quorlyth mark if a lazy page is genuinely slow.
    const timer = window.setTimeout(() => setVisible(true), 140)
    return () => window.clearTimeout(timer)
  }, [])
  return visible ? <QuorlythLoader variant="route" label="Opening page" /> : null
}

function MissingRoute() {
  const nav = useNavigate()
  return <div className="glass pad" style={{ maxWidth: 560, margin: '48px auto' }}>
    <p className="dim">404 · QUORLYTH</p><h2 style={{ marginTop: 8, fontSize: 28, fontWeight: 300 }}>This page could not be found.</h2>
    <p className="mut" style={{ marginTop: 8 }}>The link may be outdated, or this page may have moved.</p>
    <button className="btn p" style={{ marginTop: 18 }} onClick={() => nav('/dashboard')}>Return to Quorlyth</button>
  </div>
}

export default function App() {
  const a = useApp()
  const loc = useLocation()
  const nav = useNavigate()
  const [palette, setPalette] = useState(false)
  const [keys, setKeys] = useState(false)
  const [bell, setBell] = useState(false)
  // Play the branded welcome animation once per browser, then remember it across sessions.
  // Existing returning visitors who already heard the sign-in hello also skip the intro.
  const [intro, setIntro] = useState(() => {
    try {
      return localStorage.getItem('qintro') !== '1'
        && localStorage.getItem('qseen') !== '1'
        && sessionStorage.getItem('qintro') !== '1'
    } catch { return false }
  })
  const [replay, setReplay] = useState(0)
  const skipNextPageTransition = useRef(false)
  const [sound, setSound] = useState(() => localStorage.getItem('qsnd') !== '0')
  // Download the full bot experience only after the user opens its lightweight launcher.
  const [botMounted, setBotMounted] = useState(false)
  const [deferredLauncherHidden, setDeferredLauncherHidden] = useState(false)
  const [showDeferredLauncherRestore, setShowDeferredLauncherRestore] = useState(false)
  const deferredRestoreTimer = useRef<number | null>(null)
  const deferredHoldTimer = useRef<number | null>(null)
  const deferredHoldOrigin = useRef<{ x: number; y: number } | null>(null)
  const deferredLongPressTriggered = useRef(false)
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  const us = useUserState()
  const notifs = useNotifs(a, us.st)
  useEffect(() => {
    if (us.st.preferences?.sound !== undefined) setSound(us.st.preferences.sound)
  }, [a.me?.id, us.st.preferences?.sound])
  const unread = notifs.filter(n => n.unread).length
  const pendingRequests = a.platformAdmin ? a.data.requests.filter(r => { const d = a.data.decisions[r.id]; return !d || d.at < r.at }).length : 0
  const unreadRequests = notifs.filter(n => n.kind === 'settings' && n.unread).length
  const ownRequest = a.me && a.data.requests.find(r => r.id === a.me!.id)
  const ownDecision = a.me && a.data.decisions[a.me.id]
  const accessSent = !!(!a.owner && ownRequest && (!ownDecision || ownDecision.at < ownRequest.at))
  const known = useRef<Set<string> | null>(null)
  const notificationSessionStartedAt = useRef(0)
  const knownMessages = useRef<Set<string> | null>(null)
  const g = useRef(0)

  useEffect(() => {
    const restoreLauncher = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === 'KeyB') {
        event.preventDefault()
        setDeferredLauncherHidden(false)
        setShowDeferredLauncherRestore(false)
        if (deferredRestoreTimer.current !== null) window.clearTimeout(deferredRestoreTimer.current)
        deferredRestoreTimer.current = null
      }
    }
    window.addEventListener('keydown', restoreLauncher)
    return () => window.removeEventListener('keydown', restoreLauncher)
  }, [])

  useEffect(() => () => {
    if (deferredHoldTimer.current !== null) window.clearTimeout(deferredHoldTimer.current)
    if (deferredRestoreTimer.current !== null) window.clearTimeout(deferredRestoreTimer.current)
  }, [])

  const clearDeferredLauncherHold = () => {
    if (deferredHoldTimer.current !== null) window.clearTimeout(deferredHoldTimer.current)
    deferredHoldTimer.current = null
    deferredHoldOrigin.current = null
  }
  const hideDeferredLauncher = () => {
    setDeferredLauncherHidden(true)
    setShowDeferredLauncherRestore(true)
    if (deferredRestoreTimer.current !== null) window.clearTimeout(deferredRestoreTimer.current)
    deferredRestoreTimer.current = window.setTimeout(() => {
      setShowDeferredLauncherRestore(false)
      deferredRestoreTimer.current = null
    }, 10000)
  }
  const restoreDeferredLauncher = () => {
    setDeferredLauncherHidden(false)
    setShowDeferredLauncherRestore(false)
    if (deferredRestoreTimer.current !== null) window.clearTimeout(deferredRestoreTimer.current)
    deferredRestoreTimer.current = null
  }

  useEffect(() => {
    // Keep route changes instant while ordinary document scrolling remains smooth.
    const root = document.documentElement
    const previousBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, 0)
    root.style.scrollBehavior = previousBehavior
  }, [loc.pathname])

  useEffect(() => {
    if (!a.me || (loc.pathname === '/signin' && new URLSearchParams(loc.search).get('recovery') === '1')) return
    const dest = sessionStorage.getItem('qreturn')
    if (dest) {
      sessionStorage.removeItem('qreturn')
      skipNextPageTransition.current = true
      nav(dest, { replace: true })
    }
  }, [a.me?.id, loc.pathname, nav])

  // Reset the live-event baseline when accounts change so notifications never leak
  // across a sign-out/sign-in transition on the same browser tab.
  const knownUser = useRef<string | null>(null)
  useEffect(() => {
    const uid = a.me?.id || null
    if (knownUser.current !== uid) {
      knownUser.current = uid
      known.current = null
      // Notifications can arrive in a batch after a reconnect or initial load.
      // Record the start of this signed-in session so old durable events are
      // still visible as unread, but aren't presented as if they just happened.
      notificationSessionStartedAt.current = uid ? Date.now() : 0
    }
  }, [a.me?.id])

  // One chime per event batch, a toast in-app, and one browser alert per event while
  // the page is backgrounded. Every item remains in the persistent notification panel.
  useEffect(() => {
    if (!a.ready) return
    if (known.current === null) {
      // Establish the initial snapshot immediately. Event timestamps below decide
      // whether a newly synchronized item is recent enough to toast, so late-loading
      // history cannot be mistaken for a live event.
      known.current = new Set(notifs.map(n => n.key))
      return
    }
    const now = Date.now()
    const maxToastAgeMs = 2 * 60 * 1000
    const fresh = notifs.filter(n =>
      n.unread
      && !known.current!.has(n.key)
      && n.at >= notificationSessionStartedAt.current
      && now - n.at <= maxToastAgeMs
      && n.at <= now + 30_000
    )
    if (fresh.length) {
      if (sound && us.st.preferences?.sound !== false) chime()
      a.toast(fresh.length === 1 ? fresh[0].text : `${fresh.length} new Quorlyth notifications`)
      if (us.st.preferences?.desktopNotifications !== false && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        fresh.forEach(n => {
          try { new Notification('Quorlyth', { body: n.text, tag: n.key }) } catch {}
        })
      }
      fresh.forEach(n => known.current!.add(n.key))
    }
  }, [notifs, a.ready, a.toast, sound])

  // Message notifications are account-scoped and work from every page, not only the inbox.
  useEffect(() => {
    const store = a.backend?.store
    const uid = a.me?.id
    if (!store || !uid || a.demo || a.backend?.auth.mode === 'supabase') return
    let conversations: any[] = []
    let mutedConversationIds = new Set<string>()
    const offConversations = store.subscribe('conversations', docs => {
      conversations = docs.map(d => ({ id: d.id, ...d.data })).filter(c => Array.isArray(c.members) && c.members.includes(uid))
    }, e => console.warn('Could not load conversations for notifications', e))
    const offChatPreferences = store.subscribe('chatPreferences', docs => {
      mutedConversationIds = new Set(docs.map(d => ({ id: d.id, ...d.data })).filter(p => p.userId === uid && p.muted).map(p => p.conversationId))
    }, e => console.warn('Could not load muted chat preferences', e))
    const offMessages = store.subscribe('messages', docs => {
      const all = docs.map(d => ({ id: d.id, ...d.data })).filter(m => typeof m.conversationId === 'string' && typeof m.senderId === 'string' && typeof m.text === 'string')
      if (knownMessages.current === null) {
        knownMessages.current = new Set(all.map(m => m.id))
        return
      }
      const incoming = all.filter(m => m.senderId !== uid && !knownMessages.current!.has(m.id) && conversations.some(c => c.id === m.conversationId) && !mutedConversationIds.has(m.conversationId))
      for (const message of all) knownMessages.current.add(message.id)
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
    return () => { offConversations(); offMessages(); offChatPreferences(); knownMessages.current = null }
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

  const enableDesktopAlerts = async () => {
    if (typeof Notification === 'undefined') {
      setDesktopPermission('unsupported')
      a.toast('Desktop notifications are not supported in this browser.')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      setDesktopPermission(permission)
      a.toast(permission === 'granted'
        ? 'Desktop alerts enabled while Quorlyth is open in the background.'
        : permission === 'denied'
          ? 'Desktop alerts are blocked by your browser. Change the site notification permission in browser settings.'
          : 'Desktop alerts were not enabled.')
    } catch {
      a.toast('Could not enable desktop alerts. Check your browser permissions.')
    }
  }

  if (!a.ready) return <main aria-label="Preparing Quorlyth" />
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
      {intro && <Intro replay={replay} onDone={() => {
        setIntro(false)
        try { localStorage.setItem('qintro', '1') } catch {}
        try { sessionStorage.setItem('qintro', '1') } catch {}
      }} />}
      <Nav onSearch={() => setPalette(true)} onBell={() => setBell(b => !b)} unread={unread} pendingRequests={pendingRequests} unreadRequests={unreadRequests} accessSent={accessSent} demo={a.demo} onDemo={() => { a.enterDemo(); nav('/dashboard') }} onReplay={() => { setIntro(true); setReplay(r => r + 1) }} />
      {a.demo && <div className="demo-banner" role="status"><span><b>Interactive demo</b><small>Sample data only · changes reset when you leave</small></span><div><button className="chip" onClick={async () => { await a.exitDemo(); nav('/signin', { replace: true }) }}>Sign in</button>{' '}<button className="chip" onClick={async () => { try { await a.signOut(); nav('/signin', { replace: true }) } catch (error: any) { a.toast(error?.message || 'Could not sign out. Please try again.') } }}>Sign out</button>{' '}<button className="chip" onClick={async () => { await a.exitDemo(); nav('/') }}>Exit demo</button></div></div>}
      <main id="main">
        <section className="on">
          <Suspense fallback={<DelayedRouteLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/demo" element={<DemoRedirect onBeforeRedirect={() => { skipNextPageTransition.current = true }} />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/communities" element={<Communities />} />
              <Route path="/communities/:cid" element={<Communities />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/messages/:conversationId" element={<Messages />} />
              <Route path="/idea/:id" element={<IdeaPage />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/collaborations" element={<Collaborations />} />
              <Route path="/collaboration/:id" element={<CollaborationWorkspace />} />
              <Route path="/promote" element={<Promote />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/database" element={<Database />} />
              <Route path="/access" element={<Access />} />
              <Route path="/request-access" element={<Access />} />
              <Route path="/me" element={<Me />} />
              <Route path="/me/:id" element={<Me />} />
              <Route path="*" element={<MissingRoute />} />
            </Routes>
          </Suspense>
        </section>
      </main>
      {bell && <NotifPanel list={notifs} sound={sound} onSound={() => { const n = !sound; setSound(n); localStorage.setItem('qsnd', n ? '1' : '0'); void us.patch({ preferences: { ...(us.st.preferences || {}), sound: n } }); if (n) chime() }} desktopPermission={desktopPermission} onDesktop={enableDesktopAlerts} onOpen={n => us.patch({ read: { [n.key]: true } })} onMarkAll={us.markAll} onClose={() => setBell(false)} />}
      {palette && <Palette onClose={() => setPalette(false)} onReplay={() => { setIntro(true); setReplay(r => r + 1) }} onKeys={() => setKeys(true)} />}
      {keys && <Shortcuts onClose={() => setKeys(false)} />}
      {!botMounted ? <>
        {!deferredLauncherHidden && <button
          id="astl"
          className="astl"
          onPointerEnter={() => { void loadQuorlythBot().catch(() => {}) }}
          onFocus={() => { void loadQuorlythBot().catch(() => {}) }}
          aria-label="Open QuorlythBot"
          title="Right-click to hide · Press and hold on mobile to hide"
          onClick={() => {
            if (deferredLongPressTriggered.current) { deferredLongPressTriggered.current = false; return }
            setBotMounted(true)
          }}
          onContextMenu={event => { event.preventDefault(); hideDeferredLauncher() }}
          onPointerDown={event => {
            if (event.pointerType !== 'touch') return
            clearDeferredLauncherHold()
            deferredLongPressTriggered.current = false
            deferredHoldOrigin.current = { x: event.clientX, y: event.clientY }
            deferredHoldTimer.current = window.setTimeout(() => {
              deferredLongPressTriggered.current = true
              deferredHoldTimer.current = null
              hideDeferredLauncher()
              window.setTimeout(() => { deferredLongPressTriggered.current = false }, 900)
            }, 650)
          }}
          onPointerMove={event => {
            const origin = deferredHoldOrigin.current
            if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) clearDeferredLauncherHold()
          }}
          onPointerUp={clearDeferredLauncherHold}
          onPointerCancel={clearDeferredLauncherHold}
          onPointerLeave={clearDeferredLauncherHold}
        ><span className="astm"><Logo size={30} /></span></button>}
        {deferredLauncherHidden && showDeferredLauncherRestore && <div className="qbot-launcher-hidden-notice" role="status">
          <span>QuorlythBot hidden</span>
          <button type="button" onClick={restoreDeferredLauncher}>Undo</button>
          <span className="qbot-launcher-shortcut">Alt + Shift + B</span>
        </div>}
      </> : <Suspense fallback={<div className="astl qbot-deferred-loading" role="status" aria-label="Loading QuorlythBot"><span className="astm"><Logo size={30} /></span></div>}><QuorlythBot initialOpen /></Suspense>}
      <Toast />
      <WritingAssistant />
    </>
  )
}
