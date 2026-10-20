import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'
import { Av } from './ui'

const ITEMS: { path: string; label: string; icon: string; owner?: boolean; communityOwner?: boolean; platformOwnerOnly?: boolean; platformAdminOnly?: boolean; guest?: boolean }[] = [
  { path: '/', label: 'Home', icon: 'audience' },
  { path: '/demo', label: 'Explore demo', icon: 'spark', guest: true },
  { path: '/signin', label: 'Sign in', icon: 'private', guest: true },
  { path: '/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/access', label: 'Request access', icon: 'invite' },
  { path: '/analytics', label: 'Analytics', icon: 'insight' },
  { path: '/communities', label: 'Communities', icon: 'community' },
  { path: '/messages', label: 'Messages', icon: 'message' },
  { path: '/queue', label: 'Review queue', icon: 'queue', owner: true },
  { path: '/projects', label: 'Projects', icon: 'insight' },
  { path: '/collaborations', label: 'Collaborations', icon: 'collab' },
  { path: '/promote', label: 'Promote', icon: 'promote', owner: true },
  { path: '/settings', label: 'Settings', icon: 'settings' },
  { path: '/me', label: 'My space', icon: 'member' },
  { path: '/database', label: 'Database', icon: 'db', owner: true, platformOwnerOnly: true },
]

