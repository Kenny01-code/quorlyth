import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Head } from '../components/ui'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { WorkflowMap } from '../components/WorkflowMap'
import { WorkflowCanvas } from '../components/WorkflowCanvas'
import { useApp } from '../data/AppProvider'
import { userFacingMutationError } from '../lib/userFacingErrors'
import {
  ACTION_INFO,
  TRIGGER_INFO,
  WorkflowAction,
  WorkflowActionType,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowTrigger,
  executeWorkflowActions,
  newWorkflowId,
  workflowRunDocumentId,
  persistWorkflowRun,
  workflowGraphFor,
  workflowWithGraph,
  validateWorkflowGraph,
} from '../lib/automation'

type WorkflowProject = { id: string; title: string; createdBy?: string; status?: string; docId?: string }
type WorkflowMember = { id: string; projectId: string; userId: string; role: string; status: string }
type WorkflowRunRecord = WorkflowRun & { workflowId?: string; workflowName?: string }
type WorkflowNotice = { id: string; title: string; message: string; workflowName?: string; eventType?: string; at: number; read?: boolean }
type MainTab = 'workflows' | 'runs'
type WorkflowFilter = 'all' | 'active' | 'draft'
type Template = { key: string; name: string; description: string; trigger: WorkflowTrigger; action: WorkflowActionType; message?: string }

const TEMPLATES: Template[] = [
  { key: 'idea-alert', name: 'New idea alert', description: 'Notify your team when a fresh community idea enters the system.', trigger: 'idea.created', action: 'notify', message: 'New idea submitted: {{event.title}}' },
  { key: 'task-handoff', name: 'Completed task handoff', description: 'Send a handoff notice when a contributor completes an assigned task.', trigger: 'task.completed', action: 'notify', message: 'Task completed: {{event.title}}. Review the evidence and confirm the next step.' },
  { key: 'idea-review', name: 'Idea → delivery task', description: 'Turn a new idea into a real task inside a workspace you manage.', trigger: 'idea.created', action: 'create_task' },
  { key: 'evidence-review', name: 'Evidence review alert', description: 'Notify a reviewer whenever a contributor submits work for inspection.', trigger: 'evidence.submitted', action: 'notify', message: 'Evidence submitted for {{event.title}}. Check Quorlyth’s alignment notes and inspect the deliverable.' },
  { key: 'milestone-start', name: 'Milestone progress update', description: 'Keep the team informed when an assigned collaboration outcome moves into progress.', trigger: 'milestone.started', action: 'notify', message: 'Work has started on {{event.title}}. Keep the definition of done visible.' },
]

function freshAction(type: WorkflowActionType): WorkflowAction {
  const id = newWorkflowId()
  if (type === 'notify') return { id, type, title: ACTION_INFO.notify.title, message: 'Workflow update: {{event.title}}' }
  if (type === 'create_task') return {
    id, type, title: ACTION_INFO.create_task.title, projectId: '',
    taskTitle: 'Follow up: {{event.title}}',
    taskDescription: 'Created by {{workflow.name}}.\n\nContext: {{event.body}}',
    acceptanceCriteria: '',
  }
  return { id, type, title: ACTION_INFO.webhook.title, url: '' }
}

function freshWorkflow(ownerId: string, template?: Template): WorkflowDefinition {
  const now = Date.now()
  const id = newWorkflowId()
  const trigger = template?.trigger || 'manual'
  const action = freshAction(template?.action || 'notify')
  if (template?.message) action.message = template.message
  const triggerNodeId = newWorkflowId()
  return {
    id,
    ownerId,
    name: template?.name || 'Untitled workflow',
    description: template?.description || '',
    trigger,
    condition: '',
    actions: [action],
    nodes: [
      { id: triggerNodeId, type: 'trigger', trigger, position: { x: 60, y: 255 } },
      { id: action.id, type: 'action', action, position: { x: 570, y: 220 } },
    ],
    edges: [{ id: newWorkflowId(), source: triggerNodeId, target: action.id, sourceHandle: 'next' }],
    status: 'draft',
    runHistory: [],
    createdAt: now,
    updatedAt: now,
  }
}

