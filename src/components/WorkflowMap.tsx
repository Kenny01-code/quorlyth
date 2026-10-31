import { useMemo } from 'react'
import {
  ACTION_INFO,
  CONDITION_FIELD_INFO,
  CONDITION_OPERATOR_INFO,
  TRIGGER_INFO,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRun,
  workflowGraphFor,
} from '../lib/automation'
import { QuorlythGlyph } from './QuorlythGlyph'
import '../styles/workflow-map.css'

type RunRecord = WorkflowRun & { workflowId?: string; workflowName?: string }
type PositionedNode = WorkflowNode & { x: number; y: number }

const NODE_W = 228
const NODE_H = 96

function actionChain(nodes: WorkflowNode[], edges: WorkflowEdge[], first: string) {
  const result: WorkflowNode[] = []
  const visited = new Set<string>()
  let current = first
  while (current && !visited.has(current)) {
    visited.add(current)
    const node = nodes.find(item => item.id === current)
    if (!node || node.type !== 'action') break
    result.push(node)
    current = edges.find(edge => edge.source === current && edge.sourceHandle === 'next')?.target || ''
  }
  return result
}

function graphLayout(workflow: WorkflowDefinition) {
  const { nodes, edges } = workflowGraphFor(workflow)
  const trigger = nodes.find(node => node.type === 'trigger')
  const condition = nodes.find(node => node.type === 'condition')
  const first = (source: WorkflowNode | undefined, handle: 'next' | 'true' | 'false') =>
    edges.find(edge => edge.source === source?.id && edge.sourceHandle === handle)?.target || ''
  const main = actionChain(nodes, edges, first(condition || trigger, condition ? 'true' : 'next'))
  const alternate = condition ? actionChain(nodes, edges, first(condition, 'false')) : []
  const placed = new Map<string, PositionedNode>()
  if (trigger) placed.set(trigger.id, { ...trigger, x: 35, y: condition ? 170 : 170 })
  if (condition) placed.set(condition.id, { ...condition, x: 335, y: 170 })
  if (condition) {
    main.forEach((node, index) => placed.set(node.id, { ...node, x: 700, y: 40 + index * 132 }))
    alternate.forEach((node, index) => placed.set(node.id, { ...node, x: 700, y: 355 + index * 132 }))
  } else {
    main.forEach((node, index) => placed.set(node.id, { ...node, x: 440, y: 170 + index * 132 }))
  }
  const extras = nodes.filter(node => node.type === 'action' && !placed.has(node.id))
  extras.forEach((node, index) => placed.set(node.id, { ...node, x: 700, y: 650 + index * 132 }))
  const maxY = Math.max(470, ...[...placed.values()].map(node => node.y + NODE_H + 35))
  return { nodes: [...placed.values()], edges, height: maxY, width: condition ? 990 : 760, hasCondition: Boolean(condition), trueCount: main.length, falseCount: alternate.length }
}

function nodeText(node: WorkflowNode) {
  if (node.type === 'trigger') return { kind: 'TRIGGER', title: TRIGGER_INFO[node.trigger]?.title || node.trigger, detail: TRIGGER_INFO[node.trigger]?.description || '' }
  if (node.type === 'condition') return {
    kind: 'DECISION ROUTER',
    title: (CONDITION_FIELD_INFO[node.field] || 'Event text') + ' ' + (CONDITION_OPERATOR_INFO[node.operator] || node.operator),
    detail: node.value || 'Condition has not been configured.',
  }
  return {
    kind: 'ACTION',
    title: node.action.title || ACTION_INFO[node.action.type]?.title || 'Action',
    detail: node.action.type === 'notify' ? node.action.message || 'Save an in-app notification.'
      : node.action.type === 'create_task' ? node.action.taskTitle || 'Create a workspace task'
        : node.action.url || 'Send a secured HTTPS webhook.',
  }
}

function nodeIcon(node: WorkflowNode) {
  if (node.type === 'trigger') return <QuorlythGlyph name="start" size={15} />
  if (node.type === 'condition') return <QuorlythGlyph name="sliders" size={15} />
  return <QuorlythGlyph name={node.action.type === 'create_task' ? 'workspace' : node.action.type === 'webhook' ? 'send' : 'bell'} size={15} />
}

