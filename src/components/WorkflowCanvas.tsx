import { CSSProperties, PointerEvent as ReactPointerEvent, useMemo, useState } from 'react'
import {
  ACTION_INFO,
  CONDITION_FIELD_INFO,
  CONDITION_OPERATOR_INFO,
  TRIGGER_INFO,
  WorkflowAction,
  WorkflowActionType,
  WorkflowConditionField,
  WorkflowConditionOperator,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRun,
  WorkflowTrigger,
  newWorkflowId,
  workflowGraphFor,
  workflowWithGraph,
} from '../lib/automation'
import { QuorlythGlyph } from './QuorlythGlyph'
import '../styles/workflow-canvas.css'

type ProjectOption = { id: string; title: string }
type RunStatus = 'running' | 'success' | 'failed' | 'skipped'
type PlacedNode = WorkflowNode extends infer Node ? Node extends WorkflowNode ? Omit<Node, 'position'> & { position: { x: number; y: number } } : never : never
type DragState = { id: string; pointerId: number; startX: number; startY: number; originX: number; originY: number }

const NODE_WIDTH = 250
const NODE_HEIGHT = 126
const TRIGGER_WIDTH = 260
const CONDITION_WIDTH = 270

function newAction(type: WorkflowActionType): WorkflowAction {
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

function positionedNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): PlacedNode[] {
  const trigger = nodes.find(node => node.type === 'trigger')
  const condition = nodes.find(node => node.type === 'condition')
  const actionNodes = nodes.filter((node): node is Extract<WorkflowNode, { type: 'action' }> => node.type === 'action')
  const firstActionFor = (handle: 'true' | 'false' | 'next') => {
    const sourceId = condition?.id || trigger?.id
    const edge = edges.find(item => item.source === sourceId && item.sourceHandle === handle)
    return edge?.target || ''
  }
  const collect = (firstId: string) => {
    const chain: string[] = []
    let id = firstId
    while (id && !chain.includes(id)) {
      chain.push(id)
      id = edges.find(edge => edge.source === id && edge.sourceHandle === 'next')?.target || ''
    }
    return chain
  }
  const trueChain = collect(firstActionFor(condition ? 'true' : 'next'))
  const falseChain = condition ? collect(firstActionFor('false')) : []
  const positions = new Map<string, { x: number; y: number }>()
  if (trigger) positions.set(trigger.id, { x: 60, y: condition ? 230 : 255 })
  if (condition) positions.set(condition.id, { x: 390, y: 230 })
  if (condition) {
    trueChain.forEach((id, index) => positions.set(id, { x: 790, y: 65 + index * 175 }))
    falseChain.forEach((id, index) => positions.set(id, { x: 790, y: 430 + index * 175 }))
  } else {
    trueChain.forEach((id, index) => positions.set(id, { x: 570, y: 220 + index * 175 }))
  }
  // Unconnected nodes remain visible so the user can reconnect them.
  actionNodes.forEach((node, index) => {
    if (!positions.has(node.id)) positions.set(node.id, { x: 790, y: 620 + index * 150 })
  })
  return nodes.map(node => {
    const fallback = positions.get(node.id) || { x: 60, y: 230 }
    return { ...node, position: node.position || fallback } as PlacedNode
  })
}

function branchActions(nodes: WorkflowNode[], edges: WorkflowEdge[], branch: 'true' | 'false' | 'next') {
  const condition = nodes.find(node => node.type === 'condition')
  const trigger = nodes.find(node => node.type === 'trigger')
  const start = edges.find(edge => edge.source === (condition?.id || trigger?.id) && edge.sourceHandle === branch)?.target || ''
  const output: Extract<WorkflowNode, { type: 'action' }>[] = []
  const seen = new Set<string>()
  let current = start
  while (current && !seen.has(current)) {
    seen.add(current)
    const node = nodes.find(item => item.id === current)
    if (!node || node.type !== 'action') break
    output.push(node)
    current = edges.find(edge => edge.source === current && edge.sourceHandle === 'next')?.target || ''
  }
  return output
}

