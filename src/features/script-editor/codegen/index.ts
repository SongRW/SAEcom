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
    code += `  _listeners.push(${continuousListenExpression(ctx, node)}(async (${variable}) => {\n`
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

  // 静默丢节点告警：检测「本该 emit 却被吞」的节点。
  // 这类问题最危险——graph 看起来正常，codegen 不报错，但生成的代码缺关键逻辑
  // （如 output-tcp 被丢 → sendTCP=0，脚本不发数据）。
  // 终端副作用节点（output-*）被丢一定是 bug；其他 blocked 节点按需报告。
  warnOnDroppedNodes(graph, ctx)

  return code
}

/**
 * 静默丢节点告警。
 *
 * 检测两类问题：
 * 1. blocked 的终端副作用节点（output-tcp/output-log/output-file 等）—— 这些节点
 *    被丢意味着脚本缺关键输出（发送/日志），一定是 bug。
 * 2. 未 processed 且非 root/常量的孤儿节点（有 incoming 但来源全被 blocked）——
 *    说明组包/拆包链断裂。
 *
 * 告警走 console.warn（开发可见），不抛错（避免阻塞生成）。测试环境可通过
 * captureConsoleWarnings 选项（未来）捕获断言。当前先保证生产可见。
 */
function warnOnDroppedNodes(graph: ReturnType<typeof normalizeReteGraph>, ctx: EmitContext): void {
  // 终端副作用节点 key：被丢一定是 bug
  const TERMINAL_KEYS = new Set(['output-tcp', 'output-tcp-server', 'output-log', 'output-file', 'output-panel'])
  const droppedTerminal: Array<{ id: string; key: string; label?: string }> = []
  const droppedOther: Array<{ id: string; key: string; label?: string }> = []

  for (const node of graph.nodes) {
    const id = nodeId(node.id)
    if (ctx.processedNodes.has(id)) continue // 已正常 emit
    // continuousRoot 自身已在 listener 注册，不算丢
    if (ctx.varMap.has(id) && (isContinuousRootKey(node.key) || isContinuousInputNode(node.key))) continue
    if (ctx.blockedNodes.has(id)) {
      if (TERMINAL_KEYS.has(node.key)) {
        droppedTerminal.push({ id, key: node.key, label: node.label })
      } else {
        droppedOther.push({ id, key: node.key, label: node.label })
      }
    }
  }

  if (droppedTerminal.length > 0) {
    const detail = droppedTerminal
      .map((n) => `${n.key}(${n.id}${n.label ? `,${n.label}` : ''})`)
      .join(', ')
    // 终端节点丢失是严重 bug，console.warn 让开发者立即发现
    console.warn(
      `[codegen] 警告：${droppedTerminal.length} 个终端副作用节点被丢弃（生成的脚本缺关键输出）: ${detail}\n` +
        `  常见原因：节点的上游数据源被 blocked（listener 闭包边界 / control-loop 循环体引用了闭包外常量）。`
    )
  }
  // 其他 blocked 节点数量过多时也提醒（可能是连线断链）
  if (droppedOther.length > 5) {
    console.warn(
      `[codegen] 警告：${droppedOther.length} 个非终端节点被丢弃（可能是断链）。前 5 个: ${droppedOther
        .slice(0, 5)
        .map((n) => `${n.key}(${n.id})`)
        .join(', ')}`
    )
  }
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
