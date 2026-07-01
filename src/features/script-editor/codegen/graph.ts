import type { ReteGraphConnection, ReteGraphExport, ReteGraphNode } from '@shared/types'
import { migrateNodeData } from '@/features/script-editor/panelConfig'

export interface NormalizedGraph {
  nodes: ReteGraphNode[]
  nodeMap: Map<string, ReteGraphNode>
  connections: ReteGraphConnection[]
  incomingByNode: Map<string, ReteGraphConnection[]>
  outgoingByNode: Map<string, ReteGraphConnection[]>
}

const toArray = <T>(value: T[] | Record<string, T> | undefined): T[] => {
  if (!value) return []
  return Array.isArray(value) ? value : Object.values(value)
}

export const nodeId = (id: string | number): string => String(id)

export function normalizeReteGraph(graph: ReteGraphExport): NormalizedGraph {
  const nodes = toArray(graph.nodes).map((node) => ({
    ...node,
    id: nodeId(node.id),
    data: migrateNodeData(node.key, node.data || {})
  }))
  const connections = toArray(graph.connections).map((connection) => ({
    ...connection,
    source: nodeId(connection.source),
    target: nodeId(connection.target)
  }))

  const nodeMap = new Map<string, ReteGraphNode>()
  const incomingByNode = new Map<string, ReteGraphConnection[]>()
  const outgoingByNode = new Map<string, ReteGraphConnection[]>()

  nodes.forEach((node) => {
    const id = nodeId(node.id)
    nodeMap.set(id, node)
    incomingByNode.set(id, [])
    outgoingByNode.set(id, [])
  })

  connections.forEach((connection) => {
    const source = nodeId(connection.source)
    const target = nodeId(connection.target)
    if (!nodeMap.has(source) || !nodeMap.has(target)) return
    outgoingByNode.get(source)?.push(connection)
    incomingByNode.get(target)?.push(connection)
  })

  return { nodes, nodeMap, connections, incomingByNode, outgoingByNode }
}

export function incomingForInput(graph: NormalizedGraph, node: ReteGraphNode, inputKey: string): ReteGraphConnection[] {
  return (graph.incomingByNode.get(nodeId(node.id)) || []).filter((connection) => connection.targetInput === inputKey)
}

export function outgoingForOutput(graph: NormalizedGraph, node: ReteGraphNode, outputKey: string): ReteGraphConnection[] {
  return (graph.outgoingByNode.get(nodeId(node.id)) || []).filter((connection) => connection.sourceOutput === outputKey)
}