function preloadRoute(path: string) {
  // Warm a route chunk on hover/focus so navigation does not start downloading after the click.
  const normalized = path.startsWith('/communities/') ? '/communities'
    : path.startsWith('/messages/') ? '/messages'
    : path.startsWith('/collaboration/') ? '/collaboration'
    : path.startsWith('/me/') ? '/me'
    : path.startsWith('/idea/') ? '/idea'
    : path === '/request-access' ? '/access'
    : path
  const loaders: Record<string, () => Promise<unknown>> = {
    '/': () => import('../screens/Landing'),
    '/dashboard': () => import('../screens/Dashboard'),
    '/access': () => import('../screens/Access'),
    '/analytics': () => import('../screens/Analytics'),
    '/communities': () => import('../screens/Communities'),
    '/messages': () => import('../screens/Messages'),
    '/queue': () => import('../screens/Queue'),
    '/projects': () => import('../screens/Projects'),
    '/collaborations': () => import('../screens/Collaborations'),
    '/collaboration': () => import('../screens/Collaborations'),
    '/promote': () => import('../screens/Promote'),
    '/settings': () => import('../screens/Settings'),
    '/me': () => import('../screens/Me'),
    '/idea': () => import('../screens/IdeaPage'),
    '/onboarding': () => import('../screens/Onboarding'),
    '/database': () => import('../screens/Database'),
    '/signin': () => import('../screens/SignIn'),
    '/demo': () => import('../screens/Dashboard'),
  }
  try { void (loaders[normalized] || loaders[path])?.().catch(() => {}) } catch {}
}
export function Nav({ onSearch, onBell, unread, pendingRequests, unreadRequests, accessSent, demo, onDemo, onReplay }: { onSearch: () => void; onBell: () => void; unread: number; pendingRequests: number; unreadRequests: number; accessSent: boolean; demo: boolean; onDemo: () => void; onReplay: () => void }) {
  const nav = useNavigate()
  const loc = useLocation()
  const app = useApp()
  const { me, owner, platformOwner, platformAdmin } = app
  const publicLanding = loc.pathname === '/' && !me && !demo
  const communityOwner = !!me && app.data.communities.some(c => app.ownsCommunity(c.id))
  const workspaceManager = owner || communityOwner
  const hasAccessibleProject = !!me && app.data.ideas.some(idea => {
    const relevant = app.ownsCommunity(idea.cid)
      || idea.authorId === me.id
      || app.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === me.id && v.status === 'accepted')
    return relevant && (!!app.data.projects[idea.id] || ['selected', 'promoted'].includes(app.statusOf(idea.id)))
  })
  const main = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLElement>(null)
  const active = (p: string) => p === '/' ? loc.pathname === '/' : loc.pathname === p || loc.pathname.startsWith(p + '/')

  useEffect(() => {
    const m = main.current!, w = wrap.current!, th = thumb.current!
    let tm = 0, initialMeasure = 0, dragging = false, moved = false, sx = 0, s0 = 0
    const upd = () => {
      const maxScroll = Math.max(0, m.scrollWidth - m.clientWidth)
      const overflowing = maxScroll > 2
      w.classList.toggle('ov', overflowing)
      if (!overflowing) {
        th.style.width = '0%'
        th.style.transform = 'translateX(0)'
        return
      }
      const thumbRatio = Math.min(1, m.clientWidth / m.scrollWidth)
      const trackWidth = th.parentElement?.clientWidth || w.clientWidth
      const thumbWidth = thumbRatio * trackWidth
      const travel = Math.max(0, trackWidth - thumbWidth)
      const progress = Math.max(0, Math.min(1, m.scrollLeft / maxScroll))
      th.style.width = (thumbRatio * 100) + '%'
      th.style.transform = `translateX(${progress * travel}px)`
    }
    const onScroll = () => {
      upd()
      w.classList.add('sc')
      window.clearTimeout(tm)
      tm = window.setTimeout(() => w.classList.remove('sc'), 1100)
    }
    const wheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && m.scrollWidth > m.clientWidth) { e.preventDefault(); m.scrollLeft += e.deltaY } }
    const down = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; dragging = true; moved = false; sx = e.clientX; s0 = m.scrollLeft }
    const move = (e: PointerEvent) => { if (!dragging) return; const d = e.clientX - sx; if (Math.abs(d) > 5) moved = true; m.scrollLeft = s0 - d }
    const up = () => { dragging = false }
    const click = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false } }
    m.addEventListener('scroll', onScroll, { passive: true }); m.addEventListener('wheel', wheel, { passive: false }); m.addEventListener('pointerdown', down)
    addEventListener('pointermove', move); addEventListener('pointerup', up); m.addEventListener('click', click, true); addEventListener('resize', upd)
    const ro = 'ResizeObserver' in window ? new ResizeObserver(upd) : null; ro?.observe(m.parentElement!)
    initialMeasure = window.setTimeout(upd, 60)
    return () => { window.clearTimeout(initialMeasure); window.clearTimeout(tm); m.removeEventListener('scroll', onScroll); m.removeEventListener('wheel', wheel); m.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); m.removeEventListener('click', click, true); removeEventListener('resize', upd); ro?.disconnect() }
  }, [])

  useEffect(() => {
    const a = main.current?.querySelector('.on') as HTMLElement | null
    if (a && main.current) { const l = a.offsetLeft - main.current.clientWidth / 2 + a.offsetWidth / 2; if (main.current.scrollTo) main.current.scrollTo({ left: l, behavior: 'smooth' }); else main.current.scrollLeft = l }
  }, [loc.pathname, owner])

  return (
    <nav className={cn('glass', publicLanding && 'nav-public')} id="nav" aria-label="Main navigation">
      <button className="lgb" onClick={onReplay} title="Replay intro" aria-label="Replay Quorlyth introduction"><Logo size={26} breathe /></button>
      <b className="nav-wordmark">{'QUORLYTH'.split('').map((c, i) => <span key={i} style={{ ['--word-index' as any]: i }}>{c}</span>)}</b>
      <div className="navwrap" ref={wrap}>
        <div className="navmain" ref={main}>
          {ITEMS.filter(i => {
            if (i.platformAdminOnly) return !!platformAdmin && !demo
            if (i.platformOwnerOnly) return !!platformOwner && !demo
            if (i.path === '/projects' && !workspaceManager && !hasAccessibleProject) return false
            if (i.path === '/access' && me && app.data.decisions[me.id]?.status === 'approved' && !accessSent) return false
            if (demo) return !i.guest && (!i.owner || workspaceManager) && (!i.communityOwner || workspaceManager)
            if (me) return !i.guest && (!i.owner || workspaceManager) && (!i.communityOwner || workspaceManager)
            return publicLanding ? ['/demo', '/signin'].includes(i.path) : ['/', '/demo', '/signin'].includes(i.path)
          }).map(i => (
            <button key={i.path} className={cn('nav-item', 'nav-item-' + (i.path.slice(1).replace(/[^a-z0-9]+/g, '-') || 'home'), active(i.path) && 'on')} onPointerEnter={() => preloadRoute(i.path)} onPointerDown={() => preloadRoute(i.path)} onFocus={() => preloadRoute(i.path)} onClick={() => i.path === '/demo' ? onDemo() : nav(i.path === '/settings' && unreadRequests ? '/settings?tab=requests' : i.path)} title={i.label} aria-label={i.path === '/settings' && pendingRequests ? `${i.label}, ${pendingRequests} pending access requests` : i.path === '/access' && accessSent ? `${i.label}, request sent` : i.label} style={{ position: 'relative' }}>
              <Icon name={i.icon} size={18} /><span>{i.label}</span>
              {i.path === '/settings' && pendingRequests > 0 && <b className={cn('nav-count', unreadRequests > 0 && 'pulse')}>{pendingRequests > 9 ? '9+' : pendingRequests}</b>}
              {i.path === '/access' && accessSent && <b className="nav-count sent">Sent</b>}
            </button>
          ))}
        </div>
        <div className="nsl"><i ref={thumb} /></div>
      </div>
      {!publicLanding && <div className="navend">
        <button className="bl" onClick={onBell} title="Notifications" aria-label="Notifications" style={{ position: 'relative' }}>
          <Icon name="bell" size={18} />{unread > 0 && <b className="bdg pulse">{unread > 9 ? '9+' : unread}</b>}
        </button>
        <button className="srch" onClick={onSearch} title="Search (Ctrl K)" aria-label="Search Quorlyth (Control K)"><Icon name="search" size={18} /><span>Search</span><kbd>Ctrl K</kbd></button>
        <button className="navav" onClick={() => nav(me ? '/me' : '/signin')} title={me ? 'My profile' : 'Sign in'} aria-label={me ? 'Open my profile' : 'Sign in'}>
          {me ? <><Av id={me.id} size={34} /><i className="ring" /></> : <Icon name="private" size={18} />}
        </button>
      </div>}
    </nav>
  )
}
