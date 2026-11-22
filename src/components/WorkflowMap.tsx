import { useMemo } from 'react'
import {
  ACTION_INFO,
  CONDITION_FIELD_INFO,
  CONDITION_OPERATOR_INFO,
  TRIGGER_INFO,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowRun,
  workflowGraphFor,
} from '../lib/automation'
import { QuorlythGlyph } from './QuorlythGlyph'
import { positionWorkflowNodes, workflowCanvasSize, workflowEdgePath, workflowNodeSize } from '../lib/workflowLayout'
import '../styles/workflow-map.css'

type RunRecord = WorkflowRun & { workflowId?: string; workflowName?: string }
function graphLayout(workflow: WorkflowDefinition) {
  const { nodes, edges } = workflowGraphFor(workflow)
  const positioned = positionWorkflowNodes(nodes, edges)
  const size = workflowCanvasSize(positioned)
  const condition = positioned.find(node => node.type === 'condition')
  const hasFalseRoute = Boolean(condition && edges.some(edge => edge.source === condition.id && edge.sourceHandle === 'false'))
  return { nodes: positioned, edges, height: size.height, width: size.width, hasCondition: Boolean(condition), hasFalseRoute }
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
                      const path = workflowEdgePath(source, target, edge.sourceHandle)
                      return <g key={edge.id} className={'wa-map-edge ' + (state ? 'is-' + state : '')}>
                        <path d={path.d} />
                        <circle cx={path.targetX} cy={path.targetY} r="4" />
                        {edge.label && <text x={(path.sourceX + path.targetX) / 2} y={path.sourceY - 10}>{edge.label}</text>}
                      </g>
                    })}
                  </svg>
                  {graph.nodes.map(node => {
                    const info = nodeText(node)
                    const status = stepById.get(node.id)
                    return <div
                      key={node.id}
                      className={'wa-map-graph-node ' + 'is-' + node.type + (status ? ' is-' + status.status : '')}
                      style={{ left: node.position.x, top: node.position.y, width: workflowNodeSize(node).width, minHeight: workflowNodeSize(node).height }}
                    >
                      <div className="wa-map-graph-top"><span>{info.kind}</span><b>{status?.status ? status.status.toUpperCase() : node.type === 'trigger' ? 'LISTENING' : 'READY'}</b></div>
                      <div className="wa-map-graph-main"><i>{nodeIcon(node)}</i><div><strong>{info.title}</strong><p>{info.detail}</p></div></div>
                      {node.type === 'condition' && <div className="wa-map-graph-branches"><span className="true">true</span><span className="false">false</span></div>}
                    </div>
                  })}
                  {graph.hasCondition && !graph.hasFalseRoute && <div className="wa-map-empty-route" style={{ left: 790, top: 430 }}>False route has no action connected yet</div>}
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
