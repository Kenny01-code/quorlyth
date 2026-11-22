import { WorkflowEdge, WorkflowNode } from './automation'

export type PositionedWorkflowNode = WorkflowNode & { position: { x: number; y: number } }

export const WORKFLOW_NODE_SIZE = {
  trigger: { width: 260, height: 126 },
  condition: { width: 270, height: 126 },
  action: { width: 250, height: 126 },
} as const

function actionChain(nodes: WorkflowNode[], edges: WorkflowEdge[], firstId: string) {
  const chain: string[] = []
  const seen = new Set<string>()
  let id = firstId
  while (id && !seen.has(id)) {
    seen.add(id)
    const node = nodes.find(item => item.id === id)
    if (!node || node.type !== 'action') break
    chain.push(id)
    id = edges.find(edge => edge.source === id && edge.sourceHandle === 'next')?.target || ''
  }
  return chain
}

/** Shared editor/map positions so the saved canvas and connected map cannot drift apart. */
export function positionWorkflowNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): PositionedWorkflowNode[] {
  const trigger = nodes.find(node => node.type === 'trigger')
  const condition = nodes.find(node => node.type === 'condition')
  const firstFor = (handle: 'true' | 'false' | 'next') => edges.find(edge =>
    edge.source === (condition?.id || trigger?.id) && edge.sourceHandle === handle,
  )?.target || ''
  const main = actionChain(nodes, edges, firstFor(condition ? 'true' : 'next'))
  const alternate = condition ? actionChain(nodes, edges, firstFor('false')) : []
  const fallback = new Map<string, { x: number; y: number }>()
  if (trigger) fallback.set(trigger.id, { x: 60, y: condition ? 230 : 255 })
  if (condition) fallback.set(condition.id, { x: 390, y: 230 })
  if (condition) {
    main.forEach((id, index) => fallback.set(id, { x: 790, y: 65 + index * 175 }))
    alternate.forEach((id, index) => fallback.set(id, { x: 790, y: 430 + index * 175 }))
  } else {
    main.forEach((id, index) => fallback.set(id, { x: 570, y: 220 + index * 175 }))
  }
  let extraIndex = 0
  for (const node of nodes) {
    if (node.type === 'action' && !fallback.has(node.id)) {
      fallback.set(node.id, { x: 790, y: 620 + extraIndex * 150 })
      extraIndex += 1
    }
  }
  return nodes.map(node => ({ ...node, position: node.position || fallback.get(node.id) || { x: 60, y: 230 } })) as PositionedWorkflowNode[]
}

export function workflowNodeSize(node: WorkflowNode) {
  return WORKFLOW_NODE_SIZE[node.type]
}

export function workflowCanvasSize(nodes: PositionedWorkflowNode[]) {
  const width = Math.max(1040, ...nodes.map(node => node.position.x + workflowNodeSize(node).width + 100))
  const height = Math.max(720, ...nodes.map(node => node.position.y + workflowNodeSize(node).height + 100))
  return { width, height }
}

export function workflowEdgePath(source: PositionedWorkflowNode, target: PositionedWorkflowNode, handle: string) {
  const sourceSize = workflowNodeSize(source)
  const targetSize = workflowNodeSize(target)
  const sourceX = source.position.x + sourceSize.width
  const sourceY = source.position.y + (source.type === 'condition' ? handle === 'false' ? 112 : 62 : sourceSize.height / 2)
  const targetX = target.position.x
  const targetY = target.position.y + targetSize.height / 2
  const curve = Math.max(70, Math.abs(targetX - sourceX) * .45)
  return {
    d: `M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY}, ${targetX - curve} ${targetY}, ${targetX} ${targetY}`,
    sourceX,
    sourceY,
    targetX,
    targetY,
  }
}
