import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'
import { Av } from './ui'

const ITEMS: { path: string; label: string; icon: string; owner?: boolean; guest?: boolean }[] = [
  { path: '/', label: 'Home', icon: 'audience' },
  { path: '/signin', label: 'Sign in', icon: 'private', guest: true },
  { path: '/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/access', label: 'Request access', icon: 'invite' },
  { path: '/analytics', label: 'Analytics', icon: 'insight' },
  { path: '/communities', label: 'Communities', icon: 'community' },
  { path: '/queue', label: 'Review queue', icon: 'queue' },
  { path: '/promote', label: 'Promote', icon: 'promote' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
  { path: '/me', label: 'My space', icon: 'member' },
  { path: '/database', label: 'Database', icon: 'db', owner: true },
]

export function Nav({ onSearch, onBell, unread, onReplay }: { onSearch: () => void; onBell: () => void; unread: number; onReplay: () => void }) {
  const nav = useNavigate()
  const loc = useLocation()
  const { me, owner } = useApp()
  const main = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLElement>(null)
  const active = (p: string) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p))

  useEffect(() => {
    const m = main.current!, w = wrap.current!, th = thumb.current!
    let tm: number, dragging = false, moved = false, sx = 0, s0 = 0
    const upd = () => {
      const o = m.scrollWidth > m.clientWidth + 2
      w.classList.toggle('ov', o)
      if (o) { th.style.width = (m.clientWidth / m.scrollWidth) * 100 + '%'; th.style.transform = `translateX(${(m.scrollLeft / m.clientWidth) * 100}%)` }
    }
    const onScroll = () => { upd(); w.classList.add('sc'); clearTimeout(tm); tm = window.setTimeout(() => w.classList.remove('sc'), 1100) }
    const wheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && m.scrollWidth > m.clientWidth) { e.preventDefault(); m.scrollLeft += e.deltaY } }
    const down = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; dragging = true; moved = false; sx = e.clientX; s0 = m.scrollLeft }
    const move = (e: PointerEvent) => { if (!dragging) return; const d = e.clientX - sx; if (Math.abs(d) > 5) moved = true; m.scrollLeft = s0 - d }
    const up = () => { dragging = false }
    const click = (e: MouseEvent) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false } }
    m.addEventListener('scroll', onScroll, { passive: true }); m.addEventListener('wheel', wheel, { passive: false }); m.addEventListener('pointerdown', down)
    addEventListener('pointermove', move); addEventListener('pointerup', up); m.addEventListener('click', click, true); addEventListener('resize', upd)
    const ro = 'ResizeObserver' in window ? new ResizeObserver(upd) : null; ro?.observe(m.parentElement!)
    setTimeout(upd, 60)
    return () => { m.removeEventListener('scroll', onScroll); m.removeEventListener('wheel', wheel); m.removeEventListener('pointerdown', down); removeEventListener('pointermove', move); removeEventListener('pointerup', up); m.removeEventListener('click', click, true); removeEventListener('resize', upd); ro?.disconnect() }
  }, [])

  useEffect(() => {
    const a = main.current?.querySelector('.on') as HTMLElement | null
    if (a && main.current) { const l = a.offsetLeft - main.current.clientWidth / 2 + a.offsetWidth / 2; if (main.current.scrollTo) main.current.scrollTo({ left: l, behavior: 'smooth' }); else main.current.scrollLeft = l }
  }, [loc.pathname, owner])

  return (
    <nav className="glass" id="nav">
      <button className="lgb" onClick={onReplay} title="Replay intro"><Logo size={26} /></button>
      <b>QUORLYTH</b>
      <div className="navwrap" ref={wrap}>
        <div className="navmain" ref={main}>
          {ITEMS.filter(i => (!i.owner || owner) && (!i.guest || !me)).map(i => (
            <button key={i.path} className={cn(active(i.path) && 'on')} onClick={() => nav(i.path)} title={i.label}>
              <Icon name={i.icon} size={18} /><span>{i.label}</span>
            </button>
          ))}
        </div>
        <div className="nsl"><i ref={thumb} /></div>
      </div>
      <div className="navend">
        <button className="bl" onClick={onBell} title="Notifications" aria-label="Notifications" style={{ position: 'relative' }}>
          <Icon name="bell" size={18} />{unread > 0 && <b className="bdg">{unread > 9 ? '9+' : unread}</b>}
        </button>
        <button className="srch" onClick={onSearch} title="Search (Ctrl K)"><Icon name="search" size={18} /><span>Search</span><kbd>Ctrl K</kbd></button>
        <button className="navav" onClick={() => nav(me ? '/me' : '/signin')} title={me ? 'My profile' : 'Sign in'}>
          {me ? <><Av id={me.id} size={34} /><i className="ring" /></> : <Icon name="private" size={18} />}
        </button>
      </div>
    </nav>
  )
}
