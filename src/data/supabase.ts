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
    async listCommunityMembers(cid) {
      const { data, error } = await sb.rpc('list_community_member_ids', { p_cid: cid })
      if (error) throw new Error(error.message || 'Could not load community members')
      return (data || []).map((row: { user_id: string }) => row.user_id)
    },
    async listCommunityContributors(cid) {
      const { data, error } = await sb.rpc('list_community_contributors', { p_cid: cid })
      if (error) throw new Error(error.message || 'Could not load community contributors')
      return (data || []).map((row: { user_id: string; ideas_count: number | string; backings_count: number | string }) => ({
        userId: row.user_id,
        ideas: Number(row.ideas_count) || 0,
        backings: Number(row.backings_count) || 0,
      }))
    },
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
      let retryAttempt = 0
      let retryTimer: ReturnType<typeof setTimeout> | undefined
      let stopped = false
      const retryDelays = [1500, 3000, 7000, 15000, 30000]

      const reportError = (error: unknown) => {
        const detail = error as { message?: string; code?: string; cause?: unknown } | null
        const message = detail?.message || String(error)
        const scopedError = Object.assign(new Error(`[shared data: ${collection}] ${message}`), {
          collection,
          code: detail?.code,
          cause: error,
        })
        if (message !== lastErrorMessage) onError?.(scopedError)
        lastErrorMessage = message
      }

      const scheduleRetry = () => {
        if (stopped || retryTimer || retryAttempt >= retryDelays.length) return
        const delay = retryDelays[retryAttempt++]
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          void load()
        }, delay)
      }

      const load = async () => {
        if (stopped) return
        try {
          // Exclude deeper descendants on the server rather than downloading all
          // nested comments/children and discarding them in the browser.
          const { data, error } = await sb.from('docs')
            .select('path,data')
            .like('path', collection + '/%')
            .not('path', 'like', collection + '/%/%')
          if (error) {
            reportError(error)
            scheduleRetry()
            return
          }

          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = undefined
          retryAttempt = 0
          lastErrorMessage = ''
          const docs: Doc[] = (data || [])
            .filter(r => isDirectChild(collection, r.path))
            .map(r => ({ id: r.path.slice(collection.length + 1), data: r.data }))
          cb(docs)
        } catch (error) {
          reportError(error)
          scheduleRetry()
        }
      }

      void load()
      const ch = sb.channel('docs:' + collection + ':' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, payload => {
          // The shared docs table backs many collections. Ignore unrelated row
          // changes so one write does not trigger a reload for every subscription.
          const newPath = (payload.new as { path?: string } | null)?.path
          const oldPath = (payload.old as { path?: string } | null)?.path
          if ((newPath && isDirectChild(collection, newPath)) || (oldPath && isDirectChild(collection, oldPath))) {
            void load()
          }
        })
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reportError(error || new Error(`Realtime subscription status: ${status}`))
            scheduleRetry()
          }
        })

      return () => {
        stopped = true
        if (retryTimer) clearTimeout(retryTimer)
        sb.removeChannel(ch)
      }
    },
  }
  return { store, sb }
}
