import type { DocStore } from '../data/docstore'

export type WorkflowTrigger = 'manual' | 'idea.created' | 'task.started' | 'task.completed' | 'workspace.created' | 'milestone.started' | 'evidence.submitted' | 'evidence.reviewed'
export type WorkflowActionType = 'notify' | 'create_task' | 'webhook'
export type WorkflowConditionField = 'text' | 'title' | 'body' | 'summary' | 'event.type'
export type WorkflowConditionOperator = 'contains' | 'equals' | 'not_contains' | 'starts_with'
export type WorkflowEdgeHandle = 'next' | 'true' | 'false'

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

export interface WorkflowNodePosition { x: number; y: number }

export type WorkflowNode =
  | { id: string; type: 'trigger'; trigger: WorkflowTrigger; position?: WorkflowNodePosition }
  | { id: string; type: 'condition'; field: WorkflowConditionField; operator: WorkflowConditionOperator; value: string; position?: WorkflowNodePosition }
  | { id: string; type: 'action'; action: WorkflowAction; position?: WorkflowNodePosition }

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle: WorkflowEdgeHandle
  label?: string
}

export interface WorkflowRunStep {
  id: string
  nodeId?: string
  title: string
  status: 'running' | 'success' | 'failed' | 'skipped'
  detail: string
  at: number
}

export interface WorkflowRun {
  id: string
  trigger: WorkflowTrigger | 'manual.run'
  status: 'running' | 'success' | 'failed' | 'skipped'
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
  nodes?: WorkflowNode[]
  edges?: WorkflowEdge[]
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
  'task.started': { title: 'A teammate starts a task', description: 'Runs when an assigned workspace contributor begins work.' },
  'task.completed': { title: 'A workspace task is completed', description: 'Runs after a standalone workspace task has been completed.' },
  'workspace.created': { title: 'A workspace is created', description: 'Runs when you create a new independent project workspace.' },
  'milestone.started': { title: 'A collaboration milestone starts', description: 'Runs when an assigned collaborator starts a planned outcome.' },
  'evidence.submitted': { title: 'Work evidence is submitted', description: 'Runs when a contributor submits a deliverable for review.' },
  'evidence.reviewed': { title: 'Evidence is reviewed', description: 'Runs when a workspace reviewer approves evidence or requests changes.' },
}

export const ACTION_INFO: Record<WorkflowActionType, { title: string; description: string }> = {
  notify: { title: 'Send me a Quorlyth notification', description: 'Save an in-app automation notice and show a toast when Quorlyth is open.' },
  create_task: { title: 'Create a workspace task', description: 'Add a real task to one of your independent project workspaces.' },
  webhook: { title: 'Send a webhook', description: 'POST a small JSON event payload to an HTTPS endpoint you configure.' },
}

export const CONDITION_FIELD_INFO: Record<WorkflowConditionField, string> = {
  text: 'Any event text',
  title: 'Event title',
  body: 'Event body',
  summary: 'Event summary',
  'event.type': 'Event type',
}

export const CONDITION_OPERATOR_INFO: Record<WorkflowConditionOperator, string> = {
  contains: 'contains',
  equals: 'equals',
  not_contains: 'does not contain',
  starts_with: 'starts with',
}

export function newWorkflowId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'wf-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

/**
 * Database document paths only allow letters, numbers, underscores and hyphens.
 * Workflow/event keys are allowed to contain punctuation, so never URL-encode
 * them into a docs path (percent-escapes are rejected by the database guard).
 */
export function workflowRunDocumentId(workflowId: string, trigger: string, eventId: string) {
  const safeSegment = (value: string) =>
    String(value || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  const id = [workflowId, trigger, eventId].map(safeSegment).filter(Boolean).join('--').slice(0, 180)
  return id || newWorkflowId()
}

function legacyNodeId(workflowId: string, suffix: string) {
  return ('legacy_' + workflowId + '_' + suffix).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 170)
}

