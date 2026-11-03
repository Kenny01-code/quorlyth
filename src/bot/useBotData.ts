import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../data/AppProvider'
import { Chat } from '../lib/types'
import { BOT_DEFAULTS, BotSettings } from './config'

export interface Project { id: string; name: string; ins?: string; cid?: string; at: number }
export interface LibItem { id: string; title: string; text: string; at: number }

type UserDocs = { owner: string; docs: Record<string, any> }

/** Everything the bot remembers about you, stored privately under data/users/<you>. */
export function useBotData() {
  const { backend, me } = useApp()
  const [snapshot, setSnapshot] = useState<UserDocs>({ owner: '', docs: {} })
  const base = 'data/users/' + (me?.id || '')
  // This scope check takes effect during render, before the account-change effect runs.
  const docs = me && snapshot.owner === base ? snapshot.docs : {}
  const docsRef = useRef<Record<string, any>>(docs)
  docsRef.current = docs

  useEffect(() => {
    if (!backend || !me) {
      docsRef.current = {}
      setSnapshot({ owner: '', docs: {} })
      return
    }
    const owner = 'data/users/' + me.id
    return backend.store.subscribe(owner, rows => {
      const next = Object.fromEntries(rows.map(row => [row.id, row.data]))
      docsRef.current = next
      setSnapshot({ owner, docs: next })
    }, () => {
      // Keep the newest account-scoped snapshot visible across transient reconnects.
    })
  }, [backend, me?.id])

  const settings: BotSettings = { ...BOT_DEFAULTS, ...(docs.botset || {}) }
  const chats: Chat[] = Object.keys(docs).filter(key => key.startsWith('c_')).map(key => ({ id: key, ...docs[key] })).sort((a, b) => (Number(!!b.pin) - Number(!!a.pin)) || (b.upd || 0) - (a.upd || 0))
  const projects: Project[] = Object.keys(docs).filter(key => key.startsWith('p_')).map(key => ({ id: key, ...docs[key] })).sort((a, b) => (b.at || 0) - (a.at || 0))
  const library: LibItem[] = Object.keys(docs).filter(key => key.startsWith('l_')).map(key => ({ id: key, ...docs[key] })).sort((a, b) => (b.at || 0) - (a.at || 0))

  const put = useCallback((id: string, data: any) => {
    const previous = docsRef.current[id]
    const optimistic = { ...docsRef.current, [id]: data }
    docsRef.current = optimistic
    setSnapshot({ owner: base, docs: optimistic })
    const { id: _id, ...rest } = data
    if (!backend) return Promise.resolve(false)
    let serialized: string
    try { serialized = JSON.stringify(rest) } catch {
      const restored = { ...docsRef.current }
      if (previous === undefined) delete restored[id]
      else restored[id] = previous
      docsRef.current = restored
      setSnapshot({ owner: base, docs: restored })
      return Promise.resolve(false)
    }
    return backend.store.set(`${base}/${id}`, JSON.parse(serialized)).then(() => true).catch(() => {
      setSnapshot(current => {
        if (current.owner !== base || current.docs[id] !== data) return current
        const next = { ...current.docs }
        if (previous === undefined) delete next[id]
        else next[id] = previous
        docsRef.current = next
        return { owner: base, docs: next }
      })
      return false
    })
  }, [backend, base])

  const remove = useCallback((id: string) => {
    const previous = docsRef.current[id]
    const optimistic = { ...docsRef.current }
    delete optimistic[id]
    docsRef.current = optimistic
    setSnapshot({ owner: base, docs: optimistic })
    if (!backend) return Promise.resolve(false)
    return backend.store.delete(`${base}/${id}`).then(() => true).catch(() => {
      setSnapshot(current => {
        if (current.owner !== base || current.docs[id] !== undefined) return current
        const next = previous === undefined ? current.docs : { ...current.docs, [id]: previous }
        docsRef.current = next
        return { owner: base, docs: next }
      })
      return false
    })
  }, [backend, base])

  const saveSettings = useCallback((patch: Partial<BotSettings>) => {
    const next = { ...BOT_DEFAULTS, ...(docsRef.current.botset || {}), ...patch }
    return put('botset', next)
  }, [put])
  return { settings, chats, projects, library, put, remove, saveSettings, doc: (id: string) => docs[id] }
}
