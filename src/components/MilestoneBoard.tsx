import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Av } from './ui'
import { QuorlythGlyph } from './QuorlythGlyph'
import { useApp } from '../data/AppProvider'
import { Idea, Milestone, MilestonePriority } from '../lib/types'
import { MilestoneWorkPanel } from './MilestoneWorkPanel'
import { isPastDateChange, minimumDateInput, PAST_DATE_MESSAGE } from '../lib/workspaceDates'

type FilterKey = 'all' | 'open' | 'mine' | 'overdue' | 'blocked'
type MilestoneDraft = {
  title: string
  description: string
  acceptanceCriteria: string
  dueDate: string
  assigneeIds: string[]
  priority: MilestonePriority
  blocked: boolean
  blockedNote: string
}

const PRIORITY_WEIGHT: Record<MilestonePriority, number> = { critical: 0, high: 1, normal: 2, low: 3 }
const PRIORITY_LABEL: Record<MilestonePriority, string> = { critical: 'Critical', high: 'High', normal: 'Standard', low: 'Low' }
const STATUS_LABEL: Record<Milestone['status'], string> = { todo: 'Queued', in_progress: 'In progress', done: 'Completed' }
const FILTERS: { value: FilterKey; label: string; glyph: 'workspace' | 'progress' | 'person' | 'due' | 'blocked' }[] = [
  { value: 'all', label: 'All milestones', glyph: 'workspace' },
  { value: 'open', label: 'Open', glyph: 'progress' },
  { value: 'mine', label: 'Assigned to me', glyph: 'person' },
  { value: 'overdue', label: 'Overdue', glyph: 'due' },
  { value: 'blocked', label: 'Blocked', glyph: 'blocked' },
]
const blankDraft = (): MilestoneDraft => ({
  title: '', description: '', acceptanceCriteria: '', dueDate: '', assigneeIds: [],
  priority: 'normal', blocked: false, blockedNote: '',
})
const asDateInput = (timestamp?: number | null) => {
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}
const dateEnd = (value: string): number | null => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 23, 59, 59, 999)
  return Number.isFinite(date.getTime()) ? date.getTime() : null
}
const dateLabel = (timestamp?: number | null) => timestamp
  ? new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : ''
const isOverdue = (milestone: Milestone) => !!milestone.dueAt && milestone.status !== 'done' && milestone.dueAt < Date.now()

const getMilestoneAssigneeIds = (milestone: Pick<Milestone, 'assigneeId' | 'assigneeIds'>): string[] =>
  [...new Set([...(Array.isArray(milestone.assigneeIds) ? milestone.assigneeIds : []), ...(milestone.assigneeId ? [milestone.assigneeId] : [])].filter(Boolean))]

