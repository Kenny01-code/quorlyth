import { useNavigate } from 'react-router-dom'
import { Av } from './ui'
import { QuorlythGlyph } from './QuorlythGlyph'
import { ChatAttachment, ChatAttachmentList } from './ChatMedia'
import { when } from '../lib/util'
import '../styles/discussion-thread.css'

export type DiscussionEntry = {
  id: string
  authorId: string
  text: string
  at: number
  parentId?: string | null
  attachments?: ChatAttachment[]
  mentionedUserIds?: string[]
  mentionedEveryone?: boolean
}

export function DiscussionThread<T extends DiscussionEntry>({ comments, authorName, onReply, emptyText = 'No discussion yet.' }: {
  comments: T[]
  authorName: (userId: string) => string
  onReply?: (commentId: string) => void
  emptyText?: string
}) {
  const nav = useNavigate()
  const roots = comments.filter(comment => !comment.parentId || !comments.some(parent => parent.id === comment.parentId))

  const renderEntry = (comment: T, depth = 0): React.ReactNode => {
    const replies = comments.filter(item => item.parentId === comment.id)
    const name = authorName(comment.authorId) || 'Quorlyth member'
    return (
      <article key={comment.id} className="qth-discussion-entry" style={{ marginLeft: depth ? Math.min(depth, 4) * 14 : 0, paddingLeft: depth ? 12 : 0, borderLeft: depth ? '1px solid var(--line, rgba(255,255,255,.13))' : undefined }}>
        <div className="qth-discussion-entry__row">
          <Av id={comment.authorId} size={30} />
          <div className="qth-discussion-entry__content">
            <div className="qth-discussion-entry__meta">
              <button type="button" className="lk idea-discussion-author" onClick={() => nav('/me/' + comment.authorId)}>{name}</button>
              <span className="dim">{when(comment.at)}</span>
              {comment.parentId ? <span className="qth-discussion-entry__reply-label">Reply</span> : null}
            </div>
            <p className="q-writeup qth-discussion-entry__text">{comment.text}</p>
            {comment.attachments?.length ? <ChatAttachmentList attachments={comment.attachments} /> : null}
            {!!comment.mentionedUserIds?.length && <p className="qth-discussion-entry__mentions">Tagged: {comment.mentionedEveryone ? '@everyone' : comment.mentionedUserIds.map(userId => authorName(userId)).join(', ')}</p>}
            {onReply && <button type="button" className="chip qth-discussion-reply" onClick={() => onReply(comment.id)}><QuorlythGlyph name="message" size={13} />Reply</button>}
          </div>
        </div>
        {replies.map(reply => renderEntry(reply, depth + 1))}
      </article>
    )
  }

  return (
    <div className="qth-discussion-thread" aria-label="Discussion messages">
      {roots.length ? roots.map(comment => renderEntry(comment)) : <div className="qth-discussion-empty"><QuorlythGlyph name="message" size={20} /><span>{emptyText}</span></div>}
    </div>
  )
}
