import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Av } from './ui'
import { QuorlythGlyph } from './QuorlythGlyph'
import { useApp } from '../data/AppProvider'
import { Idea, Milestone, WorkAttachment, WorkSubmission } from '../lib/types'
import { userFacingMutationError } from '../lib/userFacingErrors'
import { EvidencePreview } from './EvidencePreview'

const MAX_ATTACHMENTS = 8
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const MAX_LOCAL_BYTES = 256 * 1024
const MAX_LOCAL_TOTAL_BYTES = 700 * 1024

function fileSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
function dateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function statusLabel(status: WorkSubmission['status']) {
  if (status === 'approved') return 'Approved'
  if (status === 'changes_requested') return 'Changes requested'
  return 'Awaiting review'
}
function attachmentAcceptsImage(mimeType: string) { return mimeType.startsWith('image/') }

function AttachmentLink({ attachment, removable, onRemove }: {
  attachment: WorkAttachment
  removable?: boolean
  onRemove?: () => void
}) {
  const a = useApp()
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    let active = true
    setUrl('')
    setFailed(false)
    if (!a.backend?.getWorkFileUrl) {
      setFailed(true)
      return () => { active = false }
    }
    setOpening(true)
    void a.backend.getWorkFileUrl(attachment.path).then(value => {
      if (active) setUrl(value)
    }).catch(() => {
      if (active) setFailed(true)
    }).finally(() => {
      if (active) setOpening(false)
    })
    return () => { active = false }
  }, [a.backend, attachment.path])

  return <>
    <div className="q-work-file">
      <span className="q-work-file__symbol" aria-hidden="true">
        {attachmentAcceptsImage(attachment.mimeType) && url
          ? <img src={url} alt="" />
          : <QuorlythGlyph name={attachmentAcceptsImage(attachment.mimeType) ? 'camera' : 'file'} size={19} />}
      </span>
      <span className="q-work-file__meta">
        <strong title={attachment.name}>{attachment.name}</strong>
        <small>{fileSize(attachment.size)} · {attachment.mimeType || 'File'}</small>
      </span>
      {url ? <span className="q-work-file__opening">In-app preview ready</span>
        : <span className="q-work-file__opening">{opening ? 'Loading…' : failed ? 'Unavailable' : ''}</span>}
      {removable && onRemove && <button type="button" className="q-work-file__remove" onClick={onRemove} aria-label={'Remove ' + attachment.name} title="Remove attachment"><QuorlythGlyph name="close" size={15} /></button>}
    </div>
    {url && <EvidencePreview url={url} name={attachment.name} mimeType={attachment.mimeType} compact />}
  </>
}

