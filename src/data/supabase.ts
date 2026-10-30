import { DocStore, Doc, GrowthEvent, SelfTrackedGrowthEventName, isDirectChild, deepMerge } from './docstore'
import { nextRetryAttempt, retryDelayForAttempt } from './retry-policy.js'

/**
 * Supabase implementation. One table, `docs(path text primary key, data jsonb)`.
 * See supabase/schema.sql for the table and the row level security rules.
 * Only loaded when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 */
export async function createSupabaseStore(url: string, key: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)

  // Fan out the single docs-table change stream to interested collections. One
  // channel per collection scales poorly because every docs write reaches every
  // channel and can trigger a burst of redundant SELECTs.
  const realtimeListeners = new Map<symbol, {
    collection: string
    refresh: () => void
    onRealtimeError: (status: string, error: unknown) => void
  }>()
  let sharedDocsChannel: ReturnType<typeof sb.channel> | null = null

  const ensureSharedDocsChannel = () => {
    if (sharedDocsChannel) return
    sharedDocsChannel = sb.channel('docs:shared:' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, payload => {
        const newPath = (payload.new as { path?: unknown } | null)?.path
        const oldPath = (payload.old as { path?: unknown } | null)?.path
        const changedPaths = [newPath, oldPath].filter((path): path is string => typeof path === 'string')
        for (const listener of realtimeListeners.values()) {
          // Some DELETE payloads may contain only the primary key; if a future
          // payload omits it entirely, refresh safely rather than miss an update.
          if (!changedPaths.length || changedPaths.some(path => isDirectChild(listener.collection, path))) {
            listener.refresh()
          }
        }
      })
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          // Reconcile every live collection after initial connection and after any
          // Realtime reconnect, so a missed event during a network gap cannot leave
          // the UI stale until an unrelated future write.
          for (const listener of realtimeListeners.values()) listener.refresh()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          for (const listener of realtimeListeners.values()) listener.onRealtimeError(status, error)
        }
      })
  }

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
    async listGrowthEvents() {
      // Page the ledger so the dashboard keeps working beyond PostgREST's row cap.
      // The table's RLS policy is the authority: non-platform admins receive no rows.
      const pageSize = 500
      const records: GrowthEvent[] = []
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await sb
          .from('growth_events')
          .select('id,user_id,actor_id,event_name,event_key,occurred_at')
          .order('occurred_at', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (error) throw new Error(error.message || 'Could not load platform growth events')
        const page = (data || []) as GrowthEvent[]
        records.push(...page)
        if (page.length < pageSize) break
        if (records.length >= 20000) break
      }
      return records
    },
    async trackGrowthEvent(eventName: SelfTrackedGrowthEventName, eventKey = '') {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError || !authData.user) throw new Error('Sign in before recording account activity.')
      const userId = authData.user.id
      const { error } = await sb.from('growth_events').insert({
        user_id: userId,
        actor_id: userId,
        event_name: eventName,
        event_key: eventKey.slice(0, 256),
      })
      // Event keys are idempotent by design. A repeat visit or retry is not a failure.
      if (error && error.code !== '23505') throw new Error(error.message || 'Could not record account activity')
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
      const next = deepMerge(cur, patch)
      const isRootWorkSubmission = path.startsWith('workSubmissions/') && !path.slice('workSubmissions/'.length).includes('/')
      const isRootProject = path.startsWith('projects/') && !path.slice('projects/'.length).includes('/')
      if (isRootWorkSubmission || isRootProject) {
        // These records have narrow UPDATE permissions. Upsert also evaluates
        // INSERT RLS on conflict, which would wrongly deny AI organizers who can
        // update an existing project brief but cannot create the project itself.
        const { data, error } = await sb.from('docs').update({ data: next }).eq('path', path).select('path').maybeSingle()
        if (error) throw new Error(error.message || error.details || error.hint || 'Database rejected the update')
        if (!data) {
          throw new Error(isRootProject
            ? 'Project update permission denied or this project is no longer available.'
            : 'Review permission denied or this submission is no longer pending.')
        }
        return
      }
      await store.set(path, next)
    },
    async delete(path) {
      const { error } = await sb.from('docs').delete().or(`path.eq.${path},path.like.${path}/%`)
      if (error) throw error
    },
    subscribe(collection, cb, onError) {
      let lastErrorMessage = ''
      let retryAttempt = 0
      let retryTimer: ReturnType<typeof setTimeout> | undefined
      let refreshTimer: ReturnType<typeof setTimeout> | undefined
      let loadSequence = 0
      let stopped = false

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
        if (stopped || retryTimer) return
        // Keep recovering from transient Supabase/network failures for the entire
        // lifetime of the subscription. A finite retry list could leave a tab stale
        // forever after a prolonged outage, even after the network recovered.
        const delay = retryDelayForAttempt(retryAttempt)
        retryAttempt = nextRetryAttempt(retryAttempt)
        retryTimer = setTimeout(() => {
          retryTimer = undefined
          void load()
        }, delay)
      }

      const load = async () => {
        if (stopped) return
        // Realtime events can trigger overlapping reads. Only the newest read is
        // allowed to publish its snapshot, otherwise a slow older SELECT can roll
        // the UI back after a newer update has already arrived.
        const sequence = ++loadSequence
        try {
          // Exclude deeper descendants on the server rather than downloading all
          // nested comments/children and discarding them in the browser.
          const { data, error } = await sb.from('docs')
            .select('path,data')
            .like('path', collection + '/%')
            .not('path', 'like', collection + '/%/%')
          if (stopped || sequence !== loadSequence) return
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
          if (stopped || sequence !== loadSequence) return
          reportError(error)
          scheduleRetry()
        }
      }

      const queueRefresh = () => {
        if (stopped) return
        if (refreshTimer) clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined
          void load()
        }, 35)
      }

      const token = Symbol(collection)
      realtimeListeners.set(token, {
        collection,
        refresh: queueRefresh,
        onRealtimeError: (status, error) => {
          reportError(error || new Error(`Realtime subscription status: ${status}`))
          scheduleRetry()
        },
      })
      ensureSharedDocsChannel()
      void load()

      return () => {
        stopped = true
        loadSequence += 1
        if (retryTimer) clearTimeout(retryTimer)
        if (refreshTimer) clearTimeout(refreshTimer)
        realtimeListeners.delete(token)
        if (realtimeListeners.size === 0 && sharedDocsChannel) {
          const channel = sharedDocsChannel
          sharedDocsChannel = null
          void sb.removeChannel(channel)
        }
      }
    },
  }
  return { store, sb }
}
