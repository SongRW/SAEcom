import type { NodeDef, ReteGraphExport, ReteGraphNode } from '@shared/types'
import { normalizeReteGraph, nodeId } from '@/features/script-editor/codegen/graph'
import { topologicalSort } from '@/features/script-editor/codegen/topo'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { DEFAULT_NODE_REGISTRY, emitNodeByKey } from '@/features/script-editor/codegen/registry'
import { continuousListenExpression, isContinuousInputNode } from '@/features/script-editor/codegen/emit/input'
import { emitBranch, outVar } from '@/features/script-editor/codegen/emit/shared'

export function generateCodeFromRete(
  graphData: ReteGraphExport | null | undefined,
  registry: Record<string, NodeDef> = DEFAULT_NODE_REGISTRY
): string {
  if (!graphData || !graphData.nodes) return '// 无效数据'

  const graph = normalizeReteGraph(graphData)
  if (graph.nodes.length === 0) return '// 空流程图'

  let ctx: EmitContext
  ctx = {
    graph,
    registry,
    varMap: new Map(),
    processedNodes: new Set(),
    blockedNodes: new Set(),
    emitNode: (node: ReteGraphNode, indent = '  ') => emitNode(ctx, node, indent)
  }

  let code = 'try {\n'

  const continuousRoots = graph.nodes.filter((candidate) => isContinuousInputNode(candidate.key))
  if (continuousRoots.length > 0) {
    code += '  const _listeners = [];\n'
  }

  for (const node of continuousRoots) {
    const id = nodeId(node.id)
    if (ctx.processedNodes.has(id)) continue

    const variable = outVar(node)
    ctx.varMap.set(id, variable)
    ctx.processedNodes.add(id)

    const previousAvailable = ctx.branchAvailable
    let body = ''
    ctx.branchAvailable = new Set([id])
    try {
      body = emitBranch(ctx, node, 'out', '    ')
    } finally {
      ctx.branchAvailable = previousAvailable
    }
    code += `  _listeners.push(${continuousListenExpression(node)}(async (${variable}) => {\n`
    code += '    if (await checkStop()) return;\n'
    code += body
    code += '  }));\n'
  }

  for (const id of topologicalSort(graph)) {
    if (ctx.processedNodes.has(id)) continue
    if (ctx.blockedNodes.has(id) || dependsOnBlockedNode(ctx, id)) {
      ctx.blockedNodes.add(id)
      continue
    }
    const node = graph.nodeMap.get(id)
    if (!node) continue
    code += emitNode(ctx, node)
  }

  if (continuousRoots.length > 0) {
    code += '  await Promise.all(_listeners);\n'
  }

  code += `} catch (e) {\n  if (e.message !== 'ABORTED') console.log('Error: ' + e.message);\n}\n`
  return code
}

function emitNode(ctx: EmitContext, node: ReteGraphNode, indent = '  '): string {
  ctx.processedNodes.add(nodeId(node.id))
  return emitNodeByKey(ctx, node, indent)
}

function dependsOnBlockedNode(ctx: EmitContext, id: string): boolean {
  const connections = ctx.graph.incomingByNode.get(id) || []
  return connections.some((connection) => ctx.blockedNodes.has(nodeId(connection.source)))
}

export { DEFAULT_NODE_REGISTRY } from '@/features/script-editor/codegen/registry'
export { normalizeReteGraph } from '@/features/script-editor/codegen/graph'