function displayDate(value?: number | null) {
  if (!value) return 'Never run'
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function runLabel(status: WorkflowRun['status']) {
  return status === 'running' ? 'Running now' : status === 'success' ? 'Succeeded' : status === 'failed' ? 'Needs attention' : 'Skipped'
}

function TriggerGlyph({ trigger }: { trigger: WorkflowTrigger }) {
  const glyph = trigger === 'idea.created' ? 'idea'
    : trigger === 'task.completed' ? 'complete'
    : trigger === 'task.started' || trigger === 'milestone.started' ? 'start'
    : trigger === 'workspace.created' ? 'workspace'
    : trigger === 'evidence.submitted' ? 'upload'
    : trigger === 'evidence.reviewed' ? 'review'
    : 'start'
  return <QuorlythGlyph name={glyph} size={18} />
}

function ActionGlyph({ type }: { type: WorkflowActionType }) {
  return <QuorlythGlyph name={type === 'create_task' ? 'workspace' : type === 'webhook' ? 'send' : 'bell'} size={18} />
}

function usePrivateWorkflowCollection<T extends { id?: string }>(collection: string) {
  const app = useApp()
  const [rows, setRows] = useState<T[]>([])
  useEffect(() => {
    setRows([])
    const store = app.backend?.store
    if (!store || !app.me?.id) return
    return store.subscribe(collection, docs => {
      setRows(docs.map(doc => ({ ...doc.data, id: doc.data?.id || doc.id }) as T))
    }, error => {
      console.warn('Workflow collection could not refresh:', collection, error)
    })
  }, [app.backend?.store, app.me?.id, app.demo, collection])
  return rows
}

function AutomationWorkspace() {
  const app = useApp()
  const nav = useNavigate()
  const userId = app.me?.id || ''
  const collectionPath = userId ? 'data/users/' + userId + '/automations' : ''
  const workflows = usePrivateWorkflowCollection<WorkflowDefinition>(collectionPath)
  const projects = usePrivateWorkflowCollection<WorkflowProject>('standaloneProjects')
  const projectMembers = usePrivateWorkflowCollection<WorkflowMember>('standaloneProjectMembers')
  const runRecords = usePrivateWorkflowCollection<WorkflowRunRecord>(userId ? 'data/users/' + userId + '/automation-runs' : '')
  const notices = usePrivateWorkflowCollection<WorkflowNotice>(userId ? 'data/users/' + userId + '/automation-notifications' : '')
  const [tab, setTab] = useState<MainTab>('workflows')
  const [filter, setFilter] = useState<WorkflowFilter>('all')
  const [editing, setEditing] = useState<WorkflowDefinition | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const manageableProjects = projects.filter(project =>
    project.status !== 'completed'
    && (project.createdBy === userId || projectMembers.some(member =>
      member.projectId === project.id && member.userId === userId && member.status === 'active'
      && (member.role === 'owner' || member.role === 'manager')))
  )
  const orderedWorkflows = useMemo(() => [...workflows].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [workflows])
  const visibleWorkflows = orderedWorkflows.filter(workflow => filter === 'all' || workflow.status === filter)
  const allRuns = useMemo(() => {
    const byId = new Map<string, WorkflowRunRecord>()
    runRecords.forEach(run => byId.set(run.id, run))
    workflows.forEach(workflow => (workflow.runHistory || []).forEach(run => {
      if (!byId.has(run.id)) byId.set(run.id, { ...run, workflowId: workflow.id, workflowName: workflow.name })
    }))
    return [...byId.values()].sort((a, b) => (b.finishedAt || b.startedAt) - (a.finishedAt || a.startedAt))
  }, [workflows, runRecords])
  const activeCount = workflows.filter(workflow => workflow.status === 'active').length
  const runCount = allRuns.length
  const failedCount = allRuns.filter(run => run.status === 'failed').length

  function beginNew(template?: Template) {
    if (!userId) return
    setEditing(freshWorkflow(userId, template))
    setError('')
    setBusy('')
  }

  function beginEdit(workflow: WorkflowDefinition) {
    const graph = workflowGraphFor(workflow)
    setEditing({
      ...workflowWithGraph(workflow, graph.nodes, graph.edges),
      runHistory: workflow.runHistory || [],
    })
    setError('')
    setBusy('')
  }

  async function saveWorkflow(event: FormEvent) {
    event.preventDefault()
    if (!editing || !app.backend || !userId) return
    const name = editing.name.trim()
    if (name.length < 2) return setError('Give this workflow a name so you can find it again.')
    const graphError = validateWorkflowGraph(editing)
    if (graphError) return setError(graphError)
    for (const action of editing.actions) {
      if (action.type === 'create_task' && (!action.projectId || !manageableProjects.some(project => project.id === action.projectId))) return setError('Choose a workspace you own or manage for the task action.')
      if (action.type === 'webhook' && !/^https:\/\//i.test(action.url || '')) return setError('Webhook actions need a valid HTTPS URL.')
    }
    const next: WorkflowDefinition = { ...editing, name: name.slice(0, 100), description: editing.description.trim().slice(0, 500), ownerId: userId, updatedAt: Date.now() }
    setBusy('save')
    setError('')
    try {
      const path = collectionPath + '/' + next.id
      const current = await app.backend.store.get(path)
      if (current) await app.backend.store.set(path, next)
      else await app.backend.store.create(path, next)
      app.toast(next.status === 'active' ? 'Workflow saved and activated.' : 'Workflow saved as a draft.')
      setEditing(null)
      setTab('workflows')
      if (!current) nav('/architecture?automationCreated=' + encodeURIComponent(next.id) + '#arch-system-title')
    } catch (failure) {
      setError(userFacingMutationError(failure, 'save this workflow'))
    } finally {
      setBusy('')
    }
  }

  async function updateWorkflow(workflow: WorkflowDefinition, patch: Partial<WorkflowDefinition>, successMessage?: string) {
    if (!app.backend || !userId) return
    setBusy(workflow.id)
    setError('')
    try {
      const path = collectionPath + '/' + workflow.id
      const current = await app.backend.store.get(path)
      if (!current) throw new Error('This workflow is no longer available. Refresh the page and try again.')
      await app.backend.store.set(path, { ...current, ...patch, updatedAt: Date.now() })
      if (successMessage) app.toast(successMessage)
    } catch (failure) {
      const message = userFacingMutationError(failure, 'update this workflow')
      setError(message)
      app.toast(message)
    } finally {
      setBusy('')
    }
  }

  async function toggleWorkflow(workflow: WorkflowDefinition) {
    const status = workflow.status === 'active' ? 'draft' : 'active'
    await updateWorkflow(workflow, { status }, status === 'active' ? 'Workflow activated.' : 'Workflow paused.')
  }

  async function runWorkflow(workflow: WorkflowDefinition, keepEditorOpen = false) {
    if (!app.backend || !userId) return
    setBusy('run-' + workflow.id)
    setError('')
    const startedAt = Date.now()
    const event = {
      type: 'manual' as const,
      payload: { id: newWorkflowId(), title: 'Manual test run', summary: 'Started from the workflow builder', at: startedAt },
    }
    const runPath = 'data/users/' + userId + '/automation-runs/' + workflowRunDocumentId(workflow.id, 'manual', event.payload.id)
    try {
      await app.backend.store.create(runPath, {
        id: event.payload.id,
        workflowId: workflow.id,
        workflowName: workflow.name,
        trigger: 'manual',
        status: 'running',
        startedAt,
        finishedAt: 0,
        eventTitle: event.payload.title,
        steps: [],
      })
      const saveProgress = async (run: WorkflowRun) => {
        await app.backend!.store.update(runPath, {
          ...run,
          workflowId: workflow.id,
          workflowName: workflow.name,
          updatedAt: Date.now(),
        })
      }
      const run = await executeWorkflowActions(workflow, userId, app.backend.store, event, app.toast, saveProgress)
      await saveProgress(run)
      await persistWorkflowRun(app.backend.store, collectionPath + '/' + workflow.id, run)
      app.toast(run.status === 'success' ? 'Workflow test finished successfully.' : userFacingMutationError(run.error || 'An action failed', 'run this workflow'))
      if (!keepEditorOpen) setTab('runs')
    } catch (failure) {
      const message = userFacingMutationError(failure, 'run this workflow')
      setError(message)
      app.toast(message)
    } finally {
      setBusy('')
    }
  }

  async function removeWorkflow(workflow: WorkflowDefinition) {
    if (!app.backend || !userId) return
    if (!window.confirm('Delete "' + workflow.name + '" and its saved run history? This cannot be undone.')) return
    setBusy('delete-' + workflow.id)
    setError('')
    try {
      await app.backend.store.delete(collectionPath + '/' + workflow.id)
      app.toast('Workflow deleted.')
    } catch (failure) {
      const message = userFacingMutationError(failure, 'delete this workflow')
      setError(message)
      app.toast(message)
    } finally {
      setBusy('')
    }
  }

  if (editing) {
    const latestRun = allRuns.find(run => run.workflowId === editing.id) || editing.runHistory?.[0] || null
    return (
      <div className="wa-screen wa-screen-graph">
        <div className="wa-editor-top">
          <button className="wa-back" type="button" onClick={() => { setEditing(null); setError('') }}><QuorlythGlyph name="back" size={15} />Back to workflows</button>
          <div className="wa-editor-actions">
            <button className="btn" type="button" onClick={() => void runWorkflow(editing, true)} disabled={busy === 'run-' + editing.id}>
              <QuorlythGlyph name="start" size={14} />{busy === 'run-' + editing.id ? 'Testing…' : 'Test workflow'}
            </button>
            <button className="btn p" type="submit" form="wa-editor-form" disabled={busy === 'save'}><QuorlythGlyph name="save" size={15} />{busy === 'save' ? 'Saving…' : 'Save workflow'}</button>
          </div>
        </div>
        <Head kicker="WORKFLOW BUILDER" title="Connect the nodes." />
        <form id="wa-editor-form" className="wa-graph-editor-form" onSubmit={saveWorkflow}>
          <WorkflowCanvas
            workflow={editing}
            projects={manageableProjects.map(project => ({ id: project.id, title: project.title }))}
            latestRun={latestRun}
            onChange={next => setEditing({ ...next, updatedAt: Date.now() })}
          />
          {error && <p className="wa-error" role="alert">{error}</p>}
          <div className="wa-bottom-actions">
            <button className="btn" type="button" onClick={() => { setEditing(null); setError('') }}>Cancel</button>
            <button className="btn p" type="submit" disabled={busy === 'save'}><QuorlythGlyph name="save" size={15} />{busy === 'save' ? 'Saving…' : 'Save workflow'}</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="wa-screen">
      <Head kicker="WORKFLOW AUTOMATION" title="Make work move on its own." right={<button className="btn p" type="button" onClick={() => beginNew()}><QuorlythGlyph name="add" size={15} />Build workflow</button>} />

      <section className="wa-hero glass pad">
        <div className="wa-hero-copy"><span className="wa-hero-kicker"><QuorlythGlyph name="brand" size={14} />A little less busywork</span><h3>Connect the steps.<br /><span>Automate the handoff.</span></h3><p>Choose a live event, narrow it with a condition, then connect ordered actions. Quorlyth records each step, keeps a run ledger and prevents duplicate tabs from claiming the same event twice.</p><div className="wa-hero-actions"><button className="btn p" type="button" onClick={() => beginNew()}><QuorlythGlyph name="add" size={15} />Create your first flow</button><button className="btn" type="button" onClick={() => setTab('runs')}><QuorlythGlyph name="progress" size={15} />View run history</button></div></div>
        <div className="wa-hero-visual" aria-label="Example workflow: idea submitted, filter, create review task">
          <div className="wa-float-label wa-label-trigger">TRIGGER</div>
          <div className="wa-preview-node"><span className="wa-preview-node-icon"><QuorlythGlyph name="idea" size={17} /></span><div><small>WHEN THIS HAPPENS</small><strong>New idea submitted</strong></div><QuorlythGlyph name="check" size={14} /></div>
          <div className="wa-preview-connector"><i /></div>
          <div className="wa-preview-node wa-preview-filter"><span className="wa-preview-node-icon"><QuorlythGlyph name="sliders" size={17} /></span><div><small>OPTIONAL FILTER</small><strong>Match the right ideas</strong></div></div>
          <div className="wa-preview-connector"><i /></div>
          <div className="wa-preview-node wa-preview-action"><span className="wa-preview-node-icon"><QuorlythGlyph name="workspace" size={17} /></span><div><small>THEN DO THIS</small><strong>Create a review task</strong></div><QuorlythGlyph name="arrow" size={14} /></div>
          <div className="wa-canvas-caption"><span className="wa-canvas-pulse" />Your workflow, step by step</div>
        </div>
      </section>

      <div className="wa-stats">
        <div className="glass pad wa-stat"><span className="wa-stat-icon"><QuorlythGlyph name="timeline" size={18} /></span><p>Saved workflows</p><strong>{workflows.length}</strong><small>Flows you can edit anytime</small></div>
        <div className="glass pad wa-stat"><span className="wa-stat-icon is-live"><QuorlythGlyph name="start" size={18} /></span><p>Active automations</p><strong>{activeCount}</strong><small>Listening for their triggers</small></div>
        <div className="glass pad wa-stat"><span className="wa-stat-icon is-run"><QuorlythGlyph name="progress" size={18} /></span><p>Recorded runs</p><strong>{runCount}</strong><small>{failedCount ? failedCount + ' need attention' : 'Execution history is saved'}</small></div>
      </div>

      <div className="wa-main-tabs">
        <div className="wa-tabs" role="tablist" aria-label="Automation views">
          <button type="button" role="tab" aria-selected={tab === 'workflows'} className={tab === 'workflows' ? 'is-selected' : ''} onClick={() => setTab('workflows')}><QuorlythGlyph name="timeline" size={15} />My workflows <span>{workflows.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === 'runs'} className={tab === 'runs' ? 'is-selected' : ''} onClick={() => setTab('runs')}><QuorlythGlyph name="progress" size={15} />Run history <span>{runCount}</span></button>
        </div>
        {tab === 'workflows' && <div className="wa-filter-tabs">
          {(['all','active','draft'] as WorkflowFilter[]).map(value => <button key={value} type="button" onClick={() => setFilter(value)} className={filter === value ? 'is-selected' : ''}>{value === 'all' ? 'All flows' : value === 'active' ? 'Active' : 'Drafts'}</button>)}
        </div>}
      </div>

      {error && <p className="wa-error" role="alert">{error}</p>}

      {tab === 'workflows' ? (
        <>
          {visibleWorkflows.length ? <div className="wa-workflow-list">
            {visibleWorkflows.map(workflow => (
              <article className="glass pad wa-workflow-card" key={workflow.id}>
                <div className="wa-workflow-main">
                  <div className="wa-workflow-symbol"><TriggerGlyph trigger={workflow.trigger} /></div>
                  <div className="wa-workflow-info"><div className="wa-workflow-title"><h3>{workflow.name}</h3><span className={workflow.status === 'active' ? 'wa-badge is-active' : 'wa-badge'}><i />{workflow.status === 'active' ? 'Active' : 'Draft'}</span></div><p>{workflow.description || TRIGGER_INFO[workflow.trigger].description}</p><div className="wa-workflow-meta"><span><TriggerGlyph trigger={workflow.trigger} />{TRIGGER_INFO[workflow.trigger].title}</span><span><QuorlythGlyph name="timeline" size={13} />{workflow.actions.length} action{workflow.actions.length === 1 ? '' : 's'}</span><span><QuorlythGlyph name="progress" size={13} />Last run {displayDate(workflow.lastRunAt)}</span></div></div>
                </div>
                <div className="wa-workflow-actions"><button type="button" className="btn p" onClick={() => void runWorkflow(workflow)} disabled={busy === 'run-' + workflow.id}><QuorlythGlyph name="start" size={14} />{busy === 'run-' + workflow.id ? 'Running…' : 'Run now'}</button><button type="button" className="btn" onClick={() => beginEdit(workflow)}><QuorlythGlyph name="edit" size={14} />Edit</button><label className="wa-list-toggle" title={workflow.status === 'active' ? 'Pause workflow' : 'Activate workflow'}><input type="checkbox" checked={workflow.status === 'active'} onChange={() => void toggleWorkflow(workflow)} disabled={busy === workflow.id} /><i /></label><button className="wa-icon-btn" type="button" onClick={() => void removeWorkflow(workflow)} disabled={busy === 'delete-' + workflow.id} aria-label={'Delete ' + workflow.name} title="Delete workflow"><QuorlythGlyph name="trash" size={15} /></button></div>
                {(workflow.runHistory || []).length > 0 && <div className="wa-last-run"><span className={(workflow.runHistory[0].status === 'success' ? 'wa-run-dot success' : 'wa-run-dot failed')} />Last result: <strong>{runLabel(workflow.runHistory[0].status)}</strong><span>·</span>{displayDate(workflow.runHistory[0].finishedAt)}{workflow.runHistory[0].error ? <small>{workflow.runHistory[0].error}</small> : null}</div>}
              </article>
            ))}
          </div> : <section className="glass pad wa-empty"><span className="wa-empty-symbol"><QuorlythGlyph name="timeline" size={24} /></span><p className="wa-eyebrow">{filter === 'all' ? 'NOTHING AUTOMATED YET' : 'NO MATCHING FLOWS'}</p><h3>{filter === 'all' ? 'Start with one repeated task.' : 'Nothing in this view yet.'}</h3><p>{filter === 'all' ? 'A workflow starts with one event and one useful action. Use a template to build your first one without starting from scratch.' : 'Change this filter or create a workflow to get started.'}</p><button className="btn p" type="button" onClick={() => filter === 'all' ? beginNew(TEMPLATES[0]) : setFilter('all')}><QuorlythGlyph name="add" size={15} />{filter === 'all' ? 'Start from a template' : 'Show all workflows'}</button></section>}

          <section className="wa-template-section">
            <div className="wa-section-title"><div><p className="wa-eyebrow">STARTER FLOWS</p><h3>Pick a useful starting point.</h3><p>Each template opens in the builder so you can customise it before saving.</p></div><span className="wa-template-count">{TEMPLATES.length} templates</span></div>
            <div className="wa-templates">
              {TEMPLATES.map((template, index) => (
                <article className="glass pad wa-template-card" key={template.key}>
                  <div className="wa-template-top"><span className={'wa-template-icon wa-template-' + index}><ActionGlyph type={template.action} /></span><span>STARTER {String(index + 1).padStart(2, '0')}</span></div>
                  <h4>{template.name}</h4><p>{template.description}</p><div className="wa-template-trigger"><TriggerGlyph trigger={template.trigger} /><span>{TRIGGER_INFO[template.trigger].title}</span></div><button type="button" onClick={() => beginNew(template)}>Use template <QuorlythGlyph name="arrow" size={14} /></button>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="glass pad wa-runs-panel">
          <div className="wa-section-title"><div><p className="wa-eyebrow">ACTIVITY</p><h3>What your workflows have done.</h3><p>Live and completed runs appear here. Expand each run to inspect the action results, failure detail and execution sequence.</p></div></div>
          {notices.length > 0 && <div className="wa-notice-inbox"><div className="wa-section-title"><div><p className="wa-eyebrow">NOTICES</p><h3>Recent automation notifications</h3><p>Messages produced by your workflows when an event matches.</p></div><span className="wa-template-count">{notices.length} saved</span></div><div className="wa-notice-list">{notices.slice().sort((a,b)=>b.at-a.at).slice(0,8).map(notice => <article className="wa-notice-row" key={notice.id}><span className="wa-notice-icon"><QuorlythGlyph name="bell" size={15} /></span><div><strong>{notice.title || notice.workflowName || 'Automation notice'}</strong><p>{notice.message}</p><small>{displayDate(notice.at)}{notice.eventType ? ' · ' + notice.eventType : ''}</small></div></article>)}</div></div>}
          {!allRuns.length ? <div className="wa-empty wa-empty-compact"><span className="wa-empty-symbol"><QuorlythGlyph name="progress" size={24} /></span><h3>No runs recorded yet</h3><p>Use “Run now” on a workflow to test its actions, or activate a flow to run it automatically when the selected event happens.</p><button type="button" className="btn p" onClick={() => { setTab('workflows'); if (!workflows.length) beginNew() }}>Build a workflow <QuorlythGlyph name="arrow" size={14} /></button></div> : <div className="wa-run-list">
            {allRuns.map(run => <article className="wa-run-row" key={run.workflowId + ':' + run.id}>
              <span className={'wa-run-status ' + run.status}>{run.status === 'success' ? <QuorlythGlyph name="check" size={15} /> : run.status === 'running' ? <QuorlythGlyph name="progress" size={15} /> : <QuorlythGlyph name="alert" size={15} />}</span>
              <div className="wa-run-summary"><strong>{run.workflowName}</strong><p>{run.eventTitle || (run.trigger === 'manual' ? 'Manual test run' : TRIGGER_INFO[run.trigger as WorkflowTrigger]?.title || run.trigger)}</p><small>{displayDate(run.status === 'running' ? run.startedAt : run.finishedAt)} · {run.steps.length} of the configured step{run.steps.length === 1 ? '' : 's'} recorded</small>{run.steps.map(step => <div className="wa-run-step" key={step.id}><span className={'wa-run-dot ' + step.status} /><span>{step.title}</span><small>{step.status === 'success' || step.status === 'running' ? step.detail : userFacingMutationError(step.detail, 'complete this workflow step')}</small></div>)}{run.error && <p className="wa-run-error">{userFacingMutationError(run.error, 'run this workflow')}</p>}</div>
              <span className={'wa-badge ' + (run.status === 'success' ? 'is-active' : run.status === 'running' ? 'is-running' : '')}>{runLabel(run.status)}</span>
            </article>)}
          </div>}
          <WorkflowMap workflows={workflows} runs={allRuns} />
        </section>
      )}
    </div>
  )
}

export function Automations() {
  return <Gate><AutomationWorkspace /></Gate>
}
