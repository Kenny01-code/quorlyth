export type Status = 'review' | 'selected' | 'held' | 'declined' | 'promoted'
export const STATUS_LABEL: Record<Status, string> = { review: 'In review', selected: 'Selected', held: 'Held', declined: 'Declined', promoted: 'Promoted' }
export interface Me { id: string; name: string; email?: string; avatarUrl?: string }
export interface Community { id: string; name: string; purpose?: string; icon?: string; cover?: string; vis?: 'listed' | 'unlisted'; post?: 'anyone' | 'members' | 'owner'; welcome?: string; rules?: string; arch?: boolean; pinned?: string; at: number }
export interface Idea { id: string; title: string; body?: string; cid: string; authorId: string; tags?: string[]; at: number }
export interface Comment { id: string; authorId: string; text: string; at: number }
export interface Review { id: string; o?: number; f?: number; r?: number; score?: number; reason?: string; status?: Status; at?: number }
export interface Promotion { id: string; ideaId: string; text: string; credits: string[]; by: string; at: number }
export interface Profile { id: string; name?: string; head?: string; bio?: string; photo?: string; at?: number }
export interface Request { id: string; platforms?: string[]; aud?: string; note?: string; at: number }
export interface Decision { id: string; status: 'approved' | 'declined'; at: number }
export interface SpaceSettings { name?: string; tag?: string; appr?: boolean; ann?: string; wo?: number; wf?: number; wr?: number }
export interface ChatMsg { r: 'u' | 'a'; t: string; btns?: { a: string; id?: string; l: string }[] }
export interface Chat { id: string; title: string; pj?: string; at: number; upd: number; pin?: boolean; color?: string; arch?: boolean; unread?: boolean; msgs: ChatMsg[] }
