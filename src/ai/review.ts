import { App } from '../data/AppProvider'
import { Idea } from '../lib/types'
import { askJson } from './client'

const clamp = (v: any) => Math.max(0, Math.min(100, Math.round(+v || 0)))

/** Scores ideas for originality, feasibility and relevance and saves each review. Returns how many were reviewed. */
export async function reviewIdeas(a: App, ideas: Idea[], opts: { community?: string; signal?: AbortSignal; onProgress?: (s: string) => void } = {}) {
  const d = a.data
  const w = { o: d.settings?.wo ?? 40, f: d.settings?.wf ?? 25, r: d.settings?.wr ?? 35 }
  let done = 0
  const batches: Idea[][] = []
  for (let k = 0; k < ideas.length; k += 10) batches.push(ideas.slice(k, k + 10))
  for (const b of batches.slice(0, 3)) {
    opts.onProgress?.(`Reviewing ideas ${done + 1} to ${done + b.length} of ${ideas.length}...`)
    const o = await askJson<{ reviews: any[] }>(
      `You review ideas from a creator's fan community. For each idea give originality, feasibility and audience relevance as whole numbers from 0 to 100, and a reason of one or two plain sentences naming what is strong or weak. Judge only the text given and be honest, do not inflate scores. Reply with only JSON: {"reviews":[{"id":"same id","originality":0,"feasibility":0,"relevance":0,"reason":"text"}]}\nCommunity: ${opts.community || 'All communities'}\nIdeas: ${JSON.stringify(b.map(i => ({ id: i.id, title: i.title, details: (i.body || '').slice(0, 600), backers: a.votesOf(i.id), tags: i.tags || [] })))}`,
      { signal: opts.signal },
    )
    for (const x of o.reviews || []) {
      if (!b.some(i => i.id === x.id)) continue
      const o1 = clamp(x.originality), f1 = clamp(x.feasibility), r1 = clamp(x.relevance)
      await a.saveReview(x.id, { o: o1, f: f1, r: r1, score: Math.round((o1 * w.o + f1 * w.f + r1 * w.r) / (w.o + w.f + w.r || 1)), reason: String(x.reason || '').slice(0, 400), status: a.statusOf(x.id) })
      done++
    }
  }
  return done
}
