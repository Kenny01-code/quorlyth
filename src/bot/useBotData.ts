import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../data/AppProvider'
import { Chat } from '../lib/types'
import { BOT_DEFAULTS, BotSettings } from './config'

export interface Project { id: string; name: string; ins?: string; cid?: string; at: number }
export interface LibItem { id: string; title: string; text: string; at: number }

type UserDocs = { owner: string; docs: Record<string, any> }

const cacheKey = (owner: string) => `quorlyth:bot-cache:v1:${owner}`
const queueKey = (owner: string) => `quorlyth:bot-queue:v1:${owner}`
function readLocalDocs(owner: string) {
  try { return JSON.parse(localStorage.getItem(cacheKey(owner)) || '{}') as Record<string, any> } catch { return {} }
}
function writeLocalDocs(owner: string, docs: Record<string, any>) {
  try { localStorage.setItem(cacheKey(owner), JSON.stringify(docs)); return true } catch { return false }
}
function readQueue(owner: string) {
  try { return JSON.parse(localStorage.getItem(queueKey(owner)) || '{}') as Record<string, any | null> } catch { return {} }
}
function writeQueue(owner: string, queue: Record<string, any | null>) {
  try {
    if (Object.keys(queue).length) localStorage.setItem(queueKey(owner), JSON.stringify(queue))
    else localStorage.removeItem(queueKey(owner))
  } catch { /* Keep the latest conversation in memory if device storage is full. */ }
}

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
    const queued = readQueue(owner)
    const local = { ...readLocalDocs(owner) }
    for (const [id, data] of Object.entries(queued)) {
      if (data === null) delete local[id]
      else local[id] = data
    }
    docsRef.current = local
    setSnapshot({ owner, docs: local })
    let active = true
    let syncing = false
    const syncQueued = async () => {
      if (!active || syncing || !navigator.onLine) return
      syncing = true
      try {
        const pending = readQueue(owner)
        for (const [id, data] of Object.entries(pending)) {
          if (!active || !navigator.onLine) break
          try {
            if (data === null) await backend.store.delete(`${owner}/${id}`)
            else await backend.store.set(`${owner}/${id}`, data)
            const latest = readQueue(owner)
            if (Object.prototype.hasOwnProperty.call(latest, id) && JSON.stringify(latest[id]) === JSON.stringify(data)) {
              delete latest[id]
              writeQueue(owner, latest)
            }
          } catch { break }
        }
      } finally { syncing = false }
    }
    const unsubscribe = backend.store.subscribe(owner, rows => {
      const remote = Object.fromEntries(rows.map(row => [row.id, row.data]))
      const pending = readQueue(owner)
      const next = { ...remote }
      for (const [id, data] of Object.entries(pending)) {
        if (data === null) delete next[id]
        else next[id] = data
      }
      if (!active) return
      docsRef.current = next
      setSnapshot({ owner, docs: next })
      writeLocalDocs(owner, next)
      void syncQueued()
    }, () => {
      // The account-scoped local snapshot stays available through reconnects.
    })
    window.addEventListener('online', syncQueued)
    void syncQueued()
    return () => {
      active = false
      window.removeEventListener('online', syncQueued)
      unsubscribe()
    }
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
    const clean = JSON.parse(serialized)
    writeLocalDocs(base, optimistic)
    const queue = readQueue(base)
    queue[id] = clean
    writeQueue(base, queue)
    return backend.store.set(`${base}/${id}`, clean).then(() => {
      const pending = readQueue(base)
      if (JSON.stringify(pending[id]) === JSON.stringify(clean)) { delete pending[id]; writeQueue(base, pending) }
      return true
    }).catch(() => true)
  }, [backend, base])

  const remove = useCallback((id: string) => {
    const previous = docsRef.current[id]
    const optimistic = { ...docsRef.current }
    delete optimistic[id]
    docsRef.current = optimistic
    setSnapshot({ owner: base, docs: optimistic })
    if (!backend) return Promise.resolve(false)
    writeLocalDocs(base, optimistic)
    const queue = readQueue(base)
    queue[id] = null
    writeQueue(base, queue)
    return backend.store.delete(`${base}/${id}`).then(() => {
      const pending = readQueue(base)
      if (Object.prototype.hasOwnProperty.call(pending, id) && pending[id] === null) { delete pending[id]; writeQueue(base, pending) }
      return true
    }).catch(() => true)
  }, [backend, base])

  const saveSettings = useCallback((patch: Partial<BotSettings>) => {
    const next = { ...BOT_DEFAULTS, ...(docsRef.current.botset || {}), ...patch }
    return put('botset', next)
  }, [put])
  return { settings, chats, projects, library, put, remove, saveSettings, doc: (id: string) => docs[id] }
}
