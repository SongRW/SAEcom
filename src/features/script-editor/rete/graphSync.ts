import type { GraphEditorState } from '@/features/script-editor/rete/graphState'

export type GraphSyncKind = 'none' | 'node-data' | 'node-position' | 'structure'

export interface GraphSyncPlan {
  kind: GraphSyncKind
  changedNodeIds: string[]
}

export function classifyGraphSync(
  previous: GraphEditorState | null,
  next: GraphEditorState
): GraphSyncPlan {
  if (!previous) return { kind: 'structure', changedNodeIds: [] }
  if (JSON.stringify(graphTopology(previous)) !== JSON.stringify(graphTopology(next))) {
    return { kind: 'structure', changedNodeIds: [] }
  }

  const previousData = new Map(previous.nodes.map((node) => [node.id, JSON.stringify(node.data)]))
  const changedNodeIds = next.nodes
    .filter((node) => previousData.get(node.id) !== JSON.stringify(node.data))
    .map((node) => node.id)

  if (changedNodeIds.length > 0) {
    if (changedNodeIds.some((id) => hasCustomControlDataChange(previous, next, id))) {
      return { kind: 'structure', changedNodeIds: [] }
    }
    return { kind: 'node-data', changedNodeIds }
  }

  const changedPositionIds = next.nodes
    .filter((node) => {
      const previousNode = previous.nodes.find((candidate) => candidate.id === node.id)
      return previousNode?.position.x !== node.position.x || previousNode.position.y !== node.position.y
    })
    .map((node) => node.id)

  return changedPositionIds.length > 0
    ? { kind: 'node-position', changedNodeIds: changedPositionIds }
    : { kind: 'none', changedNodeIds: [] }
}

function graphTopology(graph: GraphEditorState) {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      key: node.key,
      // label 不属于拓扑：label 变化不改变节点 key、端口或连线，
      // 只需更新画布 DOM 标题（updateNodeLabelDisplay），不应触发结构同步。
      inputs: node.inputs,
      outputs: node.outputs
    })),
    connections: graph.connections
  }
}

function hasCustomControlDataChange(
  previous: GraphEditorState,
  next: GraphEditorState,
  nodeId: string
): boolean {
  const previousNode = previous.nodes.find((node) => node.id === nodeId)
  const nextNode = next.nodes.find((node) => node.id === nodeId)
  if (!previousNode || !nextNode) return true

  // 对象（transform-object）/ 位域（protocol-bitfield）：字段表变化 → 端口结构变化
  if (previousNode.data.keys !== nextNode.data.keys) return true
  if (previousNode.data.fields !== nextNode.data.fields) return true
  // 拼接（protocol-concat / string-concat）：端口数变化 → 端口结构变化
  if ((nextNode.key === 'protocol-concat' || nextNode.key === 'string-concat')
    && previousNode.data.ports !== nextNode.data.ports) return true

  return false
}
