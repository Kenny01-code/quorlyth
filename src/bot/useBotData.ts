import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../data/AppProvider'
import { Chat } from '../lib/types'
import { BOT_DEFAULTS, BotSettings } from './config'

export interface Project { id: string; name: string; ins?: string; cid?: string; at: number }
export interface LibItem { id: string; title: string; text: string; at: number }

/** Everything the bot remembers about you, stored privately under data/users/<you>. */
export function useBotData() {
  const { backend, me } = useApp()
  const [docs, setDocs] = useState<Record<string, any>>({})
  const docsRef = useRef(docs)
  docsRef.current = docs

  useEffect(() => {
    if (!backend || !me) {
      docsRef.current = {}
      setDocs({})
      return
    }
    return backend.store.subscribe('data/users/' + me.id, snapshot => {
      const next = Object.fromEntries(snapshot.map(x => [x.id, x.data]))
      docsRef.current = next
      setDocs(next)
    }, () => {
      // The subscription implementation owns retries. Keep the most recent local
      // snapshot visible if a transient notification/reconnect error occurs.
    })
  }, [backend, me?.id])

  const base = 'data/users/' + (me?.id || '')
  const settings: BotSettings = { ...BOT_DEFAULTS, ...(docs.botset || {}) }
  const chats: Chat[] = Object.keys(docs).filter(k => k.startsWith('c_')).map(k => ({ id: k, ...docs[k] })).sort((a, b) => (Number(!!b.pin) - Number(!!a.pin)) || (b.upd || 0) - (a.upd || 0))
  const projects: Project[] = Object.keys(docs).filter(k => k.startsWith('p_')).map(k => ({ id: k, ...docs[k] })).sort((a, b) => (b.at || 0) - (a.at || 0))
  const library: LibItem[] = Object.keys(docs).filter(k => k.startsWith('l_')).map(k => ({ id: k, ...docs[k] })).sort((a, b) => (b.at || 0) - (a.at || 0))

  const put = useCallback((id: string, data: any) => {
    const previous = docsRef.current[id]
    const optimistic = { ...docsRef.current, [id]: data }
    docsRef.current = optimistic
    setDocs(optimistic)
    const { id: _i, ...rest } = data
    if (!backend) return Promise.resolve(false)
    let serialized: string
    try { serialized = JSON.stringify(rest) } catch {
      docsRef.current = { ...docsRef.current, ...(previous === undefined ? {} : { [id]: previous }) }
      if (previous === undefined) delete docsRef.current[id]
      setDocs(docsRef.current)
      return Promise.resolve(false)
    }
    return backend.store.set(`${base}/${id}`, JSON.parse(serialized)).then(() => true).catch(() => {
      setDocs(current => {
        if (current[id] !== data) return current
        const next = { ...current }
        if (previous === undefined) delete next[id]
        else next[id] = previous
        docsRef.current = next
        return next
      })
      return false
    })
  }, [backend, base])

  const remove = useCallback((id: string) => {
    const previous = docsRef.current[id]
    const optimistic = { ...docsRef.current }
    delete optimistic[id]
    docsRef.current = optimistic
    setDocs(optimistic)
    if (!backend) return Promise.resolve(false)
    return backend.store.delete(`${base}/${id}`).then(() => true).catch(() => {
      setDocs(current => {
        if (current[id] !== undefined) return current
        const next = previous === undefined ? current : { ...current, [id]: previous }
        docsRef.current = next
        return next
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