/** Convert older trigger/filter/action workflows into a connected graph at read time. */
export function buildLegacyWorkflowGraph(workflow: WorkflowDefinition): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const triggerId = legacyNodeId(workflow.id, 'trigger')
  const conditionId = legacyNodeId(workflow.id, 'condition')
  const nodes: WorkflowNode[] = [{ id: triggerId, type: 'trigger', trigger: workflow.trigger, position: { x: 70, y: 190 } }]
  const edges: WorkflowEdge[] = []
  const hasCondition = Boolean(workflow.condition?.trim())
  if (hasCondition) {
    nodes.push({
      id: conditionId,
      type: 'condition',
      field: 'text',
      operator: 'contains',
      value: workflow.condition!.trim(),
      position: { x: 390, y: 190 },
    })
    edges.push({ id: legacyNodeId(workflow.id, 'edge-trigger-condition'), source: triggerId, target: conditionId, sourceHandle: 'next' })
  }

  const actions = Array.isArray(workflow.actions) ? workflow.actions : []
  let previousId = hasCondition ? conditionId : triggerId
  actions.forEach((action, index) => {
    const id = action.id || legacyNodeId(workflow.id, 'action-' + index)
    nodes.push({ id, type: 'action', action: { ...action, id }, position: { x: 730, y: 105 + index * 145 } })
    edges.push({
      id: legacyNodeId(workflow.id, 'edge-' + index),
      source: previousId,
      target: id,
      sourceHandle: hasCondition && index === 0 ? 'true' : 'next',
      ...(hasCondition && index === 0 ? { label: 'true' } : {}),
    })
    previousId = id
  })
  return { nodes, edges }
}

export function workflowGraphFor(workflow: WorkflowDefinition): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  if (Array.isArray(workflow.nodes) && workflow.nodes.some(node => node.type === 'trigger')
    && Array.isArray(workflow.edges)) {
    return {
      nodes: workflow.nodes.map(node => node.type === 'action' ? { ...node, action: { ...node.action } } : { ...node }),
      edges: workflow.edges.map(edge => ({ ...edge })),
    }
  }
  return buildLegacyWorkflowGraph(workflow)
}

export function workflowActionsFromGraph(nodes: WorkflowNode[]): WorkflowAction[] {
  return nodes.filter((node): node is Extract<WorkflowNode, { type: 'action' }> => node.type === 'action')
    .map(node => ({ ...node.action }))
}

/** Keep the original fields populated so older screens and saved records remain compatible. */
export function workflowWithGraph(
  workflow: WorkflowDefinition,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowDefinition {
  const trigger = nodes.find((node): node is Extract<WorkflowNode, { type: 'trigger' }> => node.type === 'trigger')
  const condition = nodes.find((node): node is Extract<WorkflowNode, { type: 'condition' }> => node.type === 'condition')
  return {
    ...workflow,
    trigger: trigger?.trigger || workflow.trigger,
    condition: condition?.value || '',
    actions: workflowActionsFromGraph(nodes),
    nodes: nodes.map(node => node.type === 'action' ? { ...node, action: { ...node.action } } : { ...node }),
    edges: edges.map(edge => ({ ...edge })),
  }
}

export function validateWorkflowGraph(workflow: WorkflowDefinition): string | null {
  const { nodes, edges } = workflowGraphFor(workflow)
  if (!nodes.length) return 'Add a trigger to start this workflow.'
  if (nodes.length > 20) return 'A workflow can contain up to 20 nodes.'
  if (edges.length > 24) return 'A workflow can contain up to 24 connections.'
  const triggers = nodes.filter(node => node.type === 'trigger')
  const conditions = nodes.filter(node => node.type === 'condition')
  const actions = nodes.filter(node => node.type === 'action')
  if (triggers.length !== 1) return 'Each workflow must have exactly one trigger node.'
  if (conditions.length > 1) return 'Each workflow can currently have one decision node with true and false routes.'
  if (!actions.length) return 'Connect at least one action node to the trigger or a decision branch.'
  if (actions.length > 12) return 'A workflow can contain up to 12 action nodes.'
  if (conditions.length && !conditions[0].value.trim()) return 'Give the decision node a condition to evaluate.'

  const byId = new Map(nodes.map(node => [node.id, node]))
  const incoming = new Map<string, number>()
  const outgoing = new Map<string, number>()
  const handles = new Set<string>()
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) return 'A connection points to a node that no longer exists.'
    if (edge.source === edge.target) return 'A node cannot connect to itself.'
    const source = byId.get(edge.source)!
    const target = byId.get(edge.target)!
    if (source.type === 'trigger' && edge.sourceHandle !== 'next') return 'The trigger output must use its main connection.'
    if (source.type === 'condition' && edge.sourceHandle === 'next') return 'Decision connections must use the true or false output.'
    if (source.type === 'action' && edge.sourceHandle !== 'next') return 'Action nodes must use their main output.'
    if (source.type === 'condition' && target.type !== 'action') return 'Decision branches must connect directly to an action.'
    const handleKey = edge.source + ':' + edge.sourceHandle
    if (handles.has(handleKey)) return 'Each output can connect to one next node. Add actions in sequence after that node.'
    handles.add(handleKey)
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1)
    if ((incoming.get(edge.target) || 0) > 1) return 'A node can only have one incoming connection.'
    if ((outgoing.get(edge.source) || 0) > (source.type === 'condition' ? 2 : 1)) return 'A node has too many outgoing connections.'
  }

  const trigger = triggers[0]
  const visited = new Set<string>()
  const walk = (nodeId: string, stack: Set<string>): string | null => {
    if (stack.has(nodeId)) return 'Workflow connections cannot contain a loop.'
    if (visited.has(nodeId)) return null
    visited.add(nodeId)
    const nextStack = new Set(stack).add(nodeId)
    for (const edge of edges.filter(item => item.source === nodeId)) {
      const issue = walk(edge.target, nextStack)
      if (issue) return issue
    }
    return null
  }
  const cycleError = walk(trigger.id, new Set())
  if (cycleError) return cycleError
  if (visited.size !== nodes.length) return 'Every node must be connected to the trigger through a visible path.'
  if (!edges.some(edge => edge.source === trigger.id)) return 'Connect the trigger to the next node.'
  if (conditions.length) {
    const condition = conditions[0]
    if (!edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'true')) return 'Connect at least one action to the decision node’s true output.'
  }
  return null
}

