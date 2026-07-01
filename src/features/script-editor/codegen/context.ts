import type { NodeDef, ReteGraphNode } from '@shared/types'
import type { NormalizedGraph } from '@/features/script-editor/codegen/graph'

export interface EmitContext {
  graph: NormalizedGraph
  registry: Record<string, NodeDef>
  varMap: Map<string, string>
  processedNodes: Set<string>
  blockedNodes: Set<string>
  branchVisited?: Set<string>
  branchAvailable?: Set<string>
  emitNode: (node: ReteGraphNode, indent?: string) => string
}
