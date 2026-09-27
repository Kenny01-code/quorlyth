import { THEMES } from './robot3d'
export { THEMES }

export interface Voice { id: string; n: string; g: 'f' | 'm'; d: string; theme: string; ai: string }
// Each persona maps to a natural OpenAI voice.
export const VOICES: Voice[] = [
  { id: 'aria', n: 'Aria', g: 'f', d: 'Warm and clear', theme: 'rose', ai: 'coral' },
  { id: 'selene', n: 'Selene', g: 'f', d: 'Calm and elegant', theme: 'glacier', ai: 'sage' },
  { id: 'nova', n: 'Nova', g: 'f', d: 'Bright and lively', theme: 'amethyst', ai: 'shimmer' },
  { id: 'atlas', n: 'Atlas', g: 'm', d: 'Deep and steady', theme: 'onyx', ai: 'ash' },
  { id: 'orion', n: 'Orion', g: 'm', d: 'Smooth and confident', theme: 'champagne', ai: 'echo' },
  { id: 'leo', n: 'Leo', g: 'm', d: 'Friendly and relaxed', theme: 'emerald', ai: 'ballad' },
]

export interface BotSettings { tone: string; len: string; emo: boolean; about: string; voice: boolean; calm: boolean; robot: boolean; model: 'quick' | 'smart'; vid: string; theme: string }
export const BOT_DEFAULTS: BotSettings = { tone: 'warm', len: 'short', emo: false, about: '', voice: true, calm: false, robot: true, model: 'smart', vid: 'aria', theme: 'onyx' }

export const SKILLS: { id: string; n: string; icon: string; d: string; own: boolean }[] = [
  { id: 'brief', n: 'Community briefing', icon: 'insight', d: 'Themes, demand and next steps from your ideas.', own: true },
  { id: 'post', n: 'Draft a post', icon: 'promote', d: 'A short post for your best idea.', own: true },
  { id: 'review', n: 'Run AI review', icon: 'queue', d: 'Open the queue and score every idea.', own: true },
  { id: 'welcome', n: 'Welcome and guidelines', icon: 'community', d: 'Write them, then apply to a community.', own: true },
  { id: 'ideas', n: 'Discussion prompts', icon: 'idea', d: 'Fresh prompts to get members sharing.', own: true },
  { id: 'analytics', n: 'Explain my numbers', icon: 'rank', d: 'What your analytics mean.', own: true },
  { id: 'plan', n: 'Plan my week', icon: 'status', d: 'Five steps for what matters now.', own: true },
  { id: 'find', n: 'Find an idea', icon: 'search', d: 'Search ideas by meaning.', own: false },
  { id: 'improve', n: 'Improve my idea', icon: 'edit', d: 'A sharper title, text and tags.', own: false },
  { id: 'reply', n: 'Suggest a reply', icon: 'discuss', d: 'Thoughtful replies for the idea you are viewing.', own: false },
  { id: 'tour', n: 'Show me around', icon: 'audience', d: 'A guided tour with gestures.', own: false },
]

export const TOUR_OWNER: [string, string][] = [
  ['/dashboard', 'This is your dashboard. Counts, your top picks from the AI, and what is waiting for you.'],
  ['/communities', 'Communities live here. Create them, set who can post, and view each one the way members see it.'],
  ['/queue', 'The review queue. Ask me to score every idea, then select, hold or decline.'],
  ['/promote', 'Promote turns a selected idea into a post. I can draft it in the voice you choose, with hashtags and emojis.'],
  ['/analytics', 'Analytics, with settings and a live preview on every chart, and a PDF export.'],
  ['/settings', 'Settings hold your space details, AI weights, access requests and invites.'],
]
export const TOUR_MEMBER: [string, string][] = [
  ['/communities', 'Join a community and share an idea. Back the ones you love.'],
  ['/me', 'Your profile. Edit your photo, and share your QR code.'],
]
