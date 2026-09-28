import { DocStore, Doc, isDirectChild, deepMerge } from './docstore'

/**
 * Supabase implementation. One table, `docs(path text primary key, data jsonb)`.
 * See supabase/schema.sql for the table and the row level security rules.
 * Only loaded when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 */
export async function createSupabaseStore(url: string, key: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)

  const store: DocStore = {
    async get(path) {
      const { data, error } = await sb.from('docs').select('data').eq('path', path).maybeSingle()
      if (error) throw error
      return data?.data ?? null
    },
    async set(path, data) {
      const { error } = await sb.from('docs').upsert({ path, data })
      if (error) throw error
    },
    async update(path, patch) {
      const cur = await store.get(path)
      if (!cur) throw new Error('not_found')
      await store.set(path, deepMerge(cur, patch))
    },
    async delete(path) {
      const { error } = await sb.from('docs').delete().or(`path.eq.${path},path.like.${path}/%`)
      if (error) throw error
    },
    subscribe(collection, cb, onError) {
      let lastErrorMessage = ''
      const load = async () => {
        try {
          const { data, error } = await sb.from('docs').select('path,data').like('path', collection + '/%')
          if (error) throw error
          lastErrorMessage = ''
          const docs: Doc[] = (data || []).filter(r => isDirectChild(collection, r.path)).map(r => ({ id: r.path.slice(collection.length + 1), data: r.data }))
          cb(docs)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (message !== lastErrorMessage) onError?.(error)
          lastErrorMessage = message
        }
      }
      void load()
      const ch = sb.channel('docs:' + collection + ':' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, () => { void load() })
        .subscribe()
      return () => { sb.removeChannel(ch) }
    },
  }
  return { store, sb }
}
