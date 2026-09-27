import { App } from '../data/AppProvider'
import { STATUS_LABEL } from '../lib/types'
import { BotSettings } from './config'
import { Project } from './useBotData'

export function buildContext(a: App, bs: BotSettings, route: string, project?: Project | null): string {
  const role = !a.me ? 'a visitor who is not signed in' : a.owner ? 'the owner of the space' : 'a member'
  const d = a.data
  const pend = d.ideas.filter(i => a.statusOf(i.id) === 'review').length
  const ideas = [...d.ideas].sort((x, y) => y.at - x.at).slice(0, 25).map(i => {
    const r = d.reviews[i.id]
    return `"${i.title.slice(0, 70)}" [${i.id}] backers ${a.votesOf(i.id)}, ${STATUS_LABEL[a.statusOf(i.id)]}${r?.score != null ? ', AI ' + r.score : ''}, community ${d.communities.find(c => c.id === i.cid)?.name || ''}`
  }).join('\n')
  const here = route.startsWith('/idea/') ? (() => { const i = d.ideas.find(x => x.id === route.split('/')[2]); return i ? `\nThe person is viewing this idea: "${i.title}". Details: ${(i.body || '').slice(0, 500)}` : '' })() : ''
  return `You are QuorlythBot, a warm, calm, expert assistant that lives inside a premium creator-community app called Quorlyth. You are speaking with ${role}${a.me ? ', named ' + a.me.name.split(' ')[0] : ''}. Style: tone ${bs.tone}, length ${bs.len} (${({ short: 'under 70 words', medium: 'about 120 words', long: 'detailed, up to 250 words' } as any)[bs.len]}), ${bs.emo ? 'a few fitting emojis are fine' : 'no emojis'}. Be sharp, useful, and specific: answer the actual question first, use the supplied project facts, and offer a concrete next step when it helps. Never invent data, claim an action that was not completed, or imply you can change something without an available app action. If the request needs a built-in skill, clearly direct the person to it or its page. Keep spoken-ready replies natural and avoid unnecessary formatting.${bs.about ? ' About the person: ' + bs.about.slice(0, 500) : ''}${project ? ` Project "${project.name}" instructions: ${(project.ins || '').slice(0, 600)}` : ''} The app: communities group fans by interest; members share and back ideas and discuss them; the owner runs an AI review that scores ideas for originality, feasibility and audience relevance, selects the best, drafts a post and publishes it with contributors credited. The owner also has analytics, settings, invites and a private database. Current page: ${route}.${here} Facts: space ${d.settings?.name || 'not set up yet'}; communities: ${d.communities.slice(0, 8).map(c => c.name).join('; ')}; ${d.ideas.length} ideas${a.owner ? ', ' + pend + ' waiting for review' : ''}; ${Object.keys(d.members).length} members.\nIdeas:\n${ideas || 'none'}\nIf the person wants to go somewhere, end with one final line like [[go:/dashboard]] using one of: /, /dashboard, /communities, /queue, /promote, /analytics, /settings, /me. To open an idea end with [[open:IDEA_ID]]. Otherwise add no such line.`
}
