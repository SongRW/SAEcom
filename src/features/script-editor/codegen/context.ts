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
  /** 是否在持续监听 listener 闭包内（output 变量是闭包私有，不能跨闭包引用 processedNodes） */
  inListenerClosure: boolean
  emitNode: (node: ReteGraphNode, indent?: string) => string
}
