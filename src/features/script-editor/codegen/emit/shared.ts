import type { PanelConfigRef, ReteGraphNode } from '@shared/types'
import { isPanelConfigRef } from '@/features/script-editor/panelConfig'
import { incomingForInput, nodeId, outgoingForOutput } from '@/features/script-editor/codegen/graph'
import type { EmitContext } from '@/features/script-editor/codegen/context'

export const outVar = (node: ReteGraphNode): string => `_out_${nodeId(node.id).replace(/\W/g, '_')}`

export function data(node: ReteGraphNode): Record<string, unknown> {
  return node.data || {}
}

export function configRef(config: Record<string, unknown>): PanelConfigRef {
  return isPanelConfigRef(config.configRef) ? config.configRef : { kind: 'local' }
}

export function valueAsString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null || value === '') return fallback
  return String(value)
}

export function valueAsNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function jsString(value: unknown): string {
  return JSON.stringify(String(value ?? ''))
}

export function jsLiteral(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value ?? '')
  if (/^-?\d+(\.\d+)?$/.test(text.trim())) return text.trim()
  if (text === 'true' || text === 'false') return text
  return jsString(text)
}

/**
 * 解析上游输出变量。
 * 优先查复合 key `${sourceId}:${sourceOutput}` —— 用于多输出节点（如 protocol-bitfield 解包：
 * 一个节点按位段表产出多个不同值，每值对应一个输出端口）。
 * 单输出节点只往 varMap 写裸 id，复合 key 查不到时回退到裸 id，行为与历史一致（零回归）。
 */
function lookupSourceVar(ctx: EmitContext, source: string | number, sourceOutput: string): string | undefined {
  const id = nodeId(source)
  if (sourceOutput) {
    const composite = ctx.varMap.get(`${id}:${sourceOutput}`)
    if (composite !== undefined) return composite
  }
  return ctx.varMap.get(id)
}

export function getInputVar(ctx: EmitContext, node: ReteGraphNode, inputKey = 'in', fallback = '_last_recv'): string {
  const connection = incomingForInput(ctx.graph, node, inputKey)[0]
  if (!connection) return fallback
  return lookupSourceVar(ctx, connection.source, String(connection.sourceOutput))
    || outVar(ctx.graph.nodeMap.get(nodeId(connection.source)) || { id: connection.source, key: '' })
}

export function getInputVars(ctx: EmitContext, node: ReteGraphNode): string[] {
  const connections = ctx.graph.incomingByNode.get(nodeId(node.id)) || []
  if (!connections.length) return ['_last_recv']
  return connections.map((connection) =>
    lookupSourceVar(ctx, connection.source, String(connection.sourceOutput))
    || `_out_${nodeId(connection.source).replace(/\W/g, '_')}`)
}

export function emitStopGuard(indent: string): string {
  return `${indent}if (await checkStop()) return;\n`
}

export function emitBranch(ctx: EmitContext, node: ReteGraphNode, outputKey: string, indent: string, visited = new Set<string>()): string {
  const branchAvailable = ctx.branchAvailable

  return outgoingForOutput(ctx.graph, node, outputKey)
    .map((connection) => {
      const child = ctx.graph.nodeMap.get(nodeId(connection.target))
      if (!child) return ''
      const childId = nodeId(child.id)
      if (visited.has(childId)) return ''
      const availableSources = branchAvailable || new Set(visited)
      availableSources.add(nodeId(node.id))
      if (!allIncomingSourcesAvailable(ctx, child, availableSources)) {
        ctx.blockedNodes.add(childId)
        return ''
      }

      const nextVisited = new Set(visited)
      nextVisited.add(childId)
      const previousVisited = ctx.branchVisited
      const previousAvailable = ctx.branchAvailable
      ctx.branchVisited = nextVisited
      if (branchAvailable) ctx.branchAvailable = branchAvailable
      try {
        // 先就地 emit 未 processed 的纯叶子来源（非 listener 闭包内）
        // 这样分支/循环内引用循环外的纯叶子时，叶子 var 声明就地在当前作用域生成
        let code = emitLeafSources(ctx, child, indent)
        code += ctx.emitNode(child, indent)
        branchAvailable?.add(childId)
        if (shouldEmitChildBranches(ctx, child)) {
          // 动态端口节点（protocol-bitfield 解包等）的实际输出端口不在静态 NodeDef 里，
          // 必须从 graph 的实际连接推导 sourceOutput keys，否则多输出下游漏 emit。
          const staticOutputs = ctx.registry[child.key]?.outputs || []
          const staticKeys = new Set(staticOutputs.map((o) => o.key))
          const dynamicKeys: string[] = []
          for (const oc of ctx.graph.outgoingByNode.get(childId) || []) {
            if (!staticKeys.has(oc.sourceOutput)) dynamicKeys.push(oc.sourceOutput)
          }
          const allOutputKeys = [...staticOutputs.map((o) => o.key), ...dynamicKeys]
          code += allOutputKeys.map((outputKey) => emitBranch(ctx, child, outputKey, indent, nextVisited)).join('')
        }
        return code
      } finally {
        ctx.branchVisited = previousVisited
        ctx.branchAvailable = previousAvailable
      }
    })
    .join('')
}

