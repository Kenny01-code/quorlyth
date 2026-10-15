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
    async exportAll() {
      // Page the complete docs table; PostgreSQL row-level security limits this export
      // to records visible to the currently authenticated user.
      const pageSize = 500
      const records: { path: string; data: any; updatedAt?: string | null }[] = []
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await sb.from('docs').select('path,data,updated_at').order('path', { ascending: true }).range(offset, offset + pageSize - 1)
        if (error) throw error
        const page = (data || []) as { path: string; data: any; updated_at?: string | null }[]
        records.push(...page.map(row => ({ path: row.path, data: row.data, updatedAt: row.updated_at ?? null })))
        if (page.length < pageSize) break
      }
      return records
    },
    async get(path) {
      const { data, error } = await sb.from('docs').select('data').eq('path', path).maybeSingle()
      if (error) throw error
      return data?.data ?? null
    },
    async create(path, data) {
      // New records must use INSERT: upsert invokes ON CONFLICT UPDATE policies too.
      const { error } = await sb.from('docs').insert({ path, data })
      if (error) throw new Error(error.message || error.details || error.hint || 'Database rejected the write')
    },
    async set(path, data) {
      // Chat records are append-only. INSERT avoids Postgres requiring an UPDATE
      // policy for PostgREST upserts, while preserving upsert behavior for mutable docs.
      const collection = path.split('/')[0]
      const isAppendOnlyChatRecord = (collection === 'conversations' || collection === 'messages') && path.split('/').length === 2
      const { error } = isAppendOnlyChatRecord
        ? await sb.from('docs').insert({ path, data })
        : await sb.from('docs').upsert({ path, data })
      if (error) throw new Error(error.message || error.details || error.hint || 'Database rejected the write')
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