function edgePath(source: PlacedNode, target: PlacedNode, handle: string) {
  const sourceWidth = source.type === 'trigger' ? TRIGGER_WIDTH : source.type === 'condition' ? CONDITION_WIDTH : NODE_WIDTH
  const sourceX = source.position.x + sourceWidth
  const sourceY = source.position.y + (source.type === 'condition' ? handle === 'false' ? 112 : 62 : NODE_HEIGHT / 2)
  const targetX = target.position.x
  const targetY = target.position.y + NODE_HEIGHT / 2
  const curve = Math.max(70, Math.abs(targetX - sourceX) * 0.45)
  return { d: `M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`, sourceX, sourceY, targetX, targetY }
}

function statusClass(status?: RunStatus) {
  return status ? ' is-' + status : ''
}

function NodeSymbol({ node }: { node: WorkflowNode }) {
  if (node.type === 'trigger') return <QuorlythGlyph name="start" size={18} />
  if (node.type === 'condition') return <QuorlythGlyph name="sliders" size={18} />
  return <QuorlythGlyph name={node.action.type === 'create_task' ? 'workspace' : node.action.type === 'webhook' ? 'send' : 'bell'} size={18} />
}

export function WorkflowCanvas({
  workflow,
  projects,
  latestRun,
  onChange,
}: {
  workflow: WorkflowDefinition
  projects: ProjectOption[]
  latestRun?: WorkflowRun | null
  onChange: (workflow: WorkflowDefinition) => void
}) {
  const graph = useMemo(() => workflowGraphFor(workflow), [workflow])
  const [selectedId, setSelectedId] = useState<string>(graph.nodes[0]?.id || '')
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<DragState | null>(null)
  const nodes = useMemo(() => positionedNodes(graph.nodes, graph.edges), [graph.nodes, graph.edges])
  const selected = nodes.find(node => node.id === selectedId) || nodes[0]
  const condition = nodes.find((node): node is Extract<PlacedNode, { type: 'condition' }> => node.type === 'condition')
  const trigger = nodes.find((node): node is Extract<PlacedNode, { type: 'trigger' }> => node.type === 'trigger')
  const trueActions = branchActions(nodes, graph.edges, condition ? 'true' : 'next')
  const falseActions = condition ? branchActions(nodes, graph.edges, 'false') : []
  const latestSteps = new Map((latestRun?.steps || []).map(step => [step.nodeId || step.id, step]))
  const hasCondition = Boolean(condition)
  const canvasHeight = Math.max(720, (Math.max(trueActions.length, falseActions.length) * 175) + 560)
  const canvasWidth = hasCondition ? 1220 : 1040
  const displayNodes = nodes.map(node => ({
    ...node,
    position: node.position || { x: 60, y: 230 },
  })) as PlacedNode[]

  function commit(nextNodes: WorkflowNode[], nextEdges: WorkflowEdge[]) {
    onChange(workflowWithGraph(workflow, nextNodes, nextEdges))
  }

  function updateNode(id: string, patch: Partial<WorkflowNode>) {
    commit(nodes.map(node => node.id === id ? { ...node, ...patch } as WorkflowNode : node), graph.edges)
  }

  function updateAction(id: string, patch: Partial<WorkflowAction>) {
    const target = nodes.find(node => node.id === id)
    if (!target || target.type !== 'action') return
    updateNode(id, { action: { ...target.action, ...patch } } as Partial<WorkflowNode>)
  }

  function addDecision() {
    if (condition || !trigger) return
    const existingEdge = graph.edges.find(edge => edge.source === trigger.id && edge.sourceHandle === 'next')
    const decisionId = newWorkflowId()
    const nextNodes: WorkflowNode[] = [...nodes, {
      id: decisionId, type: 'condition', field: 'text', operator: 'contains',
      value: 'idea', position: { x: 390, y: 230 },
    }]
    const nextEdges = graph.edges.filter(edge => edge.id !== existingEdge?.id)
    nextEdges.push({ id: newWorkflowId(), source: trigger.id, target: decisionId, sourceHandle: 'next' })
    if (existingEdge) {
      nextEdges.push({ ...existingEdge, id: newWorkflowId(), source: decisionId, sourceHandle: 'true', label: 'true' })
    }
    const truePath = branchActions(nextNodes, nextEdges, 'true')
    const arrangedNodes = nextNodes.map(node => {
      if (node.type !== 'action') return node
      const index = truePath.findIndex(actionNode => actionNode.id === node.id)
      return index < 0 ? node : { ...node, position: { x: 790, y: 65 + index * 175 } }
    })
    commit(arrangedNodes, nextEdges)
    setSelectedId(decisionId)
  }

  function addAction(branch: 'true' | 'false' | 'next', type: WorkflowActionType) {
    const startNode = condition || trigger
    if (!startNode) return
    const chain = branchActions(nodes, graph.edges, branch)
    const action = newAction(type)
    const node: WorkflowNode = { id: action.id, type: 'action', action, position: { x: hasCondition ? 790 : 570, y: hasCondition ? (branch === 'false' ? 430 : 65) + (chain.length * 175) : 220 + (chain.length * 175) } }
    const nextEdges = [...graph.edges]
    const tail = chain[chain.length - 1]
    nextEdges.push({
      id: newWorkflowId(),
      source: tail?.id || startNode.id,
      target: action.id,
      sourceHandle: tail ? 'next' : branch,
      ...(condition && !tail ? { label: branch } : {}),
    })
    commit([...nodes, node], nextEdges)
    setSelectedId(action.id)
  }

  function removeAction(id: string) {
    const incoming = graph.edges.find(edge => edge.target === id)
    const outgoing = graph.edges.find(edge => edge.source === id)
    const remainingEdges = graph.edges.filter(edge => edge.target !== id && edge.source !== id)
    if (incoming && outgoing) {
      remainingEdges.push({
        id: newWorkflowId(),
        source: incoming.source,
        target: outgoing.target,
        sourceHandle: incoming.sourceHandle,
        ...(incoming.label ? { label: incoming.label } : {}),
      })
    }
    const remainingNodes = nodes.filter(node => node.id !== id)
    commit(remainingNodes, remainingEdges)
    setSelectedId(remainingNodes[0]?.id || '')
  }

  function updateTrigger(value: WorkflowTrigger) {
    if (!trigger) return
    updateNode(trigger.id, { trigger: value } as Partial<WorkflowNode>)
  }

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>, node: PlacedNode) {
    if ((event.target as HTMLElement).closest('button, input, select, textarea')) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedId(node.id)
    setDrag({
      id: node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.position.x,
      originY: node.position.y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return
    const moved = nodes.map(node => node.id === drag.id
      ? { ...node, position: { x: Math.max(24, Math.round(drag.originX + (event.clientX - drag.startX) / zoom)), y: Math.max(24, Math.round(drag.originY + (event.clientY - drag.startY) / zoom)) } }
      : node)
    onChange(workflowWithGraph(workflow, moved, graph.edges))
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag?.pointerId === event.pointerId) setDrag(null)
  }

  function nodeStyle(node: PlacedNode): CSSProperties {
    const width = node.type === 'trigger' ? TRIGGER_WIDTH : node.type === 'condition' ? CONDITION_WIDTH : NODE_WIDTH
    return { left: node.position.x, top: node.position.y, width }
  }

  function runStatus(id: string) {
    return latestSteps.get(id)?.status as RunStatus | undefined
  }

  return (
    <div className="wfc-root">
      <div className="wfc-meta-row">
        <label className="wfc-workflow-name"><span>Workflow name</span><input value={workflow.name} onChange={event => onChange({ ...workflow, name: event.target.value, updatedAt: Date.now() })} maxLength={100} required placeholder="e.g. Review every new idea" /></label>
        <label className="wfc-workflow-description"><span>Purpose</span><input value={workflow.description} onChange={event => onChange({ ...workflow, description: event.target.value })} maxLength={500} placeholder="What should this automation do?" /></label>
        <div className="wfc-active-switch"><span>{workflow.status === 'active' ? 'Active' : 'Draft'}</span><input type="checkbox" checked={workflow.status === 'active'} onChange={event => onChange({ ...workflow, status: event.target.checked ? 'active' : 'draft' })} /><i /></div>
      </div>

      <div className="wfc-workspace">
        <section className="wfc-canvas-column">
          <header className="wfc-canvas-toolbar">
            <div><span className="wfc-live-indicator" /><strong>VISUAL WORKFLOW CANVAS</strong><small>{nodes.length} nodes · {graph.edges.length} connections</small></div>
            <div className="wfc-zoom-tools">
              <button type="button" onClick={() => setZoom(value => Math.max(.65, Number((value - .1).toFixed(2))))} aria-label="Zoom out">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom(value => Math.min(1.25, Number((value + .1).toFixed(2))))} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom"><QuorlythGlyph name="rotate" size={13} /></button>
            </div>
          </header>

          <div className="wfc-canvas-viewport">
            <div
              className="wfc-canvas-inner"
              style={{ width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
            >
              <svg className="wfc-edges" width={canvasWidth} height={canvasHeight} aria-hidden="true">
                {graph.edges.map(edge => {
                  const source = displayNodes.find(node => node.id === edge.source)
                  const target = displayNodes.find(node => node.id === edge.target)
                  if (!source || !target) return null
                  const path = edgePath(source, target, edge.sourceHandle)
                  const step = latestSteps.get(target.id)
                  const edgeClass = step?.status === 'success' ? 'is-success' : step?.status === 'failed' ? 'is-failed' : step?.status === 'running' ? 'is-running' : ''
                  const middleX = (path.sourceX + path.targetX) / 2
                  return <g key={edge.id} className={'wfc-edge ' + edgeClass}>
                    <path d={path.d} />
                    <circle cx={path.targetX} cy={path.targetY} r="4" />
                    {edge.label && <text x={middleX} y={path.sourceY - 10}>{edge.label}</text>}
                  </g>
                })}
              </svg>
              {displayNodes.map(node => {
                const status = runStatus(node.id)
                const title = node.type === 'trigger' ? TRIGGER_INFO[node.trigger].title
                  : node.type === 'condition' ? 'Decision · ' + (node.value || 'Set a condition')
                    : node.action.title || ACTION_INFO[node.action.type].title
                const subtitle = node.type === 'trigger' ? 'Quorlyth event'
                  : node.type === 'condition' ? CONDITION_OPERATOR_INFO[node.operator] + ' ' + (node.value || '…')
                    : node.action.type === 'webhook' ? 'HTTPS request'
                      : node.action.type === 'create_task' ? 'Workspace action' : 'In-app notification'
                const label = node.type === 'trigger' ? 'TRIGGER'
                  : node.type === 'condition' ? 'IF / ELSE ROUTER'
                    : node.action.type === 'webhook' ? 'WEBHOOK'
                      : node.action.type === 'create_task' ? 'WORKSPACE ACTION' : 'NOTIFICATION ACTION'
                return <div
                  key={node.id}
                  className={'wfc-node wfc-node-' + node.type + statusClass(status) + (selected?.id === node.id ? ' is-selected' : '')}
                  style={nodeStyle(node)}
                  onPointerDown={event => handleDragStart(event, node)}
                  onClick={() => setSelectedId(node.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id) }}
                >
                  <div className="wfc-node-top"><span className="wfc-node-kind">{label}</span><span className="wfc-node-status">{status || (node.type === 'trigger' ? 'LISTENING' : node.type === 'condition' ? 'ROUTER' : 'READY')}</span></div>
                  <div className="wfc-node-main"><span className="wfc-node-icon"><NodeSymbol node={node} /></span><div><strong>{title}</strong><small>{subtitle}</small></div></div>
                  {node.type === 'trigger' && <div className="wfc-node-foot"><span>Event source</span><span className="wfc-port wfc-port-output" /></div>}
                  {node.type === 'condition' && <div className="wfc-condition-ports"><span className="wfc-port-label true">true <i /></span><span className="wfc-port-label false">false <i /></span></div>}
                  {node.type === 'action' && <div className="wfc-node-foot"><span>{node.action.type === 'webhook' ? 'POST request' : node.action.type === 'create_task' ? 'Create record' : 'Save notification'}</span><span className="wfc-port wfc-port-output" /></div>}
                  <span className="wfc-port wfc-port-input" />
                </div>
              })}
            </div>
          </div>

          <div className="wfc-node-palette">
            <div><p>ADD TO CANVAS</p><small>Connect real Quorlyth steps to your flow.</small></div>
            {!condition && <button type="button" onClick={addDecision}><QuorlythGlyph name="sliders" size={15} />Decision</button>}
            <button type="button" onClick={() => addAction(condition ? 'true' : 'next', 'notify')}><QuorlythGlyph name="bell" size={15} />Notify</button>
            <button type="button" onClick={() => addAction(condition ? 'true' : 'next', 'create_task')}><QuorlythGlyph name="workspace" size={15} />Create task</button>
            <button type="button" onClick={() => addAction(condition ? 'true' : 'next', 'webhook')}><QuorlythGlyph name="send" size={15} />Webhook</button>
            {condition && <><span className="wfc-palette-divider" /><button type="button" className="wfc-false-add" onClick={() => addAction('false', 'notify')}>+ False route</button></>}
          </div>
          <p className="wfc-canvas-hint"><QuorlythGlyph name="arrow-up-right" size={13} /> Drag nodes to arrange your canvas. Select a node to edit its configuration. Live execution states appear on the same nodes.</p>
        </section>

        <aside className="wfc-inspector">
          <div className="wfc-inspector-heading"><div><p>NODE CONFIGURATION</p><h3>{selected?.type === 'trigger' ? 'Trigger settings' : selected?.type === 'condition' ? 'Decision settings' : 'Action settings'}</h3></div><span className="wfc-inspector-live">{runStatus(selected?.id || '') || 'EDITING'}</span></div>
          {!selected ? <p className="wfc-muted">Choose a node to inspect its settings.</p> : selected.type === 'trigger' ? <>
            <label className="wfc-field"><span>Start when</span><select value={selected.trigger} onChange={event => updateTrigger(event.target.value as WorkflowTrigger)}>{(Object.keys(TRIGGER_INFO) as WorkflowTrigger[]).map(type => <option value={type} key={type}>{TRIGGER_INFO[type].title}</option>)}</select></label>
            <p className="wfc-description">{TRIGGER_INFO[selected.trigger].description}</p>
            <div className="wfc-info-block"><QuorlythGlyph name="live" size={16} /><div><strong>Realtime event listener</strong><p>When Quorlyth is open, this trigger listens for matching Supabase Realtime changes in data your account can access.</p></div></div>
          </> : selected.type === 'condition' ? <>
            <label className="wfc-field"><span>Check this value</span><select value={selected.field} onChange={event => updateNode(selected.id, { field: event.target.value as WorkflowConditionField } as Partial<WorkflowNode>)}>{(Object.keys(CONDITION_FIELD_INFO) as WorkflowConditionField[]).map(field => <option value={field} key={field}>{CONDITION_FIELD_INFO[field]}</option>)}</select></label>
            <label className="wfc-field"><span>Operator</span><select value={selected.operator} onChange={event => updateNode(selected.id, { operator: event.target.value as WorkflowConditionOperator } as Partial<WorkflowNode>)}>{(Object.keys(CONDITION_OPERATOR_INFO) as WorkflowConditionOperator[]).map(operator => <option value={operator} key={operator}>{CONDITION_OPERATOR_INFO[operator]}</option>)}</select></label>
            <label className="wfc-field"><span>Compare against</span><input value={selected.value} onChange={event => updateNode(selected.id, { value: event.target.value } as Partial<WorkflowNode>)} maxLength={120} placeholder="e.g. urgent, bug, approved" /></label>
            <div className="wfc-route-legend"><span className="true"><i />True route <small>{trueActions.length} action{trueActions.length === 1 ? '' : 's'}</small></span><span className="false"><i />False route <small>{falseActions.length} action{falseActions.length === 1 ? '' : 's'}</small></span></div>
            <p className="wfc-description">Only the matching route executes. The other route is left untouched and shown in the run details.</p>
          </> : <>
            <label className="wfc-field"><span>Action type</span><select value={selected.action.type} onChange={event => {
              const type = event.target.value as WorkflowActionType
              const replacement = newAction(type)
              updateAction(selected.id, { ...replacement, id: selected.id })
            }}>{(Object.keys(ACTION_INFO) as WorkflowActionType[]).map(type => <option value={type} key={type}>{ACTION_INFO[type].title}</option>)}</select></label>
            <label className="wfc-field"><span>Node label</span><input value={selected.action.title} onChange={event => updateAction(selected.id, { title: event.target.value })} maxLength={100} /></label>
            {selected.action.type === 'notify' && <label className="wfc-field"><span>Notification message</span><textarea value={selected.action.message || ''} onChange={event => updateAction(selected.id, { message: event.target.value })} rows={4} maxLength={1000} placeholder="New event: {{event.title}}" /></label>}
            {selected.action.type === 'create_task' && <>
              <label className="wfc-field"><span>Target workspace</span><select required value={selected.action.projectId || ''} onChange={event => updateAction(selected.id, { projectId: event.target.value })}><option value="">Select a workspace…</option>{projects.map(project => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
              {!projects.length && <p className="wfc-description">Create or manage a workspace before adding this action.</p>}
              <label className="wfc-field"><span>Task title</span><input value={selected.action.taskTitle || ''} onChange={event => updateAction(selected.id, { taskTitle: event.target.value })} maxLength={140} placeholder="Follow up: {{event.title}}" /></label>
              <label className="wfc-field"><span>Task description</span><textarea value={selected.action.taskDescription || ''} onChange={event => updateAction(selected.id, { taskDescription: event.target.value })} rows={3} maxLength={2000} /></label>
              <label className="wfc-field"><span>Definition of done</span><textarea value={selected.action.acceptanceCriteria || ''} onChange={event => updateAction(selected.id, { acceptanceCriteria: event.target.value })} rows={2} maxLength={1000} /></label>
            </>}
            {selected.action.type === 'webhook' && <label className="wfc-field"><span>HTTPS endpoint</span><input type="url" value={selected.action.url || ''} onChange={event => updateAction(selected.id, { url: event.target.value })} placeholder="https://your-service.com/webhooks/quorlyth" /><small>Only an HTTPS POST is sent. No account secrets or API keys are included.</small></label>}
            <div className="wfc-info-block"><QuorlythGlyph name="lock" size={16} /><div><strong>Runs with your permissions</strong><p>Task creation is still checked by your workspace access and Supabase row-level security.</p></div></div>
            <button className="wfc-remove-node" type="button" onClick={() => removeAction(selected.id)}><QuorlythGlyph name="trash" size={14} />Remove this action</button>
          </>}
          <div className="wfc-inspector-footer"><span>Live status</span><strong className={runStatus(selected?.id || '') ? 'is-' + runStatus(selected?.id || '') : ''}>{runStatus(selected?.id || '') || 'Waiting for next run'}</strong></div>
        </aside>
      </div>
    </div>
  )
}