export function MilestoneBoard({ idea, projectId, projectStatus, milestones, teamMemberIds, canCollaborate, canManage, createMilestoneRequest }: {
  idea: Idea
  projectId: string
  projectStatus: 'active' | 'completed'
  milestones: Milestone[]
  teamMemberIds: string[]
  canCollaborate: boolean
  canManage: boolean
  createMilestoneRequest?: number
}) {
  const a = useApp()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MilestoneDraft>(blankDraft)
  const [busyId, setBusyId] = useState('')
  const active = projectStatus === 'active'
  const canEdit = canManage && active
  useEffect(() => {
    if (!createMilestoneRequest || createMilestoneRequest < 1 || !canEdit) return
    setEditingId(null)
    setDraft(blankDraft())
    setComposerOpen(true)
  }, [createMilestoneRequest, canEdit])
  const completed = milestones.filter(item => item.status === 'done').length
  const blocked = milestones.filter(item => item.blocked && item.status !== 'done').length
  const overdue = milestones.filter(isOverdue).length
  const open = milestones.length - completed

  // Match the assignment picker to the same collaboration members accepted by the data layer.
  const people = useMemo(() => [...new Set(teamMemberIds)]
    .filter(id => !!id)
    .map(id => ({ id, name: a.nm(id) || (id === a.me?.id ? 'You' : 'Team member') }))
    .sort((x, y) => x.name.localeCompare(y.name)), [teamMemberIds, a.nm, a.me?.id])

  const visibleMilestones = useMemo(() => milestones
    .filter(item => {
      if (filter === 'open') return item.status !== 'done'
      if (filter === 'mine') return !!a.me?.id && getMilestoneAssigneeIds(item).includes(a.me.id)
      if (filter === 'overdue') return isOverdue(item)
      if (filter === 'blocked') return !!item.blocked && item.status !== 'done'
      return true
    })
    .sort((first, second) => {
      const firstDue = first.dueAt || Number.MAX_SAFE_INTEGER
      const secondDue = second.dueAt || Number.MAX_SAFE_INTEGER
      return Number(second.blocked && second.status !== 'done') - Number(first.blocked && first.status !== 'done')
        || Number(isOverdue(second)) - Number(isOverdue(first))
        || firstDue - secondDue
        || PRIORITY_WEIGHT[first.priority || 'normal'] - PRIORITY_WEIGHT[second.priority || 'normal']
        || first.at - second.at
    }), [milestones, filter, a.me?.id])

  function beginCreate() {
    setEditingId(null)
    setDraft(blankDraft())
    setComposerOpen(true)
  }

  function beginEdit(milestone: Milestone) {
    setEditingId(milestone.id)
    setDraft({
      title: milestone.title || '',
      description: milestone.description || '',
      acceptanceCriteria: milestone.acceptanceCriteria || '',
      dueDate: asDateInput(milestone.dueAt),
      assigneeIds: getMilestoneAssigneeIds(milestone),
      priority: milestone.priority || 'normal',
      blocked: !!milestone.blocked,
      blockedNote: milestone.blockedNote || '',
    })
    setComposerOpen(true)
  }

  function closeComposer() {
    setComposerOpen(false)
    setEditingId(null)
    setDraft(blankDraft())
  }

  async function saveMilestone(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim()) return a.toast('Give this milestone a clear outcome.')
    const existingDueDate = editingId ? asDateInput(milestones.find(item => item.id === editingId)?.dueAt) : ''
    if (isPastDateChange(draft.dueDate, existingDueDate)) return a.toast(PAST_DATE_MESSAGE)
    setBusyId(editingId || 'new')
    const details = {
      priority: draft.priority,
      dueAt: dateEnd(draft.dueDate),
      assigneeIds: draft.assigneeIds,
      assigneeId: draft.assigneeIds[0] || null,
      acceptanceCriteria: draft.acceptanceCriteria.trim(),
      blocked: draft.blocked,
      blockedNote: draft.blockedNote.trim(),
    }
    const ok = editingId
      ? await a.updateMilestone(editingId, {
          title: draft.title.trim(),
          description: draft.description.trim(),
          ...details,
        })
      : await a.addMilestone(projectId, draft.title.trim(), draft.description.trim(), details)
    setBusyId('')
    if (ok) closeComposer()
  }

  async function changeStatus(milestone: Milestone, status: Milestone['status']) {
    setBusyId(milestone.id)
    await a.updateMilestone(milestone.id, { status })
    setBusyId('')
  }

  async function changeAssignees(milestone: Milestone, assigneeIds: string[]) {
    if (!canEdit || milestone.status === 'done') return
    const nextIds = [...new Set(assigneeIds)]
    const currentIds = getMilestoneAssigneeIds(milestone)
    if (currentIds.length === nextIds.length && currentIds.every(id => nextIds.includes(id))) return
    if (nextIds.some(id => !people.some(person => person.id === id))) return a.toast('Only current project team members can be assigned.')
    setBusyId(milestone.id)
    await a.updateMilestone(milestone.id, { assigneeIds: nextIds, assigneeId: nextIds[0] || null })
    setBusyId('')
  }

  function toggleDraftAssignee(assigneeId: string, checked: boolean) {
    if (checked && !people.some(person => person.id === assigneeId)) return
    setDraft(current => ({
      ...current,
      assigneeIds: checked
        ? [...new Set([...current.assigneeIds, assigneeId])]
        : current.assigneeIds.filter(id => id !== assigneeId),
    }))
  }

  async function toggleBlocked(milestone: Milestone) {
    setBusyId(milestone.id)
    await a.updateMilestone(milestone.id, {
      blocked: !milestone.blocked,
      ...(milestone.blocked ? { blockedNote: '' } : {}),
    })
    setBusyId('')
  }

  async function removeMilestone(milestone: Milestone) {
    if (!canManage || busyId === milestone.id) return
    const submissions = a.data.workSubmissions.filter(item => item.milestoneId === milestone.id)
    const attachmentCount = submissions.reduce((count, item) => count + (item.attachments?.length || 0), 0)
    const evidenceNote = submissions.length
      ? ` This also removes ${submissions.length} work submission${submissions.length === 1 ? '' : 's'} and ${attachmentCount} attached private file${attachmentCount === 1 ? '' : 's'}.`
      : ''
    if (!window.confirm(`Delete "${milestone.title}" permanently?${evidenceNote} This cannot be undone.`)) return
    setBusyId(milestone.id)
    const deleted = await a.deleteMilestone(milestone.id)
    setBusyId('')
    if (deleted && editingId === milestone.id) closeComposer()
  }

  return (
    <section className="ql-milestone-board" aria-label="Milestone board">
      <div className="ql-milestone-overview">
        <div className="ql-milestone-overview__lead">
          <span className="ql-section-mark"><QuorlythGlyph name="milestone" size={21} /></span>
          <div><p className="ql-eyebrow">Execution map</p><h3>Milestones</h3><p className="ql-muted">{completed} of {milestones.length} outcomes delivered</p></div>
        </div>
        <div className="ql-milestone-metrics">
          <div><span>Open</span><strong>{open}</strong></div>
          <div><span>Overdue</span><strong className={overdue ? 'is-alert' : ''}>{overdue}</strong></div>
          <div><span>Blocked</span><strong className={blocked ? 'is-alert' : ''}>{blocked}</strong></div>
        </div>
      </div>

      <div className="ql-milestone-toolbar">
        <div className="ql-milestone-filters" role="group" aria-label="Filter milestones">
          {FILTERS.map(item => <button type="button" key={item.value} className={'ql-filter' + (filter === item.value ? ' is-active' : '')} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}><QuorlythGlyph name={item.glyph} size={14} />{item.label}{item.value === 'overdue' && overdue ? <span>{overdue}</span> : null}</button>)}
        </div>
        {canEdit && <button type="button" className="ql-primary-action" onClick={beginCreate}><QuorlythGlyph name="add" size={17} />New milestone</button>}
      </div>

      {composerOpen && canEdit && <form id="ql-milestone-editor" className="ql-milestone-editor" onSubmit={saveMilestone}>
        <div className="ql-milestone-editor__head">
          <div><p className="ql-eyebrow">{editingId ? 'Refine the plan' : 'Define the next outcome'}</p><h4>{editingId ? 'Edit milestone' : 'Create milestone'}</h4></div>
          <button type="button" className="ql-quiet-action" onClick={closeComposer}>Close</button>
        </div>
        <label className="ql-field"><span>Milestone name</span><input value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} maxLength={120} required placeholder="e.g. Ship the first working prototype" /></label>
        <label className="ql-field"><span>Work notes <small>Optional</small></span><textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} maxLength={2000} rows={3} placeholder="Scope, hand-offs, dependencies or implementation notes…" /></label>
        <div className="ql-field-grid">
          <label className="ql-field"><span>Priority</span><select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as MilestonePriority }))}><option value="low">Low</option><option value="normal">Standard</option><option value="high">High</option><option value="critical">Critical</option></select></label>
          <label className="ql-field"><span>Due date</span><input type="date" min={minimumDateInput(editingId ? asDateInput(milestones.find(item => item.id === editingId)?.dueAt) : '')} value={draft.dueDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))} /></label>
          <div className="ql-field ql-assignee-picker">
            <span>Assign to everyone you select</span>
            <div className="ql-assignee-picker__actions">
              <button type="button" className="ql-quiet-action" onClick={() => setDraft(current => ({ ...current, assigneeIds: people.map(person => person.id) }))}>Select everyone ({people.length})</button>
              <button type="button" className="ql-quiet-action" onClick={() => setDraft(current => ({ ...current, assigneeIds: [] }))}>Clear selection</button>
            </div>
            <div className="ql-assignee-picker__list">
              {[
                ...people,
                ...draft.assigneeIds.filter(id => !people.some(person => person.id === id)).map(id => ({ id, name: a.nm(id) || 'Former team member' })),
              ].map(person => {
                const eligible = people.some(candidate => candidate.id === person.id)
                return <label className="ql-assignee-option" key={person.id}>
                  <input type="checkbox" checked={draft.assigneeIds.includes(person.id)} disabled={!eligible && !draft.assigneeIds.includes(person.id)} onChange={event => toggleDraftAssignee(person.id, event.target.checked)} />
                  <span>{person.name}{person.id === a.me?.id ? ' (you)' : ''}{!eligible && <small> · no longer eligible</small>}</span>
                </label>
              })}
            </div>
            <small className="ql-muted">{draft.assigneeIds.length} selected · select everyone to assign this milestone to the whole collaboration team.</small>
          </div>
        </div>
        <label className="ql-field"><span>Acceptance criteria <small>How the team knows it is done</small></span><textarea value={draft.acceptanceCriteria} onChange={event => setDraft(current => ({ ...current, acceptanceCriteria: event.target.value }))} rows={2} maxLength={800} placeholder="A reviewer can sign in, complete the flow, and see a persisted result…" /></label>
        {editingId && <div className="ql-blocker-editor">
          <label className="ql-check-field"><input type="checkbox" checked={draft.blocked} onChange={event => setDraft(current => ({ ...current, blocked: event.target.checked }))} /><span><strong>Mark as blocked</strong><small>Flag a dependency or issue that is preventing progress.</small></span></label>
          {draft.blocked && <label className="ql-field"><span>Blocker note</span><textarea value={draft.blockedNote} onChange={event => setDraft(current => ({ ...current, blockedNote: event.target.value }))} maxLength={500} rows={2} placeholder="What is blocking this outcome, and what will unblock it?" /></label>}
        </div>}
        <div className="ql-milestone-editor__footer"><span className="ql-muted">Changes sync to the shared workspace.</span><div><button type="button" className="ql-quiet-action" onClick={closeComposer}>Cancel</button><button className="ql-primary-action" disabled={!!busyId}>{busyId ? 'Saving…' : editingId ? 'Save milestone' : 'Create milestone'}</button></div></div>
      </form>}

      {visibleMilestones.length ? <div className="ql-milestone-timeline">
        {visibleMilestones.map((milestone, index) => {
          const milestoneOverdue = isOverdue(milestone)
          const priority = milestone.priority || 'normal'
          return <article key={milestone.id} className={'ql-milestone-card' + (milestone.blocked && milestone.status !== 'done' ? ' is-blocked' : '') + (milestoneOverdue ? ' is-overdue' : '')}>
            <div className="ql-milestone-marker"><span><QuorlythGlyph name={milestone.status === 'done' ? 'complete' : milestone.blocked ? 'blocked' : milestone.status === 'in_progress' ? 'progress' : 'checkpoint'} size={18} /></span>{index < visibleMilestones.length - 1 && <i />}</div>
            <div className="ql-milestone-card__body">
              <div className="ql-milestone-card__top">
                <div className="ql-milestone-card__title"><p className="ql-eyebrow">Outcome {String(index + 1).padStart(2, '0')}</p><h4>{milestone.title}</h4></div>
                <span className={'ql-status-chip status-' + milestone.status}><QuorlythGlyph name={milestone.status === 'done' ? 'complete' : milestone.status === 'in_progress' ? 'progress' : 'checkpoint'} size={13} />{STATUS_LABEL[milestone.status]}</span>
              </div>
              {milestone.description && <p className="ql-milestone-description">{milestone.description}</p>}
              <div className="ql-milestone-tags">
                <span className={'ql-priority-chip priority-' + priority}><QuorlythGlyph name="priority" size={13} />{PRIORITY_LABEL[priority]}</span>
                {milestone.dueAt ? <span className={'ql-meta-chip' + (milestoneOverdue ? ' is-alert' : '')}><QuorlythGlyph name="due" size={13} />{milestoneOverdue ? 'Overdue · ' : 'Due · '}{dateLabel(milestone.dueAt)}</span> : <span className="ql-meta-chip"><QuorlythGlyph name="calendar" size={13} />No due date</span>}
                {(() => {
                  const assignedIds = getMilestoneAssigneeIds(milestone)
                  const assignedNames = assignedIds.map(id => a.nm(id) || 'Team member')
                  return <span className="ql-assignee-chip" title={assignedNames.join(', ')}>
                    <QuorlythGlyph name="team" size={14} />
                    <span>{assignedIds.length ? assignedIds.length + ' assigned · ' + assignedNames.join(', ') : 'Unassigned'}</span>
                  </span>
                })()}
              </div>
              {canEdit && milestone.status !== 'done' && <details className="ql-milestone-reassign">
                <summary>{'Assign to teammates · ' + (getMilestoneAssigneeIds(milestone).length || 'none') + ' selected'}</summary>
                <div className="ql-assignee-picker__actions">
                  <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => void changeAssignees(milestone, people.map(person => person.id))}>Select everyone</button>
                  <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => void changeAssignees(milestone, [])}>Clear</button>
                </div>
                <div className="ql-assignee-picker__list">
                  {[
                    ...people,
                    ...getMilestoneAssigneeIds(milestone).filter(id => !people.some(person => person.id === id)).map(id => ({ id, name: a.nm(id) || 'Former team member' })),
                  ].map(person => {
                    const assignedIds = getMilestoneAssigneeIds(milestone)
                    const checked = assignedIds.includes(person.id)
                    const eligible = people.some(candidate => candidate.id === person.id)
                    return <label className="ql-assignee-option" key={person.id}>
                      <input type="checkbox" checked={checked} disabled={busyId === milestone.id || (!eligible && !checked)} onChange={event => {
                        const next = event.target.checked ? [...assignedIds, person.id] : assignedIds.filter(id => id !== person.id)
                        void changeAssignees(milestone, next)
                      }} />
                      <span>{person.name}{person.id === a.me?.id ? ' (you)' : ''}{!eligible && <small> · no longer eligible</small>}</span>
                    </label>
                  })}
                </div>
              </details>}
              {milestone.acceptanceCriteria && <div className="ql-acceptance"><QuorlythGlyph name="document" size={15} /><div><strong>Definition of done</strong><p>{milestone.acceptanceCriteria}</p></div></div>}
              {milestone.blocked && milestone.status !== 'done' && <div className="ql-blocker-note"><QuorlythGlyph name="blocked" size={16} /><div><strong>Blocked</strong><p>{milestone.blockedNote || 'Waiting on a dependency or decision.'}</p></div></div>}
              {(canEdit || canManage) && <div className="ql-milestone-actions">
                {canEdit && <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => beginEdit(milestone)}><QuorlythGlyph name="plan" size={14} />Edit details</button>}
                {canEdit && !milestone.blocked && milestone.status !== 'done' && <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => void toggleBlocked(milestone)}><QuorlythGlyph name="blocked" size={14} />Mark blocked</button>}
                {canEdit && milestone.blocked && milestone.status !== 'done' && <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => void toggleBlocked(milestone)}><QuorlythGlyph name="complete" size={14} />Clear blocker</button>}
                {canEdit && milestone.status === 'todo' && <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => void changeStatus(milestone, 'in_progress')}><QuorlythGlyph name="start" size={14} />Start work</button>}
                {canEdit && milestone.status === 'done' && <button type="button" className="ql-quiet-action" disabled={busyId === milestone.id} onClick={() => void changeStatus(milestone, 'in_progress')}><QuorlythGlyph name="progress" size={14} />Reopen</button>}
                {canManage && <button type="button" className="ql-quiet-action ql-danger-action" disabled={busyId === milestone.id} onClick={() => void removeMilestone(milestone)}><QuorlythGlyph name="trash" size={14} />Delete milestone</button>}
              </div>}
              <MilestoneWorkPanel
                idea={idea}
                milestone={milestone}
                submissions={a.data.workSubmissions.filter(item => item.milestoneId === milestone.id)}
                canManage={canManage}
                canCollaborate={canCollaborate && active}
                projectActive={active}
              />
            </div>
          </article>
        })}
      </div> : <div className="ql-milestone-empty"><span><QuorlythGlyph name="milestone" size={25} /></span><h4>{milestones.length ? 'Nothing in this view' : 'Your execution plan starts here'}</h4><p>{milestones.length ? 'Choose another filter to see milestones from this project.' : 'Break the project into outcomes with an owner, a deadline and clear acceptance criteria.'}</p>{canEdit && !milestones.length && <button type="button" className="ql-primary-action" onClick={beginCreate}><QuorlythGlyph name="add" size={16} />Create the first milestone</button>}</div>}
      {!active && <p className="ql-muted ql-board-closed"><QuorlythGlyph name="complete" size={14} />This project is completed. Reopen the project to edit milestone details.</p>}
    </section>
  )
}
