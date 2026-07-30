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
      label: node.label,
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

  return previousNode.data.keys !== nextNode.data.keys || previousNode.data.fields !== nextNode.data.fields
}
