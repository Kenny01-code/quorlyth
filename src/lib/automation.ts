import type { DocStore } from '../data/docstore'

export type WorkflowTrigger = 'manual' | 'idea.created' | 'task.completed' | 'workspace.created'
export type WorkflowActionType = 'notify' | 'create_task' | 'webhook'

export interface WorkflowAction {
  id: string
  type: WorkflowActionType
  title: string
  message?: string
  projectId?: string
  taskTitle?: string
  taskDescription?: string
  acceptanceCriteria?: string
  url?: string
}

export interface WorkflowRunStep {
  id: string
  title: string
  status: 'success' | 'failed'
  detail: string
  at: number
}

export interface WorkflowRun {
  id: string
  trigger: WorkflowTrigger | 'manual.run'
  status: 'success' | 'failed' | 'skipped'
  startedAt: number
  finishedAt: number
  steps: WorkflowRunStep[]
  eventTitle?: string
  error?: string
}

export interface WorkflowDefinition {
  id: string
  ownerId: string
  name: string
  description: string
  trigger: WorkflowTrigger
  condition?: string
  actions: WorkflowAction[]
  status: 'active' | 'draft'
  runHistory: WorkflowRun[]
  createdAt: number
  updatedAt: number
  lastRunAt?: number | null
}

export interface WorkflowEventPayload {
  id?: string
  title?: string
  body?: string
  summary?: string
  communityId?: string
  projectId?: string
  taskId?: string
  at?: number
  [key: string]: unknown
}

export interface WorkflowEventDetail {
  type: WorkflowTrigger
  payload: WorkflowEventPayload
}

export const WORKFLOW_EVENT_NAME = 'quorlyth:workflow-event'

export const TRIGGER_INFO: Record<WorkflowTrigger, { title: string; description: string }> = {
  manual: { title: 'Run manually', description: 'Start this workflow whenever you choose.' },
  'idea.created': { title: 'A new idea is submitted', description: 'Runs when someone shares an idea in a Quorlyth community.' },
  'task.completed': { title: 'A workspace task is completed', description: 'Runs after a standalone workspace task has been completed.' },
  'workspace.created': { title: 'A workspace is created', description: 'Runs when you create a new independent project workspace.' },
}

export const ACTION_INFO: Record<WorkflowActionType, { title: string; description: string }> = {
  notify: { title: 'Send me a Quorlyth notification', description: 'Save an in-app automation notice and show a toast when Quorlyth is open.' },
  create_task: { title: 'Create a workspace task', description: 'Add a real task to one of your independent project workspaces.' },
  webhook: { title: 'Send a webhook', description: 'POST a small JSON event payload to an HTTPS endpoint you configure.' },
}

export function newWorkflowId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'wf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

export function emitWorkflowEvent(type: WorkflowTrigger, payload: WorkflowEventPayload = {}) {
  if (typeof window === 'undefined' || type === 'manual') return
  window.dispatchEvent(new CustomEvent<WorkflowEventDetail>(WORKFLOW_EVENT_NAME, {
    detail: { type, payload: { ...payload, at: payload.at || Date.now() } },
  }))
}

export function workflowMatchesEvent(workflow: WorkflowDefinition, event: WorkflowEventDetail) {
  if (workflow.status !== 'active' || workflow.trigger === 'manual' || workflow.trigger !== event.type) return false
  const condition = workflow.condition?.trim().toLocaleLowerCase()
  if (!condition) return true
  const searchable = [event.payload.title, event.payload.body, event.payload.summary]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLocaleLowerCase()
  return searchable.includes(condition)
}

function interpolate(template: string | undefined, workflow: WorkflowDefinition, event: WorkflowEventDetail) {
  const values: Record<string, string> = {
    'event.type': event.type,
    'event.id': String(event.payload.id || ''),
    'event.title': String(event.payload.title || event.payload.summary || 'Untitled event'),
    'event.body': String(event.payload.body || event.payload.summary || ''),
    'event.communityId': String(event.payload.communityId || ''),
    'event.projectId': String(event.payload.projectId || ''),
    'workflow.name': workflow.name,
  }
  return String(template || '').replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole).trim()
}

