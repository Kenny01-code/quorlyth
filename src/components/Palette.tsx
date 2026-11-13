import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'
import { cn, when } from '../lib/util'

interface R { g: string; icon: string; t: string; sub: string; run: () => void }
const WORDS = ['Search ideas, people, communities', 'Try a title or a name', 'Jump to analytics']

export function Palette({ onClose, onReplay, onKeys }: { onClose: () => void; onReplay: () => void; onKeys: () => void }) {
  const a = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const [ph, setPh] = useState(WORDS[0])
  const list = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLElement>(null)

  useEffect(() => {
    let k = 0, c = 0, dir = 1, t: number
    const tick = () => { const s = WORDS[k % WORDS.length]; if (dir > 0) { c++; setPh(s.slice(0, c)); if (c >= s.length) { dir = -1; t = window.setTimeout(tick, 1800); return } t = window.setTimeout(tick, 60) } else { setPh(''); dir = 1; c = 0; k++; t = window.setTimeout(tick, 300) } }
    tick(); return () => clearTimeout(t)
  }, [])

  const results = useMemo<R[]>(() => {
    const has = (s?: string) => !q || String(s || '').toLowerCase().includes(q.toLowerCase())
    const o: R[] = []
    const screens: [string, string, string, boolean][] = [['Home', 'audience', '/', true], ['Sign in', 'private', '/signin', !a.me], ['Request access', 'invite', '/access', true], ['Dashboard', 'home', '/dashboard', true], ['Analytics', 'insight', '/analytics', true], ['Communities', 'community', '/communities', true], ['Review queue', 'queue', '/queue', true], ['Promote', 'promote', '/promote', true], ['Settings', 'settings', '/settings', true], ['My space', 'member', '/me', true], ['Database', 'db', '/database', a.owner]]
    screens.filter(s => s[3] && has(s[0])).forEach(s => o.push({ g: 'Screens', icon: s[1], t: s[0], sub: 'Open', run: () => nav(s[2]) }))
    if (has('edit my profile photo')) o.push({ g: 'Screens', icon: 'edit', t: 'Edit my profile', sub: 'Name, photo and bio', run: () => nav('/me') })
    if (has('keyboard shortcuts help')) o.push({ g: 'Screens', icon: 'keys', t: 'Keyboard shortcuts', sub: 'Press ?', run: onKeys })
    if (has('replay intro')) o.push({ g: 'Screens', icon: 'spark', t: 'Replay intro', sub: 'Logo animation', run: onReplay })
    if (has('sign out logout') && a.me) o.push({ g: 'Screens', icon: 'private', t: 'Sign out', sub: 'End this session', run: () => a.backend?.auth.signOut() })
    a.data.communities.filter(c => has(c.name) || has(c.purpose)).slice(0, 6).forEach(c => o.push({ g: 'Communities', icon: 'community', t: c.name, sub: c.purpose || 'Community', run: () => nav('/communities/' + c.id) }))
    a.data.ideas.filter(x => has(x.title) || has(x.body) || (x.tags || []).some(has)).sort((x, y) => y.at - x.at).slice(0, q ? 8 : 3).forEach(x => o.push({ g: 'Ideas', icon: 'idea', t: x.title, sub: `${a.nm(x.authorId)}, ${when(x.at)}`, run: () => nav('/idea/' + x.id) }))
    if (q) Object.keys(a.data.profiles).filter(id => has(a.nm(id))).slice(0, 6).forEach(id => o.push({ g: 'People', icon: 'member', t: a.nm(id), sub: a.data.profiles[id]?.head || 'Member', run: () => nav('/me/' + id) }))
    return o
  }, [q, a.data, a.owner, a.me?.id])

  useEffect(() => setI(0), [q])
  // smooth wheel scrolling and a thin line that shows how far you have scrolled
  useEffect(() => {
    const el = list.current; if (!el) return
    let target = el.scrollTop, raf = 0
    const step = () => { const d = target - el.scrollTop; if (Math.abs(d) < 0.5) { el.scrollTop = target; raf = 0; return } el.scrollTop += d * 0.16; raf = requestAnimationFrame(step) }
    const wheel = (e: WheelEvent) => { const max = el.scrollHeight - el.clientHeight; if (max <= 0 || e.ctrlKey) return; e.preventDefault(); target = Math.max(0, Math.min(max, target + e.deltaY * (e.deltaMode === 1 ? 32 : 1))); if (!raf) raf = requestAnimationFrame(step) }
    const scroll = () => { if (!raf) target = el.scrollTop; const m = el.scrollHeight - el.clientHeight; if (line.current) line.current.style.width = (m > 0 ? Math.round(el.scrollTop / m * 100) : 0) + '%' }
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('scroll', scroll, { passive: true })
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('scroll', scroll); cancelAnimationFrame(raf) }
  }, [])
  useEffect(() => { const el = list.current?.querySelector('.rr.on') as HTMLElement | null; if (el && list.current) { const l = list.current; if (el.offsetTop < l.scrollTop + 8 || el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight - 8) { const t = el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2; if (l.scrollTo) l.scrollTo({ top: t, behavior: 'smooth' }); else l.scrollTop = t } } }, [i])

  const pick = (r?: R) => { if (r) { onClose(); r.run() } }
  let g = ''
  return (
    <div id="cmd" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cb glass" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % Math.max(1, results.length)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + results.length) % Math.max(1, results.length)) } else if (e.key === 'Enter') { e.preventDefault(); pick(results[i]) } else if (e.key === 'Escape') onClose() }}>
        <div className="cs"><Icon name="search" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={ph || ' '} autoComplete="off" aria-label="Search" /><button className="chip" onClick={onClose}>Esc</button></div>
        <div className="sl"><i ref={line as any} /></div>
        <div className="clist" ref={list} role="listbox">
          {results.length ? results.map((r, k) => {
            const head = r.g !== g ? <div className="gh">{(g = r.g)}</div> : null
            return <div key={k}>{head}<div className={cn('rr', k === i && 'on')} role="option" aria-selected={k === i} onMouseEnter={() => setI(k)} onClick={() => pick(r)}><Icon name={r.icon} size={20} /><div className="t"><h3>{r.t}</h3><p className="dim" style={{ fontSize: 13 }}>{r.sub.slice(0, 80)}</p></div></div></div>
          }) : <p className="mut" style={{ padding: '30px 14px', textAlign: 'center' }}>No results for "{q}".</p>}
        </div>
        <div className="cf dim"><span>Up and down to move, Enter to open</span><span>Esc to close</span></div>
      </div>
    </div>
  )
}
