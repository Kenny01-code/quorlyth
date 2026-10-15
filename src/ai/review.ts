import { App } from '../data/AppProvider'
import { Idea, YouTubeSocialSignals } from '../lib/types'
import { askJson } from './client'

const clamp = (v: any) => Math.max(0, Math.min(100, Math.round(+v || 0)))

/** Scores ideas for originality, feasibility and relevance and saves each review. Returns how many were reviewed. */
export async function reviewIdeas(a: App, ideas: Idea[], opts: { community?: string; signal?: AbortSignal; onProgress?: (s: string) => void } = {}) {
  const d = a.data
  const w = { o: d.settings?.wo ?? 40, f: d.settings?.wf ?? 25, r: d.settings?.wr ?? 35 }
  if (a.demo) {
    let done = 0
    for (const idea of ideas) {
      if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
      opts.onProgress?.(`Scoring sample ${done + 1} of ${ideas.length}...`)
      const hash = [...(idea.title + idea.body)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)
      const o = 62 + hash % 34, f = 58 + (hash >>> 4) % 38, r = 60 + (hash >>> 9) % 36
      await a.saveReview(idea.id, { o, f, r, score: Math.round((o * w.o + f * w.f + r * w.r) / (w.o + w.f + w.r || 1)), reason: 'Demo score based on the sample idea and the space’s configured signal weights. In a live space, QuorlythBot would explain its assessment using the real idea context.', status: a.statusOf(idea.id) })
      done++
      await new Promise(resolve => setTimeout(resolve, 120))
    }
    return done
  }
  let done = 0
  const batches: Idea[][] = []
  for (let k = 0; k < ideas.length; k += 10) batches.push(ideas.slice(k, k + 10))
  for (const b of batches) {
    if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
    opts.onProgress?.(`Reviewing ideas ${done + 1} to ${done + b.length} of ${ideas.length}...`)
    const o = await askJson<{ reviews: any[]; youtubeSignalsByIdea?: Record<string, YouTubeSocialSignals> }>(
      `You review ideas from a creator's fan community. For each idea give originality, feasibility and audience relevance as whole numbers from 0 to 100, and a reason of one or two plain sentences naming what is strong or weak. Judge only the text and supplied evidence; do not invent votes, members, activity or metrics. Score originality, feasibility, and relevance only from the idea text/tags and supplied Quorlyth in-app data; YouTube signals must not change those numeric scores or the main reason. In a separate youtubeRationale field, you may cite at most one matching public video using its exact title, channel, publish date and individual public counts. Do not calculate averages, aggregate metrics across videos, or claim that YouTube counts establish Quorlyth community demand. Do not infer demand from missing signals. Reply with only JSON: {"reviews":[{"id":"same id","originality":0,"feasibility":0,"relevance":0,"reason":"text","youtubeRationale":"text or empty"}]}\nCommunity: ${opts.community || 'All communities'}\nIdeas: ${JSON.stringify(b.map(i => ({ id: i.id, title: i.title, details: (i.body || '').slice(0, 600), backers: a.votesOf(i.id), tags: i.tags || [] })))}`,
      {
        signal: opts.signal,
        youtubeIdeas: b.map(i => ({ id: i.id, title: i.title, body: (i.body || '').slice(0, 600), tags: i.tags || [] })),
      },
    )
    if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
    const byId = new Map<string, any>()
    for (const x of Array.isArray(o?.reviews) ? o.reviews : []) {
      if (x && typeof x.id === 'string' && b.some(i => i.id === x.id) && !byId.has(x.id)) byId.set(x.id, x)
    }
    const missing = b.filter(i => {
      const x = byId.get(i.id)
      return !x || ![x.originality, x.feasibility, x.relevance].every(v => Number.isFinite(Number(v)))
    })
    if (missing.length) {
      throw new Error('QuorlythBot returned incomplete review results for ' + missing.length + ' idea' + (missing.length === 1 ? '' : 's') + ' (' + missing.slice(0, 3).map(i => i.title).join(', ') + '). Completed batches were saved; retry to review the remaining ideas.')
    }
    for (const idea of b) {
      if (opts.signal?.aborted) throw new DOMException('Review cancelled', 'AbortError')
      const x = byId.get(idea.id)
      const o1 = clamp(x.originality), f1 = clamp(x.feasibility), r1 = clamp(x.relevance)
      const saved = await a.saveReview(idea.id, { o: o1, f: f1, r: r1, score: Math.round((o1 * w.o + f1 * w.f + r1 * w.r) / (w.o + w.f + w.r || 1)), reason: String(x.reason || '').slice(0, 400), youtubeRationale: String(x.youtubeRationale || '').slice(0, 600), youtubeSignals: o.youtubeSignalsByIdea?.[idea.id], status: a.statusOf(idea.id) })
      if (!saved) throw new Error('Could not save the AI review for "' + idea.title + '". Completed reviews were saved; please retry.')
      done++
    }
  }
  return done
}
