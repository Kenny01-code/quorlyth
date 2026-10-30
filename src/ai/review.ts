import { App } from '../data/AppProvider'
import { Idea, YouTubeSocialSignals } from '../lib/types'
import { askJson } from './client'

const clamp = (v: any) => Math.max(0, Math.min(100, Math.round(+v || 0)))

export interface ReviewProgress {
  total: number
  completed: number
  totalBatches: number
  activeBatches: number
}

/** Scores ideas in bounded parallel batches and persists completed reviews as they finish. */
export async function reviewIdeas(a: App, ideas: Idea[], opts: { community?: string; signal?: AbortSignal; onProgress?: (progress: ReviewProgress) => void; forceYoutubeRefresh?: boolean } = {}) {
  const d = a.data
  const w = { o: d.settings?.wo ?? 40, f: d.settings?.wf ?? 25, r: d.settings?.wr ?? 35 }
  if (a.demo) {
    let done = 0
    const totalBatches = Math.max(1, Math.ceil(ideas.length / 10))
    for (const idea of ideas) {
      if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
      const hash = [...(idea.title + idea.body)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
      const o = 62 + hash % 34, f = 58 + (hash >>> 4) % 38, r = 60 + (hash >>> 9) % 36
      await a.saveReview(idea.id, { o, f, r, score: Math.round((o * w.o + f * w.f + r * w.r) / (w.o + w.f + w.r || 1)), reason: 'Demo score based on the sample idea and the space’s configured signal weights. In a live space, QuorlythBot would explain its assessment using the real idea context.', status: a.statusOf(idea.id) })
      done++
      opts.onProgress?.({ total: ideas.length, completed: done, totalBatches, activeBatches: done < ideas.length ? 1 : 0 })
    }
    return done
  }

  const batches: Idea[][] = []
  for (let k = 0; k < ideas.length; k += 10) batches.push(ideas.slice(k, k + 10))
  let done = 0
  let nextBatch = 0
  let activeBatches = 0
  let firstError: unknown = null
  const emitProgress = () => opts.onProgress?.({
    total: ideas.length,
    completed: done,
    totalBatches: batches.length,
    activeBatches,
  })
  emitProgress()

  async function processBatch(b: Idea[]) {
    if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
    const output = await askJson<{ reviews: any[]; youtubeSignalsByIdea?: Record<string, YouTubeSocialSignals> }>(
      "You review ideas from a creator's fan community. For each idea give originality, feasibility and audience relevance as whole numbers from 0 to 100, and a reason of one or two plain sentences naming what is strong or weak. Score originality, feasibility, and relevance only from the idea text/tags and supplied Quorlyth in-app data; YouTube signals must not change those numeric scores or the main reason. In a separate youtubeRationale field, you may cite at most one matching public video using its exact title, channel, publish date and individual public counts. Do not calculate averages, aggregate metrics across videos, or claim that YouTube counts establish Quorlyth community demand. Do not infer demand from missing signals. Reply with only JSON: {\"reviews\":[{\"id\":\"same id\",\"originality\":0,\"feasibility\":0,\"relevance\":0,\"reason\":\"text\",\"youtubeRationale\":\"text or empty\"}]}\\nCommunity: " + (opts.community || 'All communities') + "\\nIdeas: " + JSON.stringify(b.map(i => ({ id: i.id, title: i.title, details: (i.body || '').slice(0, 600), backers: a.votesOf(i.id), tags: i.tags || [] }))),
      {
        signal: opts.signal,
        youtubeIdeas: b.map(i => ({ id: i.id, title: i.title, body: (i.body || '').slice(0, 600), tags: i.tags || [] })),
        forceYoutubeRefresh: opts.forceYoutubeRefresh,
        tier: 'quick',
      },
    )
    if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')

    const byId = new Map<string, any>()
    for (const item of Array.isArray(output?.reviews) ? output.reviews : []) {
      if (item && typeof item.id === 'string' && b.some(idea => idea.id === item.id) && !byId.has(item.id)) byId.set(item.id, item)
    }
    const missing = b.filter(idea => {
      const item = byId.get(idea.id)
      return !item || ![item.originality, item.feasibility, item.relevance].every(value => Number.isFinite(Number(value)))
    })
    if (missing.length) {
      throw new Error('QuorlythBot returned incomplete review results for ' + missing.length + ' idea' + (missing.length === 1 ? '' : 's') + ' (' + missing.slice(0, 3).map(idea => idea.title).join(', ') + '). Completed batches were saved; retry to review the remaining ideas.')
    }

    const results = await Promise.all(b.map(async idea => {
      if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
      const item = byId.get(idea.id)
      const originality = clamp(item.originality), feasibility = clamp(item.feasibility), relevance = clamp(item.relevance)
      return a.saveReview(idea.id, {
        o: originality,
        f: feasibility,
        r: relevance,
        score: Math.round((originality * w.o + feasibility * w.f + relevance * w.r) / (w.o + w.f + w.r || 1)),
        reason: String(item.reason || '').slice(0, 400),
        youtubeRationale: String(item.youtubeRationale || '').slice(0, 600),
        youtubeSignals: output.youtubeSignalsByIdea?.[idea.id],
        status: a.statusOf(idea.id),
      })
    }))
    const failedIndex = results.findIndex(saved => !saved)
    if (failedIndex >= 0) throw new Error('Could not save the AI review for "' + b[failedIndex].title + '". Completed reviews were saved; please retry.')
  }

  // Two concurrent batches improve throughput without flooding the AI or YouTube APIs.
  const workers = Array.from({ length: Math.min(2, batches.length) }, async () => {
    while (!firstError && !opts.signal?.aborted) {
      const batchIndex = nextBatch++
      if (batchIndex >= batches.length) break
      const batch = batches[batchIndex]
      activeBatches++
      emitProgress()
      try {
        await processBatch(batch)
        done += batch.length
      } catch (error) {
        if (!firstError) firstError = error
      } finally {
        activeBatches--
        emitProgress()
      }
    }
  })
  await Promise.all(workers)
  if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
  if (firstError) throw firstError
  return done
}
