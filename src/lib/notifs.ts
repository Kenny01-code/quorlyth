import { useMemo } from 'react'
import { App } from '../data/AppProvider'
import { UserState } from './userState'

export interface Notif { key: string; at: number; icon: string; text: string; kind: 'idea' | 'promo' | 'access' | 'settings'; id?: string; unread: boolean }

const keyOf = (k: string, id: string | undefined, at: number) => `${k}_${id || 'x'}_${at}`.replace(/[^\w]/g, '_')

export function useNotifs(a: App, st: UserState): Notif[] {
  return useMemo(() => {
    const m = a.me?.id
    if (!m) return []
    const seen = st.seen || 0, rd = st.read || {}
    const out: Omit<Notif, 'key' | 'unread'>[] = []
    const d = a.data
    d.ideas.forEach(i => {
      const r = d.reviews[i.id]
      if (i.authorId === m && r && r.status && r.status !== 'review' && r.at) out.push({ at: r.at, icon: r.status === 'promoted' ? 'publish' : r.status === 'selected' ? 'select' : r.status === 'held' ? 'hold' : 'decline', text: `Your idea "${i.title}" was ${r.status === 'promoted' ? 'prepared for sharing' : r.status}`, kind: 'idea', id: i.id })
      if (i.authorId !== m && a.joined(i.cid) && i.at) out.push({ at: i.at, icon: 'idea', text: `${a.nm(i.authorId)} shared "${i.title}"`, kind: 'idea', id: i.id })
    })
    d.promotions.forEach(p => { if ((p.credits || []).includes(m) && p.by !== m) out.push({ at: p.at, icon: 'publish', text: 'You were credited in a post prepared to share', kind: 'promo', id: p.id }) })
    const dc = d.decisions[m]
    if (dc?.at) out.push({ at: dc.at, icon: dc.status === 'approved' ? 'approve' : 'alert', text: `Your access request was ${dc.status}`, kind: 'access' })
    if (a.owner) d.requests.forEach(r => { const x = d.decisions[r.id]; if (r.at && (!x || x.at < r.at)) out.push({ at: r.at, icon: 'invite', text: `${a.nm(r.id)} requested access`, kind: 'settings', id: r.id }) })
    return out.sort((x, y) => y.at - x.at).slice(0, 25).map(n => { const key = keyOf(n.kind, n.id, n.at); return { ...n, key, unread: n.at > seen && !rd[key] } })
  }, [a.data, a.me?.id, a.owner, st])
}

let ac: AudioContext | null = null
export function unlockAudio() { try { ac = ac || new (window.AudioContext || (window as any).webkitAudioContext)(); if (ac.state === 'suspended') ac.resume() } catch {} }
if (typeof document !== 'undefined') { document.addEventListener('pointerdown', unlockAudio); document.addEventListener('keydown', unlockAudio) }

/** A soft three note chime. Only plays once the page has had a click or key press. */
export function chime() {
  if (!ac || ac.state !== 'running') return
  const t = ac.currentTime
  ;[[880, 0], [1318.5, 0.13], [1760, 0.26]].forEach(([f, d], i) => {
    const o = ac!.createOscillator(), g = ac!.createGain()
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(i === 2 ? 0.05 : 0.11, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.75)
    o.connect(g); g.connect(ac!.destination); o.start(t + d); o.stop(t + d + 0.8)
  })
}