export function MilestoneWorkPanel({ idea, milestone, submissions, canManage, canCollaborate, projectActive }: {
  idea: Idea
  milestone: Milestone
  submissions: WorkSubmission[]
  canManage: boolean
  /** Access to submit/start work; false for read-only audiences or a closed project. */
  canCollaborate: boolean
  projectActive: boolean
}) {
  const a = useApp()
  const [summary, setSummary] = useState('')
  const [attested, setAttested] = useState(false)
  const [attachments, setAttachments] = useState<WorkAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadLabel, setUploadLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busyReviewId, setBusyReviewId] = useState('')
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const mine = useMemo(() => submissions
    .filter(item => item.submittedBy === a.me?.id)
    .sort((first, second) => second.revision - first.revision || second.submittedAt - first.submittedAt)[0],
  [submissions, a.me?.id])
  const pendingReviewCount = submissions.filter(item => item.status === 'submitted').length
  const assignedIds = [...new Set([...(Array.isArray(milestone.assigneeIds) ? milestone.assigneeIds : []), ...(milestone.assigneeId ? [milestone.assigneeId] : [])])]
  const assignedElsewhere = assignedIds.length > 0 && !assignedIds.includes(a.me?.id || '')
  const blocked = !!milestone.blocked && milestone.status !== 'done'
  const uploadAvailable = typeof a.backend?.uploadWorkFile === 'function' && typeof a.backend?.deleteWorkFile === 'function'
  const maximumSize = a.backend?.auth.mode === 'local' ? MAX_LOCAL_BYTES : MAX_UPLOAD_BYTES
  // Managers can contribute real work too. The provider forbids them from approving their own submissions.
  const canSubmit = canCollaborate && !assignedElsewhere && milestone.status !== 'done' && !blocked && mine?.status !== 'submitted'
  const canStart = canCollaborate && !assignedElsewhere && milestone.status === 'todo' && !blocked
  const acceptedTypes = 'image/*,video/*,audio/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip'
  const displayedSubmissions = [...submissions].sort((first, second) => second.submittedAt - first.submittedAt || second.revision - first.revision)

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list)
    if (!files.length) return
    if (!uploadAvailable) {
      a.toast('File uploads are not available in this session. Sign in to your configured workspace.')
      return
    }
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      a.toast('Attach up to 8 files to a submission.')
      return
    }
    const tooLarge = files.find(file => file.size > maximumSize)
    if (tooLarge) {
      a.toast('“' + tooLarge.name + '” is too large. The limit is ' + fileSize(maximumSize) + ' per file.')
      return
    }
    if (a.backend?.auth.mode === 'local'
      && attachments.reduce((sum, item) => sum + item.size, 0) + files.reduce((sum, item) => sum + item.size, 0) > MAX_LOCAL_TOTAL_BYTES) {
      a.toast('Local mode has a 700 KB total attachment limit to protect browser storage. Configure Supabase for larger files.')
      return
    }
    setUploading(true)
    const uploaded: WorkAttachment[] = []
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        setUploadLabel('Uploading ' + (index + 1) + ' of ' + files.length)
        try {
          const path = await a.backend!.uploadWorkFile!(idea.id, milestone.id, file)
          uploaded.push({
            path,
            name: file.name.slice(0, 180),
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
            uploadedAt: Date.now(),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed.'
          a.toast(file.name + ': ' + message.slice(0, 120))
        }
      }
      if (uploaded.length) setAttachments(current => [...current, ...uploaded])
    } finally {
      setUploading(false)
      setUploadLabel('')
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.currentTarget.files
    if (files) await addFiles(files)
  }

  async function removeAttachment(attachment: WorkAttachment) {
    if (uploading || submitting) return
    try {
      await a.backend?.deleteWorkFile?.(attachment.path)
      setAttachments(current => current.filter(item => item.path !== attachment.path))
    } catch (error) {
      a.toast(error instanceof Error ? error.message : 'Could not remove this attachment.')
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    if (canSubmit && event.dataTransfer.files.length) void addFiles(event.dataTransfer.files)
  }

  async function startWork() {
    if (!canStart) return
    setSubmitting(true)
    try {
      const started = await a.updateMilestone(milestone.id, { status: 'in_progress' })
      if (started) a.toast('Work started. Do the actual work in your tools, then attach a real deliverable here and submit it for review.')
    } catch {
      a.toast('Could not start this milestone. Refresh the project and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    if (!attested) {
      a.toast('Confirm that the summary and evidence reflect work you actually completed.')
      return
    }
    setSubmitting(true)
    try {
      const ok = await a.submitMilestoneWork(milestone.id, summary, attachments)
      if (ok) {
        setSummary('')
        setAttested(false)
        setAttachments([])
      }
    } catch (error) {
      a.toast(userFacingMutationError(error, 'submit this milestone for review'))
    } finally {
      setSubmitting(false)
    }
  }

  async function review(submission: WorkSubmission, status: 'approved' | 'changes_requested') {
    const note = (reviewNotes[submission.id] || '').trim()
    if (status === 'changes_requested' && note.length < 4) {
      a.toast('Explain what needs to change so the contributor has a clear next step.')
      return
    }
    if (busyReviewId) return
    setBusyReviewId(submission.id)
    try {
      const ok = await a.reviewMilestoneWork(submission.id, status, note)
      if (ok) setReviewNotes(current => ({ ...current, [submission.id]: '' }))
    } catch (error) {
      a.toast(userFacingMutationError(error, status === 'approved' ? 'approve this submission' : 'request changes to this submission'))
    } finally {
      setBusyReviewId('')
    }
  }

  return (
    <section className="q-work-panel" aria-label={'Work and submissions for ' + milestone.title}>
      <div className="q-work-panel__header">
        <span className="q-work-panel__mark"><QuorlythGlyph name="upload" size={19} /></span>
        <div className="q-work-panel__heading">
          <p className="ql-eyebrow">DELIVERABLE & REVIEW</p>
          <h5>Work submissions</h5>
          <p>{submissions.length ? submissions.length + ' version' + (submissions.length === 1 ? '' : 's') + ' · ' + pendingReviewCount + ' awaiting review' : 'Attach the work, explain what changed, and submit it for approval.'}</p>
        </div>
        {canManage && pendingReviewCount > 0 && <span className="q-work-panel__count">{pendingReviewCount} to review</span>}
      </div>

      {mine?.status === 'changes_requested' && (
        <div className="q-work-feedback is-changes">
          <QuorlythGlyph name="alert" size={17} />
          <div><strong>Changes requested on revision {mine.revision}</strong><p>{mine.reviewNote || 'Review the milestone requirements and submit an updated version.'}</p></div>
        </div>
      )}
      {mine?.status === 'approved' && (
        <div className="q-work-feedback is-approved">
          <QuorlythGlyph name="complete" size={17} />
          <div><strong>Your work was approved</strong><p>{mine.reviewNote || 'The project manager approved this milestone deliverable.'}</p></div>
        </div>
      )}

      {canSubmit && (
        <div className="q-work-composer">
          <div className="q-work-composer__title">
            <div><h6>{mine?.status === 'changes_requested' ? 'Submit a revised deliverable' : milestone.status === 'in_progress' ? 'Submit completed work' : 'Start with your deliverable'}</h6><p>{canManage ? 'You can submit your own work too; another authorized manager must review it.' : assignedIds.length ? (assignedIds.includes(a.me?.id || '') ? (assignedIds.length > 1 ? 'Assigned to you and selected teammates' : 'Assigned to you') : 'Assigned to other team members') : 'This milestone is unassigned; any accepted team member can contribute.'}</p></div>
            {canStart && <button type="button" className="q-work-quiet-btn" disabled={submitting} onClick={() => void startWork()}><QuorlythGlyph name="start" size={14} />Start work</button>}
          </div>
          <div className="q-work-steps" aria-label="Real work submission steps">
            <div><span>01</span><section><strong>Do the actual work</strong><p>Build, design, write, research or test in your real tools. “Start work” records progress; it does not create a fake deliverable.</p></section></div>
            <div><span>02</span><section><strong>Attach proof</strong><p>Upload the real screenshot, document, demo or other evidence that demonstrates what changed.</p></section></div>
            <div><span>03</span><section><strong>Submit for review</strong><p>An authorized reviewer checks the evidence. Only an approved submission completes the milestone.</p></section></div>
          </div>
          <form className="q-work-form" onSubmit={submitWork}>
            <label className="q-work-label" htmlFor={'q-work-summary-' + milestone.id}>What did you complete?</label>
            <textarea id={'q-work-summary-' + milestone.id} className="q-work-summary" value={summary} onChange={event => setSummary(event.target.value)} maxLength={6000} minLength={8} required placeholder="Summarize what you built, changed, tested, or delivered. Mention anything the reviewer should know." />
            {milestone.acceptanceCriteria && <p className="q-work-hint"><QuorlythGlyph name="check" size={14} />Use the milestone's definition of done as your checklist before submitting.</p>}

            <input ref={fileInput} className="q-work-file-input" type="file" multiple accept={acceptedTypes} onChange={event => void handleFileChange(event)} aria-label="Choose files, images, documents or media" />
            <div className={'q-work-dropzone' + (dragging ? ' is-dragging' : '') + (uploading ? ' is-uploading' : '')}
              onDragEnter={event => { event.preventDefault(); if (canSubmit) setDragging(true) }}
              onDragOver={event => event.preventDefault()}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
              onDrop={handleDrop}>
              <span className="q-work-dropzone__icon"><QuorlythGlyph name="upload" size={24} /></span>
              <div className="q-work-dropzone__copy">
                <strong>{uploading ? uploadLabel || 'Uploading files…' : 'Add files, images or documents'}</strong>
                <small>Required: at least 1 evidence file · Up to 8 files · {fileSize(maximumSize)} per file · Private to this collaboration</small>
              </div>
              <button type="button" className="q-work-upload-btn" disabled={uploading || submitting || !uploadAvailable || attachments.length >= MAX_ATTACHMENTS} onClick={() => fileInput.current?.click()}>
                <QuorlythGlyph name="paperclip" size={16} />Choose files
              </button>
            </div>

            {attachments.length > 0 && <div className="q-work-staged" aria-label="Attachments to submit">
              <div className="q-work-staged__heading"><strong>{attachments.length} attachment{attachments.length === 1 ? '' : 's'} added</strong><small>Files will be included with this revision.</small></div>
              {attachments.map(attachment => <AttachmentLink key={attachment.path} attachment={attachment} removable onRemove={() => void removeAttachment(attachment)} />)}
            </div>}

            <label className="q-work-attestation" htmlFor={'q-work-attestation-' + milestone.id}>
              <input
                id={'q-work-attestation-' + milestone.id}
                type="checkbox"
                checked={attested}
                onChange={event => setAttested(event.target.checked)}
                disabled={submitting || uploading}
                aria-describedby={'q-work-attestation-help-' + milestone.id}
              />
              <span className="q-work-attestation__copy">
                <strong>I confirm this is work I actually completed.</strong>
                <small id={'q-work-attestation-help-' + milestone.id}>My summary and evidence accurately represent the deliverable I worked on. Submitting does not mean it is approved; an authorized reviewer must check it.</small>
              </span>
            </label>

            <div className="q-work-submit-row">
              <span className="q-work-hint">{attachments.length ? 'Your evidence is saved with this revision. The milestone completes only after an authorized reviewer approves it.' : 'Attach at least one screenshot, document, demo recording, or other deliverable. A progress note alone cannot complete this milestone.'}</span>
              <button className="q-work-submit-btn" disabled={submitting || uploading || !attested || summary.trim().length < 8 || attachments.length === 0} title={!attested ? 'Confirm your summary and evidence reflect work you actually completed' : attachments.length ? 'Submit evidence for review' : 'Attach at least one evidence file to submit'}>
                <QuorlythGlyph name="send" size={15} />{submitting ? 'Submitting…' : mine?.status === 'changes_requested' ? 'Submit revision' : 'Submit for review'}
              </button>
            </div>
          </form>
        </div>
      )}

      {assignedElsewhere && <div className="q-work-readonly"><QuorlythGlyph name="lock" size={16} /><span>This milestone is assigned to <strong>{assignedIds.map(id => a.nm(id)).join(', ')}</strong>. Only the listed assignees can start the work and submit evidence for review. Ask the project manager to add you to the assignees if you need to contribute.</span></div>}
      {blocked && <div className="q-work-readonly"><QuorlythGlyph name="blocked" size={16} /><span>Work submission is paused until the project manager clears this blocker.</span></div>}
      {mine?.status === 'submitted' && <div className="q-work-readonly"><QuorlythGlyph name="progress" size={16} /><span>Your latest revision was submitted on {dateTime(mine.submittedAt)} and is waiting for review. An authorized reviewer must approve it; you cannot approve your own submission.</span></div>}
      {!canCollaborate && !canManage && <p className="q-work-muted">You can read work updates shared by the collaboration team, but only team members can submit files.</p>}

      {canManage && !projectActive && pendingReviewCount > 0 && <div className="q-work-readonly"><QuorlythGlyph name="lock" size={16} /><span>This project is closed. Reopen it before reviewing the pending submissions.</span></div>}

      {displayedSubmissions.length > 0 && (
        <div className="q-work-history">
          <div className="q-work-history__title"><h6>Submission history</h6><span>{displayedSubmissions.length} total</span></div>
          {displayedSubmissions.map(submission => (
            <article className="q-work-submission" key={submission.id}>
              <div className="q-work-submission__top">
                <Av id={submission.submittedBy} size={31} />
                <div className="q-work-submission__by"><strong>{a.nm(submission.submittedBy)}</strong><small>Revision {submission.revision} · {dateTime(submission.submittedAt)}</small></div>
                <span className={'q-work-status is-' + submission.status}>{statusLabel(submission.status)}</span>
              </div>
              <p className="q-work-submission__summary">{submission.summary}</p>
              {submission.attachments.length > 0 && <div className="q-work-submission__files">{submission.attachments.map(attachment => <AttachmentLink key={attachment.path} attachment={attachment} />)}</div>}
              {submission.reviewNote && <div className={'q-work-feedback ' + (submission.status === 'changes_requested' ? 'is-changes' : 'is-approved')}><QuorlythGlyph name={submission.status === 'changes_requested' ? 'alert' : 'complete'} size={16} /><div><strong>{submission.status === 'changes_requested' ? 'Changes requested' : 'Review note'}</strong><p>{submission.reviewNote}</p>{submission.reviewedAt ? <small>Reviewed {dateTime(submission.reviewedAt)}{submission.reviewedBy ? ' by ' + a.nm(submission.reviewedBy) : ''}</small> : null}</div></div>}
              {canManage && projectActive && submission.status === 'submitted' && submission.submittedBy === a.me?.id && (
                <p className="q-work-hint">This is your submission. A different authorized manager must review it; you cannot approve your own work.</p>
              )}
              {canManage && projectActive && submission.status === 'submitted' && submission.submittedBy !== a.me?.id && (
                <div className="q-work-review">
                  <label className="q-work-label" htmlFor={'q-work-review-' + submission.id}>Feedback for contributor <small>Optional for approval; required for requested changes.</small></label>
                  <textarea id={'q-work-review-' + submission.id} className="q-work-review__textarea" value={reviewNotes[submission.id] || ''} onChange={event => setReviewNotes(current => ({ ...current, [submission.id]: event.target.value }))} maxLength={1600} placeholder="What is good, or what still needs to change?" />
                  <div className="q-work-review__actions">
                    <button type="button" className="q-work-request-btn" disabled={!!busyReviewId} onClick={() => void review(submission, 'changes_requested')}><QuorlythGlyph name="rotate" size={14} />{busyReviewId === submission.id ? 'Saving review…' : 'Request changes'}</button>
                    <button type="button" className="q-work-approve-btn" disabled={!!busyReviewId} onClick={() => void review(submission, 'approved')}><QuorlythGlyph name="complete" size={14} />{busyReviewId === submission.id ? 'Saving review…' : 'Approve & complete milestone'}</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
