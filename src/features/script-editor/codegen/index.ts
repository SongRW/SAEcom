import type { NodeDef, ReteGraphExport, ReteGraphNode } from '@shared/types'
import { normalizeReteGraph, nodeId } from '@/features/script-editor/codegen/graph'
import { topologicalSort } from '@/features/script-editor/codegen/topo'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { DEFAULT_NODE_REGISTRY, emitNodeByKey } from '@/features/script-editor/codegen/registry'
import { continuousListenExpression, isContinuousInputNode } from '@/features/script-editor/codegen/emit/input'
import { emitBranch, outVar } from '@/features/script-editor/codegen/emit/shared'
import { isContinuousRootKey } from '@/features/script-editor/nodes/definitions'

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
    inListenerClosure: false,
    emitNode: (node: ReteGraphNode, indent = '  ') => emitNode(ctx, node, indent)
  }

  let code = 'try {\n'

  // 优先读组件类 isContinuousRoot；未知 key 回退旧判定（兼容测试/临时节点）
  const continuousRoots = graph.nodes.filter(
    (candidate) => isContinuousRootKey(candidate.key) || isContinuousInputNode(candidate.key)
  )
  if (continuousRoots.length > 0) {
    code += '  const _listeners = [];\n'
  }

  // 先 emit 纯数据常量子图（top-level）：所有「incoming 来源均为叶子或已 emit」的节点，
  // 排除 continuousRoot / one-shot root / control-*。
  // 这样 control-loop 循环体引用这些常量（含其计算链）时，它们已在 processedNodes。
  const oneShotRootKeys = new Set(['input-manual', 'input-file', 'input-timer'])
  const continuousRootIds = new Set(continuousRoots.map((n) => nodeId(n.id)))
  const isPreEmittable = (node: typeof graph.nodes[number]): boolean => {
    const id = nodeId(node.id)
    if (continuousRootIds.has(id)) return false
    if (oneShotRootKeys.has(node.key)) return false
    if (node.key.startsWith('control-')) return false
    if (ctx.processedNodes.has(id)) return false
    const incoming = graph.incomingByNode.get(id) || []
    // 来源必须都是叶子（无 incoming）或已 processed —— 不依赖 continuousRoot/control-loop/one-shot-root 输出
    return incoming.every((conn) => {
      const sid = nodeId(conn.source)
      if (ctx.processedNodes.has(sid)) return true
      const srcNode = graph.nodeMap.get(sid)
      // 来源是 one-shot root（input-manual 等）：不提前 emit，否则下游会引用未声明变量
      if (srcNode && oneShotRootKeys.has(srcNode.key)) return false
      const sin = graph.incomingByNode.get(sid) || []
      return sin.length === 0 && !continuousRootIds.has(sid)
    })
  }
  // 多轮扫描：每轮 emit 新增的可提前节点（其来源在前轮已 emit）
  let changed = true
  while (changed) {
    changed = false
    for (const node of graph.nodes) {
      if (isPreEmittable(node)) {
        code += ctx.emitNode(node)
        changed = true
      }
    }
  }

  for (const node of continuousRoots) {
    const id = nodeId(node.id)
    if (ctx.processedNodes.has(id)) continue

    const variable = outVar(node)
    ctx.varMap.set(id, variable)
    ctx.processedNodes.add(id)

    const previousAvailable = ctx.branchAvailable
    const previousClosure = ctx.inListenerClosure
    let body = ''
    ctx.branchAvailable = new Set([id])
    ctx.inListenerClosure = true
    try {
      body = emitBranch(ctx, node, 'out', '    ')
    } finally {
      ctx.branchAvailable = previousAvailable
      ctx.inListenerClosure = previousClosure
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
