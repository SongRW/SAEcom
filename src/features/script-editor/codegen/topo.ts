import type { ReteGraphNode } from '@shared/types'
import { nodeId, type NormalizedGraph } from '@/features/script-editor/codegen/graph'

export function topologicalSort(graph: NormalizedGraph): string[] {
  const visited = new Set<string>()
  const inProgress = new Set<string>()
  const result: string[] = []

  const visit = (id: string) => {
    if (visited.has(id)) return
    if (inProgress.has(id)) return

    inProgress.add(id)
    const deps = graph.incomingByNode.get(id) || []
    deps.forEach((connection) => visit(nodeId(connection.source)))
    inProgress.delete(id)
    visited.add(id)
    result.push(id)
  }

  graph.nodes.forEach((node: ReteGraphNode) => visit(nodeId(node.id)))

  return result
}