/**
 * 就地 emit child 的未 processed 纯叶子来源（仅非 listener 闭包）。
 * 解决：分支/循环内引用循环外的 input-manual 等纯叶子时，
 * 叶子的 var 声明需就地生成在当前作用域，而非 top-level（否则引用未声明变量）。
 * 扩展支持「叶子链」：所有来源都是纯叶子的节点（如 bitfield ← input-manual preNodes、
 * TLV len-prefix ← protocol-const value）也可就地 emit，循环体内可包含位域打包/TLV 组包等结构。
 */
function emitLeafSources(ctx: EmitContext, child: ReteGraphNode, indent: string): string {
  if (ctx.inListenerClosure) return ''
  const id = nodeId(child.id)
  const connections = ctx.graph.incomingByNode.get(id) || []
  let code = ''
  for (const conn of connections) {
    const sid = nodeId(conn.source)
    if (ctx.processedNodes.has(sid)) continue
    const srcNode = ctx.graph.nodeMap.get(sid)
    if (!srcNode) continue
    if (!isLeafChainEligible(ctx, srcNode)) continue
    // 先就地 emit 其叶子来源（如 bitfield 的 preNodes、TLV len-prefix 的 value const），再 emit 本节点
    code += emitLeafSources(ctx, srcNode, indent)
    code += ctx.emitNode(srcNode, indent)
  }
  return code
}

/**
 * 是否为可就地 emit 的「叶子链」节点：
 * - 无 incoming 的纯叶子（且非持续监听根）
 * - 或所有 incoming 来源都是纯叶子/已 processed（如 bitfield ← input-manual preNodes、
 *   TLV len-prefix ← protocol-const value）
 * 仅用于非 listener 作用域（分支/循环体内）。
 */
function isLeafChainEligible(ctx: EmitContext, node: ReteGraphNode): boolean {
  if (isRootSourceKey(node.key)) return false
  const incoming = ctx.graph.incomingByNode.get(nodeId(node.id)) || []
  if (incoming.length === 0) return true
  return incoming.every((conn) => {
    const sid = nodeId(conn.source)
    if (ctx.processedNodes.has(sid)) return true
    const srcNode = ctx.graph.nodeMap.get(sid)
    if (!srcNode) return false
    if (isRootSourceKey(srcNode.key)) return false
    const srcIncoming = ctx.graph.incomingByNode.get(sid) || []
    return srcIncoming.length === 0
  })
}

export function jsObjectLiteral(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}'
  return JSON.stringify(value)
}

function shouldEmitChildBranches(ctx: EmitContext, node: ReteGraphNode): boolean {
  if (node.key === 'control-if' || node.key === 'control-loop' || node.key === 'control-timeout') return false
  const outputs = ctx.registry[node.key]?.outputs || []
  return outputs.length > 0
}

function allIncomingSourcesAvailable(ctx: EmitContext, node: ReteGraphNode, availableSources: Set<string>): boolean {
  const id = nodeId(node.id)
  const connections = ctx.graph.incomingByNode.get(id) || []
  return connections.every((connection) => {
    const sourceId = nodeId(connection.source)
    if (sourceId === id || availableSources.has(sourceId)) return true
    // 非 listener 闭包时（control-loop 循环体、control-if 分支）：
    // 来源已在 top-level 处理过则可用（循环体引用循环外常量）
    if (!ctx.inListenerClosure && ctx.processedNodes.has(sourceId)) return true
    // 非 listener 闭包时：来源是纯叶子（无 incoming 且非根节点）可就地求值
    // （control-if 分支内的 input-manual 等纯输入，分支作用域可就地 emit）
    // 扩展：叶子链（如 bitfield ← input-manual preNodes、TLV len-prefix ← protocol-const）
    // 同样可就地求值，循环体内可包含位域打包/TLV 组包等结构。
    if (!ctx.inListenerClosure) {
      const sourceNode = ctx.graph.nodeMap.get(sourceId)
      if (sourceNode && isLeafChainEligible(ctx, sourceNode)) return true
    }
    return false
  })
}

function isRootSourceKey(key: string): boolean {
  // 持续监听根：输出在 listener 闭包内，跨闭包/跨作用域不可见，任何时候都不能就地 emit
  // （one-shot root 在非 listener 作用域可就地 emit，由 inListenerClosure 守护）
  return key === 'input-serial' || key === 'input-tcp' || key === 'input-tcp-server' || key === 'input-panel'
}

export function delimiter(config: Record<string, unknown>): string {
  if (config.delimiter === '逗号') return ','
  if (config.delimiter === '空格') return ' '
  if (config.delimiter === '换行') return '\n'
  if (config.delimiter === '制表符') return '\t'
  return valueAsString(config.custom, ',')
}
