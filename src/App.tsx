import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { Nav } from './components/Nav'
import { Toast } from './components/ui'
import { Intro } from './components/Intro'
import { Palette } from './components/Palette'
import { Shortcuts } from './components/Shortcuts'
import { NotifPanel } from './components/NotifPanel'
import { Landing } from './screens/Landing'
import { SignIn } from './screens/SignIn'
import { Dashboard } from './screens/Dashboard'
import { Communities } from './screens/Communities'
import { IdeaPage } from './screens/IdeaPage'
import { Queue } from './screens/Queue'
import { Promote } from './screens/Promote'
import { Me } from './screens/Me'
import { Analytics } from './screens/Analytics'
import { Settings } from './screens/Settings'
import { Database } from './screens/Database'
import { Access } from './screens/Access'
import { Onboarding } from './screens/Onboarding'
import { QuorlythBot } from './bot/QuorlythBot'
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
  const known = useRef<Set<string> | null>(null)
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

  // no pinch or ctrl-wheel zoom, and a thin line that shows how far the page is scrolled
  useEffect(() => {
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault() }
    const gest = (e: Event) => e.preventDefault()
    const keysZoom = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', '_'].includes(e.key)) e.preventDefault() }
    const touch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    document.addEventListener('wheel', wheel, { passive: false }); document.addEventListener('keydown', keysZoom); document.addEventListener('touchmove', touch, { passive: false })
    ;['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, gest))
    const sp = document.getElementById('sp'); let raf = 0
    const sc = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const m = document.documentElement.scrollHeight - innerHeight; if (sp) sp.style.transform = `scaleX(${m > 0 ? Math.min(1, scrollY / m) : 0})` }) }
    addEventListener('scroll', sc, { passive: true })
    return () => { document.removeEventListener('wheel', wheel); document.removeEventListener('keydown', keysZoom); document.removeEventListener('touchmove', touch); ;['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.removeEventListener(t, gest)); removeEventListener('scroll', sc) }
  }, [])

  if (!a.ready) return <main />
  return (
    <>
      <div id="sp" />
      {intro && <Intro replay={replay} onDone={() => { setIntro(false); sessionStorage.setItem('qintro', '1') }} />}
      <Nav onSearch={() => setPalette(true)} onBell={() => setBell(b => !b)} unread={unread} onReplay={() => { setIntro(true); setReplay(r => r + 1) }} />
      <main id="main">
        <section className="on">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/communities/:cid" element={<Communities />} />
            <Route path="/idea/:id" element={<IdeaPage />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/promote" element={<Promote />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/database" element={<Database />} />
            <Route path="/access" element={<Access />} />
            <Route path="/me" element={<Me />} />
            <Route path="/me/:id" element={<Me />} />
          </Routes>
        </section>
      </main>
      {bell && <NotifPanel list={notifs} sound={sound} onSound={() => { const n = !sound; setSound(n); localStorage.setItem('qsnd', n ? '1' : '0'); if (n) chime() }} onOpen={n => us.patch({ read: { [n.key]: true } })} onMarkAll={us.markAll} onClose={() => setBell(false)} />}
      {palette && <Palette onClose={() => setPalette(false)} onReplay={() => { setIntro(true); setReplay(r => r + 1) }} onKeys={() => setKeys(true)} />}
      {keys && <Shortcuts onClose={() => setKeys(false)} />}
      <QuorlythBot />
      <Toast />
    </>
  )
}
