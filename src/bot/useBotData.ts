import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../data/AppProvider'
import { Chat } from '../lib/types'
import { BOT_DEFAULTS, BotSettings } from './config'

export interface Project { id: string; name: string; ins?: string; cid?: string; at: number }
export interface LibItem { id: string; title: string; text: string; at: number }

/** Everything the bot remembers about you, stored privately under data/users/<you>. */
export function useBotData() {
  const { backend, me } = useApp()
  const [docs, setDocs] = useState<Record<string, any>>({})
  useEffect(() => {
    if (!backend || !me) { setDocs({}); return }
    return backend.store.subscribe('data/users/' + me.id, d => setDocs(Object.fromEntries(d.map(x => [x.id, x.data]))))
  }, [backend, me?.id])

  const base = 'data/users/' + (me?.id || '')
  const settings: BotSettings = { ...BOT_DEFAULTS, ...(docs.botset || {}) }
  const chats: Chat[] = Object.keys(docs).filter(k => k.startsWith('c_')).map(k => ({ id: k, ...docs[k] })).sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.upd - a.upd)
  const projects: Project[] = Object.keys(docs).filter(k => k.startsWith('p_')).map(k => ({ id: k, ...docs[k] })).sort((a, b) => b.at - a.at)
  const library: LibItem[] = Object.keys(docs).filter(k => k.startsWith('l_')).map(k => ({ id: k, ...docs[k] })).sort((a, b) => b.at - a.at)

  const put = useCallback((id: string, data: any) => {
    const previous = docs[id]
    setDocs(d => ({ ...d, [id]: data }))
    const { id: _i, ...rest } = data
    if (!backend) return Promise.resolve(false)
    return backend.store.set(`${base}/${id}`, JSON.parse(JSON.stringify(rest))).then(() => true).catch(() => {
      setDocs(d => {
        if (d[id] !== data) return d
        const next = { ...d }
        if (previous === undefined) delete next[id]
        else next[id] = previous
        return next
      })
      return false
    })
  }, [backend, base, docs])
  const remove = useCallback((id: string) => {
    const previous = docs[id]
    setDocs(d => { const n = { ...d }; delete n[id]; return n })
    if (!backend) return Promise.resolve(false)
    return backend.store.delete(`${base}/${id}`).then(() => true).catch(() => {
      if (previous !== undefined) setDocs(d => d[id] === undefined ? { ...d, [id]: previous } : d)
      return false
    })
  }, [backend, base, docs])
  const saveSettings = useCallback((p: Partial<BotSettings>) => put('botset', { ...settings, ...p }), [put, settings])
  return { settings, chats, projects, library, put, remove, saveSettings, doc: (id: string) => docs[id] }
}