export async function executeWorkflowActions(
  workflow: WorkflowDefinition,
  userId: string,
  store: DocStore,
  event: WorkflowEventDetail,
  notify?: (message: string) => void,
): Promise<WorkflowRun> {
  const startedAt = Date.now()
  const steps: WorkflowRunStep[] = []
  const runId = newWorkflowId()
  let failed = false

  for (const action of workflow.actions) {
    const at = Date.now()
    const step: WorkflowRunStep = { id: action.id || newWorkflowId(), title: action.title || ACTION_INFO[action.type].title, status: 'success', detail: '', at }
    try {
      if (action.type === 'notify') {
        const message = interpolate(action.message || '{{workflow.name}} finished for {{event.title}}', workflow, event) || workflow.name + ' ran successfully.'
        const noticeId = newWorkflowId()
        await store.create('data/users/' + userId + '/automation-notifications/' + noticeId, {
          id: noticeId,
          userId,
          workflowId: workflow.id,
          workflowName: workflow.name,
          eventType: event.type,
          title: workflow.name.slice(0, 120),
          message: message.slice(0, 1000),
          at,
          read: false,
        })
        notify?.(message)
        step.detail = 'Saved a notification to your Quorlyth automation inbox.'
      } else if (action.type === 'create_task') {
        const projectId = String(action.projectId || '').trim()
        if (!projectId) throw new Error('Choose a workspace for the task action.')
        const title = interpolate(action.taskTitle || 'Follow up: {{event.title}}', workflow, event).slice(0, 140)
        if (title.length < 2) throw new Error('Give the generated task a title.')
        const description = interpolate(action.taskDescription || 'Created by workflow: {{workflow.name}}.\n\nContext: {{event.body}}', workflow, event).slice(0, 2000)
        const criteria = interpolate(action.acceptanceCriteria || '', workflow, event).slice(0, 1000)
        const taskId = newWorkflowId()
        await store.create('standaloneTasks/' + taskId, {
          id: taskId,
          projectId,
          title,
          description,
          acceptanceCriteria: criteria,
          status: 'todo',
          createdBy: userId,
          at,
          updatedAt: at,
          dueAt: null,
          assigneeId: null,
        })
        step.detail = 'Created "' + title + '" in the selected workspace.'
      } else if (action.type === 'webhook') {
        const target = String(action.url || '').trim()
        let parsed: URL
        try { parsed = new URL(target) } catch { throw new Error('Enter a valid HTTPS webhook URL.') }
        if (parsed.protocol !== 'https:') throw new Error('Webhook URLs must use HTTPS.')
        const response = await fetch(parsed.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' },
          body: JSON.stringify({
            event: {
              type: event.type,
              id: event.payload.id || null,
              title: event.payload.title || null,
              summary: event.payload.summary || event.payload.body || null,
              communityId: event.payload.communityId || null,
              projectId: event.payload.projectId || null,
              at: event.payload.at || at,
            },
            workflow: { id: workflow.id, name: workflow.name },
            sentAt: at,
          }),
        })
        if (!response.ok) throw new Error('Webhook endpoint responded with HTTP ' + response.status + '.')
        step.detail = 'Webhook accepted the request (HTTP ' + response.status + ').'
      }
    } catch (error) {
      failed = true
      step.status = 'failed'
      step.detail = error instanceof Error ? error.message.slice(0, 400) : 'This action failed. Check its configuration and try again.'
    }
    steps.push(step)
    if (step.status === 'failed') break
  }

  return {
    id: runId,
    trigger: event.type,
    status: failed ? 'failed' : 'success',
    startedAt,
    finishedAt: Date.now(),
    steps,
    eventTitle: String(event.payload.title || event.payload.summary || ''),
    ...(failed ? { error: steps.find(step => step.status === 'failed')?.detail || 'An action failed.' } : {}),
  }
}

export async function persistWorkflowRun(store: DocStore, path: string, run: WorkflowRun) {
  const current = await store.get(path) as WorkflowDefinition | null
  if (!current) return
  const previous = Array.isArray(current.runHistory) ? current.runHistory : []
  await store.set(path, {
    ...current,
    runHistory: [run, ...previous.filter(item => item.id !== run.id)].slice(0, 20),
    lastRunAt: run.finishedAt,
    updatedAt: Date.now(),
  })
}
