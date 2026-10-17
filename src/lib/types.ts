export type Status = 'review' | 'selected' | 'held' | 'declined' | 'promoted'
export const STATUS_LABEL: Record<Status, string> = { review: 'In review', selected: 'Selected', held: 'Held', declined: 'Declined', promoted: 'Ready to share' }
export interface Me { id: string; name: string; email?: string; avatarUrl?: string }
export interface Community { id: string; name: string; ownerId?: string; createdBy?: string; purpose?: string; icon?: string; cover?: string; vis?: 'listed' | 'unlisted'; post?: 'anyone' | 'members' | 'owner'; joinApproval?: boolean; welcome?: string; rules?: string; arch?: boolean; pinned?: string; memberBadges?: Record<string, string>; at: number }
export interface Idea { id: string; title: string; body?: string; cid: string; authorId: string; tags?: string[]; at: number }
export interface Comment { id: string; authorId: string; text: string; at: number; parentId?: string; mentionedUserIds?: string[] }
export type YouTubeSignalStatus = 'available' | 'partial' | 'no_results' | 'not_configured' | 'quota_exceeded' | 'budget_limited' | 'unavailable' | 'invalid_query'
export interface YouTubeVideoSignal {
  videoId: string
  title: string
  channelTitle: string
  publishedAt: string | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  url: string
}
export interface YouTubeSocialSignals {
  ideaId?: string
  status: YouTubeSignalStatus
  message: string
  query: string
  fetchedAt: number
  expiresAt: number
  videos: YouTubeVideoSignal[]
}
export interface Review { id: string; o?: number; f?: number; r?: number; score?: number; reason?: string; youtubeRationale?: string; youtubeSignals?: YouTubeSocialSignals; status?: Status; at?: number }
export interface Promotion { id: string; ideaId: string; text: string; credits: string[]; by: string; at: number }
export interface Profile { id: string; name?: string; head?: string; bio?: string; photo?: string; authName?: string; authAvatarUrl?: string; at?: number }
export interface Request { id: string; platforms?: string[]; aud?: string; note?: string; at: number }
export interface CommunityJoinRequest { id: string; cid: string; userId: string; message?: string; status: 'pending' | 'approved' | 'declined'; at: number; reviewedAt?: number; reviewedBy?: string }
export interface Decision { id: string; status: 'approved' | 'declined'; at: number }
export type VolunteerStatus = 'pending' | 'accepted' | 'declined'
export interface VolunteerApplication { id: string; ideaId: string; applicantId: string; message?: string; status: VolunteerStatus; at: number; reviewedAt?: number; reviewedBy?: string }
export interface Project { id: string; ideaId: string; summary: string; status: 'active' | 'completed'; createdBy: string; at: number; updatedAt?: number; dueAt?: number | null }
export type MilestonePriority = 'low' | 'normal' | 'high' | 'critical'
export interface Milestone { id: string; projectId: string; title: string; description?: string; status: 'todo' | 'in_progress' | 'done'; createdBy: string; at: number; updatedAt?: number; priority?: MilestonePriority; dueAt?: number | null; assigneeId?: string | null; acceptanceCriteria?: string; blocked?: boolean; blockedNote?: string }
export type MilestoneDetails = Partial<Pick<Milestone, 'priority' | 'dueAt' | 'assigneeId' | 'acceptanceCriteria' | 'blocked' | 'blockedNote'>>
export type MilestonePatch = Partial<Pick<Milestone, 'title' | 'description' | 'status' | 'priority' | 'dueAt' | 'assigneeId' | 'acceptanceCriteria' | 'blocked' | 'blockedNote'>>
export interface SpaceSettings { name?: string; tag?: string; appr?: boolean; ann?: string; wo?: number; wf?: number; wr?: number }
export interface ChatMsg { r: 'u' | 'a'; t: string; btns?: { a: string; id?: string; l: string }[] }
export interface Chat { id: string; title: string; pj?: string; at: number; upd: number; pin?: boolean; color?: string; arch?: boolean; unread?: boolean; msgs: ChatMsg[] }

export interface WorkAttachment {
  path: string
  name: string
  mimeType: string
  size: number
  uploadedAt: number
}
export type WorkSubmissionStatus = 'submitted' | 'approved' | 'changes_requested'
export interface WorkSubmission {
  id: string
  ideaId: string
  projectId: string
  milestoneId: string
  submittedBy: string
  revision: number
  summary: string
  attachments: WorkAttachment[]
  status: WorkSubmissionStatus
  submittedAt: number
  updatedAt: number
  reviewedAt?: number
  reviewedBy?: string
  reviewNote?: string
}
