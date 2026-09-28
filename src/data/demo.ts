import { Backend } from '../backend'
import { Doc, DocStore, deepMerge, isDirectChild } from './docstore'
import { Me } from '../lib/types'

export const DEMO_ME: Me = { id: 'demo-owner', name: 'Maya Chen', email: 'maya@demo.quorlyth.local' }

const people = [
  ['aria', 'Aria Brooks', '#b67562'], ['noah', 'Noah Williams', '#657f76'],
  ['imani', 'Imani Cole', '#9278a8'], ['leo', 'Leo Martin', '#bd9557'],
  ['sana', 'Sana Patel', '#63889b'], ['jules', 'Jules Rivera', '#a76577'],
  ['kai', 'Kai Thompson', '#7184ae'], ['nina', 'Nina Okafor', '#849861'],
]

function avatar(name: string, color: string) {
  const initials = name.split(' ').map(x => x[0]).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><circle cx="48" cy="36" r="18" fill="#f0d8ca"/><path d="M14 96c2-24 15-37 34-37s32 13 34 37" fill="#191817"/><text x="48" y="90" text-anchor="middle" font-family="Arial" font-size="12" fill="#fff">${initials}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const comms = [
  { id: 'fitness-form', name: 'Fitness & Form', purpose: 'Small, sustainable ways to feel stronger and move with more confidence.', icon: 'community', cover: 'a', vis: 'listed', post: 'anyone', at: Date.now() - 20 * 864e5 },
  { id: 'content-ideas', name: 'Content Ideas', purpose: 'Shape the next videos, series, and behind-the-scenes moments together.', icon: 'idea', cover: 'b', vis: 'listed', post: 'anyone', at: Date.now() - 16 * 864e5 },
  { id: 'collab-opportunities', name: 'Collab Opportunities', purpose: 'Find thoughtful partnerships, guest spots, and community projects.', icon: 'collab', cover: 'c', vis: 'listed', post: 'anyone', at: Date.now() - 11 * 864e5 },
]

const ideaSeed = [
  ['fitness-form', 'A 15-minute strength routine for busy mornings', 'Three moves, no equipment, and an easier way to keep a promise to yourself before the day gets loud.', 'aria', ['routine', 'beginner']],
  ['fitness-form', 'Form-check Friday with one movement each week', 'A short weekly breakdown of one common movement, with a beginner and advanced variation.', 'noah', ['form', 'weekly']],
  ['fitness-form', 'A community walking challenge with flexible goals', 'Let everyone choose a daily step goal and celebrate consistency instead of comparing totals.', 'imani', ['community', 'wellbeing']],
  ['fitness-form', 'Recovery sessions for people who sit all day', 'A ten-minute mobility reset focused on hips, shoulders, and wrists for desk-heavy days.', 'leo', ['mobility', 'recovery']],
  ['content-ideas', 'Let the audience choose the next series finale', 'Share three possible directions and let members vote before filming the final episode.', 'sana', ['series', 'poll']],
  ['content-ideas', 'A monthly behind-the-scenes voice note', 'A candid audio update about what worked, what did not, and what the community helped shape.', 'jules', ['behind-the-scenes', 'audio']],
  ['content-ideas', 'Revisit an old popular video with today’s perspective', 'Pick a well-loved early video and add what has changed since then, including lessons learned.', 'kai', ['throwback', 'learning']],
  ['content-ideas', 'One fan question becomes a full tutorial', 'Collect questions for a week, then build one practical tutorial around the clearest recurring need.', 'nina', ['tutorial', 'audience']],
  ['collab-opportunities', 'A creator swap with complementary audiences', 'Trade a short guest segment with a creator in an adjacent niche and give both communities a useful takeaway.', 'aria', ['guest', 'creator']],
  ['collab-opportunities', 'A small local meetup hosted by community members', 'Start with one low-cost meetup in a city where several members already live, then share the format.', 'noah', ['meetup', 'local']],
  ['collab-opportunities', 'A shared resource list built by specialists', 'Invite members with different skills to contribute one trusted tool or tip to a living community guide.', 'imani', ['resources', 'community']],
  ['collab-opportunities', 'A limited creator Q&A with a partner expert', 'Host a focused live conversation with an expert and collect questions from members in advance.', 'leo', ['expert', 'live']],
]

const explanations = [
  'It is specific enough to test quickly and gives people a clear reason to participate. Start with one community and learn from completion, not just sign-ups.',
  'The format feels familiar, but the recurring member input makes it more participatory. Keep production light so it can continue beyond the first week.',
  'This matches a visible community need and can be delivered with modest resources. Define one useful outcome before expanding the scope.',
  'The idea has strong audience fit and a clear contributor role. A small pilot will reveal whether the collaboration is genuinely useful to both sides.',
]

export function createDemoBackend(): Backend {
  const docs: Record<string, any> = {}
  const subs = new Map<string, Set<(docs: Doc[]) => void>>()
  const emit = (path: string) => {
    for (const [collection, callbacks] of subs) if (path === collection || isDirectChild(collection, path)) {
      const rows = Object.keys(docs).filter(k => isDirectChild(collection, k)).map(id => ({ id: id.slice(collection.length + 1), data: docs[id] }))
      callbacks.forEach(cb => cb(rows))
    }
  }
  const store: DocStore = {
    async get(path) { return docs[path] ?? null },
    async set(path, data) { docs[path] = JSON.parse(JSON.stringify(data)); emit(path) },
    async update(path, patch) { if (!docs[path]) throw new Error('not_found'); docs[path] = deepMerge(docs[path], patch); emit(path) },
    async delete(path) { Object.keys(docs).filter(k => k === path || k.startsWith(path + '/')).forEach(k => delete docs[k]); emit(path) },
    subscribe(collection, cb) {
      const callbacks = subs.get(collection) || new Set()
      callbacks.add(cb); subs.set(collection, callbacks)
      cb(Object.keys(docs).filter(k => isDirectChild(collection, k)).map(id => ({ id: id.slice(collection.length + 1), data: docs[id] })))
      return () => { callbacks.delete(cb); if (!callbacks.size) subs.delete(collection) }
    },
  }

  comms.forEach(c => { const { id, ...data } = c; docs[`communities/${id}`] = data })
  docs['settings/space'] = { name: 'Maya Chen', tag: 'A space built with the community', wo: 40, wf: 25, wr: 35, appr: false }
  docs['config/owner'] = { id: DEMO_ME.id }
  people.forEach(([id, name, color]) => {
    docs[`profiles/${id}`] = { name, head: 'Community member', bio: 'Here to share useful ideas and build things together.', photo: avatar(name, color), at: Date.now() }
    docs[`members/${id}`] = { c: { 'fitness-form': true, 'content-ideas': true, 'collab-opportunities': true } }
  })
  const reasons = [...explanations]
  ideaSeed.forEach(([cid, title, body, person, tags], index) => {
    const id = `demo-idea-${index + 1}`
    docs[`ideas/${id}`] = { cid, title, body, authorId: person, tags, at: Date.now() - (index + 1) * 864e5 }
    const o = [88, 74, 82, 67, 91, 79, 72, 86, 84, 76, 89, 80][index]
    const f = [82, 91, 78, 84, 69, 93, 88, 86, 75, 72, 81, 77][index]
    const r = [92, 86, 87, 82, 90, 84, 77, 94, 86, 81, 89, 85][index]
    const score = Math.round(o * .4 + f * .25 + r * .35)
    const status = index === 8 ? 'selected' : index === 9 ? 'held' : 'review'
    docs[`reviews/${id}`] = { o, f, r, score, reason: reasons[index % reasons.length], status, at: Date.now() - index * 180000 }
    const memberId = people[(index + 2) % people.length][0]
    docs[`votes/${memberId}`] = { ideas: { ...(docs[`votes/${memberId}`]?.ideas || {}), [id]: true } }
  })
  return {
    store,
    auth: {
      mode: 'local', async current() { return DEMO_ME }, onChange() { return () => {} },
      async signInGoogle() {}, async signInEmail() {}, async signUpEmail() { return {} },
      async resetPassword() {}, async updatePassword() {}, async signOut() {},
    },
  }
}