function curve(source: PositionedNode, target: PositionedNode, handle: string) {
  const sourceWidth = source.type === 'trigger' ? 260 : source.type === 'condition' ? 270 : NODE_W
  const sx = source.x + sourceWidth
  const sy = source.y + (source.type === 'condition' ? handle === 'false' ? 75 : 30 : NODE_H / 2)
  const tx = target.x
  const ty = target.y + NODE_H / 2
  const bend = Math.max(55, Math.abs(tx - sx) * .42)
  return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`
}

export function WorkflowMap({ workflows, runs }: { workflows: WorkflowDefinition[]; runs: RunRecord[] }) {
  const mapped = useMemo(() => workflows.slice().sort((a, b) => a.name.localeCompare(b.name)).map(workflow => ({
    workflow,
    graph: graphLayout(workflow),
    latest: runs.find(run => run.workflowId === workflow.id) || workflow.runHistory?.[0] || null,
  })), [workflows, runs])

  return (
    <section className="wa-map-section wa-map-live-section" aria-label="Workflow structure map">
      <div className="wa-section-title">
        <div><p className="wa-eyebrow">CONNECTED WORKFLOW MAP</p><h3>See how every flow is wired.</h3><p>The map mirrors the executable nodes and connections in your workflow. Node borders and moving connection lines update as actions run.</p></div>
        <span className="wa-template-count">{workflows.length} flow{workflows.length === 1 ? '' : 's'} mapped</span>
      </div>
      {!mapped.length ? <div className="wa-map-empty">Save a workflow to see its connected node map here.</div> : (
        <div className="wa-map-list">
          {mapped.map(({ workflow, graph, latest }) => {
            const stepById = new Map((latest?.steps || []).map(step => [step.nodeId || step.id, step]))
            return <article className="wa-map-card wa-map-live-card" key={workflow.id}>
              <header className="wa-map-header">
                <div><strong>{workflow.name}</strong><p>{workflow.description || 'No description added.'}</p></div>
                <div className="wa-map-header-state">
                  {latest?.status === 'running' && <span className="wa-map-running"><i />RUNNING</span>}
                  <span className={'wa-map-status ' + workflow.status}>{workflow.status === 'active' ? 'Active' : 'Draft'}</span>
                </div>
              </header>
              <div className="wa-map-canvas-scroll">
                <div className="wa-map-canvas" style={{ width: graph.width, height: graph.height }}>
                  <svg className="wa-map-svg" width={graph.width} height={graph.height} aria-hidden="true">
                    {graph.edges.map(edge => {
                      const source = graph.nodes.find(node => node.id === edge.source)
                      const target = graph.nodes.find(node => node.id === edge.target)
                      if (!source || !target) return null
                      const targetStep = stepById.get(target.id)
                      const state = targetStep?.status || ''
                      return <g key={edge.id} className={'wa-map-edge ' + (state ? 'is-' + state : '')}>
                        <path d={curve(source, target, edge.sourceHandle)} />
                        <circle cx={target.x} cy={target.y + NODE_H / 2} r="3.5" />
                        {edge.label && <text x={(source.x + target.x) / 2 + 8} y={source.y + (edge.sourceHandle === 'false' ? 85 : 26)}>{edge.label}</text>}
                      </g>
                    })}
                  </svg>
                  {graph.nodes.map(node => {
                    const info = nodeText(node)
                    const status = stepById.get(node.id)
                    return <div
                      key={node.id}
                      className={'wa-map-graph-node ' + 'is-' + node.type + (status ? ' is-' + status.status : '')}
                      style={{ left: node.x, top: node.y, width: node.type === 'trigger' ? 260 : node.type === 'condition' ? 270 : NODE_W }}
                    >
                      <div className="wa-map-graph-top"><span>{info.kind}</span><b>{status?.status ? status.status.toUpperCase() : node.type === 'trigger' ? 'LISTENING' : 'READY'}</b></div>
                      <div className="wa-map-graph-main"><i>{nodeIcon(node)}</i><div><strong>{info.title}</strong><p>{info.detail}</p></div></div>
                      {node.type === 'condition' && <div className="wa-map-graph-branches"><span className="true">true</span><span className="false">false</span></div>}
                    </div>
                  })}
                  {graph.hasCondition && graph.falseCount === 0 && <div className="wa-map-empty-route" style={{ left: 700, top: 355 }}>False route has no action connected yet</div>}
                </div>
              </div>
              <footer className="wa-map-footer">
                <span>Last run: {latest ? latest.status.toUpperCase() : 'NOT RUN'}</span>
                <span>{graph.nodes.filter(node => node.type === 'action').length} action nodes</span>
                <span>{graph.hasCondition ? 'True / false routing enabled' : 'Linear trigger path'}</span>
                {latest?.startedAt ? <span>Started {new Date(latest.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> : null}
              </footer>
            </article>
          })}
        </div>
      )}
    </section>
  )
}