export function emitWorkflowEvent(type: WorkflowTrigger, payload: WorkflowEventPayload = {}) {
  if (typeof window === 'undefined' || type === 'manual') return
  window.dispatchEvent(new CustomEvent<WorkflowEventDetail>(WORKFLOW_EVENT_NAME, {
    detail: { type, payload: { ...payload, at: payload.at || Date.now() } },
  }))
}

export function workflowMatchesEvent(workflow: WorkflowDefinition, event: WorkflowEventDetail) {
  // Conditions now execute as real decision nodes, so non-matching events must
  // still be recorded and routed through the false output.
  return workflow.status === 'active' && workflow.trigger !== 'manual' && workflow.trigger === event.type
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

function conditionValue(node: Extract<WorkflowNode, { type: 'condition' }>, event: WorkflowEventDetail) {
  if (node.field === 'title') return String(event.payload.title || '')
  if (node.field === 'body') return String(event.payload.body || '')
  if (node.field === 'summary') return String(event.payload.summary || '')
  if (node.field === 'event.type') return event.type
  return [event.payload.title, event.payload.summary, event.payload.body, event.type].filter(Boolean).join(' ')
}

export function evaluateWorkflowCondition(node: Extract<WorkflowNode, { type: 'condition' }>, event: WorkflowEventDetail) {
  const actual = conditionValue(node, event).trim().toLocaleLowerCase()
  const expected = node.value.trim().toLocaleLowerCase()
  if (!expected) return false
  if (node.operator === 'equals') return actual === expected
  if (node.operator === 'not_contains') return !actual.includes(expected)
  if (node.operator === 'starts_with') return actual.startsWith(expected)
  return actual.includes(expected)
}

export async function executeWorkflowActions(
  workflow: WorkflowDefinition,
  userId: string,
  store: DocStore,
  event: WorkflowEventDetail,
  notify?: (message: string) => void,
  onProgress?: (run: WorkflowRun) => Promise<void> | void,
): Promise<WorkflowRun> {
  const startedAt = Date.now()
  const steps: WorkflowRunStep[] = []
  const runId = newWorkflowId()
  const { nodes, edges } = workflowGraphFor(workflow)
  const byId = new Map(nodes.map(node => [node.id, node]))
  let failed = false
  let errorMessage = ''

  const makeRun = (status: WorkflowRun['status']): WorkflowRun => ({
    id: runId,
    trigger: event.type,
    status,
    startedAt,
    finishedAt: status === 'running' ? 0 : Date.now(),
    steps: steps.map(step => ({ ...step })),
    eventTitle: String(event.payload.title || event.payload.summary || ''),
    ...(failed ? { error: errorMessage } : {}),
  })
  const progress = async (status: WorkflowRun['status']) => {
    try { await onProgress?.(makeRun(status)) }
    catch (error) {
      // Progress persistence is observational. A temporary history-write failure
      // must not cause an already completed action to be executed a second time.
      console.warn('Workflow run progress could not be persisted:', error)
    }
  }
  const mark = async (node: WorkflowNode, status: WorkflowRunStep['status'], detail: string) => {
    const at = Date.now()
    const title = node.type === 'trigger' ? TRIGGER_INFO[node.trigger].title
      : node.type === 'condition' ? 'Evaluate decision'
        : node.action.title || ACTION_INFO[node.action.type].title
    const step: WorkflowRunStep = {
      id: node.id,
      nodeId: node.id,
      title,
      status,
      detail,
      at,
    }
    const existingIndex = steps.findIndex(item => item.id === node.id)
    if (existingIndex >= 0) steps[existingIndex] = step
    else steps.push(step)
    await progress(status === 'failed' ? 'failed' : 'running')
  }

  const trigger = nodes.find((node): node is Extract<WorkflowNode, { type: 'trigger' }> => node.type === 'trigger')
  if (!trigger) {
    failed = true
    errorMessage = 'This workflow has no trigger node.'
    const run = makeRun('failed')
    await progress('failed')
    return run
  }

  await mark(trigger, 'success', 'Event received: ' + event.type)
  let nextEdge = edges.find(edge => edge.source === trigger.id && edge.sourceHandle === 'next')
  const condition = nodes.find((node): node is Extract<WorkflowNode, { type: 'condition' }> => node.type === 'condition')
  if (condition && nextEdge?.target === condition.id) {
    const matched = evaluateWorkflowCondition(condition, event)
    await mark(condition, 'success', matched
      ? 'Condition matched. Following the true route.'
      : 'Condition did not match. Following the false route.')
    nextEdge = edges.find(edge => edge.source === condition.id && edge.sourceHandle === (matched ? 'true' : 'false'))
  }

  let currentId = nextEdge?.target || ''
  const executed = new Set<string>()
  while (currentId && !failed) {
    if (executed.has(currentId)) {
      failed = true
      errorMessage = 'A workflow loop was detected. The run was stopped safely.'
      break
    }
    executed.add(currentId)
    const node = byId.get(currentId)
    if (!node) {
      failed = true
      errorMessage = 'A connected node could not be found.'
      break
    }
    if (node.type !== 'action') {
      failed = true
      errorMessage = 'This connection does not lead to an executable action.'
      await mark(node, 'failed', errorMessage)
      break
    }

    const action = node.action
    await mark(node, 'running', 'Executing ' + (action.title || ACTION_INFO[action.type].title) + '…')
    const at = Date.now()
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
        await mark(node, 'success', 'Saved a notification to your Quorlyth automation inbox.')
      } else if (action.type === 'create_task') {
        const projectId = String(action.projectId || '').trim()
        if (!projectId) throw new Error('Choose a workspace for the task action.')
        const title = interpolate(action.taskTitle || 'Follow up: {{event.title}}', workflow, event).slice(0, 140)
        if (title.length < 2) throw new Error('Give the generated task a title.')
        const description = interpolate(action.taskDescription || 'Created by {{workflow.name}}.\n\nContext: {{event.body}}', workflow, event).slice(0, 2000)
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
        await mark(node, 'success', 'Created "' + title + '" in the selected workspace.')
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
        await mark(node, 'success', 'Webhook accepted the request (HTTP ' + response.status + ').')
      }
    } catch (error) {
      failed = true
      errorMessage = error instanceof Error ? error.message.slice(0, 400) : 'This action failed. Check its configuration and try again.'
      await mark(node, 'failed', errorMessage)
    }

    const next = edges.find(edge => edge.source === currentId && edge.sourceHandle === 'next')
    currentId = next?.target || ''
  }

  const run = makeRun(failed ? 'failed' : 'success')
  await progress(run.status)
  return run
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
