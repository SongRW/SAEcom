/**
 * P0-b：dslToGraph 产出的 graph 完整性自检。
 *
 * 检测转换器常见 bug：
 * - 终端副作用节点（output-tcp/output-log/output-file）无 incoming → 帧源没接上
 * - continuousRoot（input-tcp 等）无 outgoing → 监听了但没下游处理
 * - control-loop 无 outgoing → 循环体空跑
 * - 孤立节点：既无 incoming 也无 outgoing（除常量/根节点）
 * - connection 引用了不存在的节点 id（断链）
 *
 * 这是 dslToGraph 的安全网：转换器改坏连线（如这次 entryOffset 累加错导致 TLV 断链）
 * 时，validateGraph 立即报告，不用等 codegen 或运行时。
 *
 * 用法：dslToGraph 末尾调用，开发环境（NODE_ENV !== 'production'）自动 console.warn。
 * 测试可传 { throwOnError: true } 让校验失败时抛错（锁定不变量）。
 */

import type { ReteGraphExport, ReteGraphNode } from '@shared/types'

/** 校验选项。 */
export interface ValidateGraphOptions {
  /** 校验失败时抛错（测试用，锁定不变量）。默认 false 只 console.warn。 */
  throwOnError?: boolean
  /** 是否静默（不 console.warn）。默认 false（开发可见）。 */
  silent?: boolean
}

/** 校验结果。 */
export interface ValidateGraphResult {
  /** 是否通过（无 error 级问题） */
  ok: boolean
  /** error 级问题（必须修复） */
  errors: GraphIssue[]
  /** warning 级问题（可能合理，但值得注意） */
  warnings: GraphIssue[]
}

export interface GraphIssue {
  /** 问题类型 */
  kind:
    | 'terminal-no-incoming' // 终端节点无 incoming（帧源没接）
    | 'root-no-outgoing' // 持续监听根无 outgoing（监听了没处理）
    | 'loop-no-outgoing' // control-loop 无 outgoing（循环体空跑）
    | 'orphan-node' // 孤立节点（无 incoming 也无 outgoing，且非根/常量）
    | 'dangling-connection' // 连线引用了不存在的节点
  /** 相关节点 id */
  nodeId?: string
  /** 描述 */
  message: string
}

/** 终端副作用节点 key（无 incoming 一定是 bug）。 */
const TERMINAL_KEYS = new Set(['output-tcp', 'output-tcp-server', 'output-log', 'output-file', 'output-panel'])
/** 持续监听根 key（无 outgoing 说明监听了但没下游）。 */
const CONTINUOUS_ROOT_KEYS = new Set(['input-serial', 'input-tcp', 'input-tcp-server', 'input-panel'])
/** 常量/纯输入节点 key（无 incoming 合理，不算孤立）。 */
const LEAF_KEYS = new Set(['protocol-const', 'input-manual', 'input-file', 'input-timer'])

/**
 * 校验 graph 完整性。
 */
export function validateGraph(graph: ReteGraphExport, options: ValidateGraphOptions = {}): ValidateGraphResult {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : Object.values(graph.nodes)
  const conns = graph.connections ? (Array.isArray(graph.connections) ? graph.connections : Object.values(graph.connections)) : []

  const nodeMap = new Map<string, ReteGraphNode>()
  for (const n of nodes) nodeMap.set(String(n.id), n)

  const incomingByNode = new Map<string, number>()
  const outgoingByNode = new Map<string, number>()
  for (const c of conns) {
    incomingByNode.set(String(c.target), (incomingByNode.get(String(c.target)) ?? 0) + 1)
    outgoingByNode.set(String(c.source), (outgoingByNode.get(String(c.source)) ?? 0) + 1)
  }

  const errors: GraphIssue[] = []
  const warnings: GraphIssue[] = []

  // 1. 终端节点必须有 incoming
  for (const n of nodes) {
    if (TERMINAL_KEYS.has(n.key) && !incomingByNode.has(String(n.id))) {
      errors.push({
        kind: 'terminal-no-incoming',
        nodeId: String(n.id),
        message: `终端节点 ${n.key}(${n.id}${n.label ? `,${n.label}` : ''}) 无 incoming 连线，帧源没接上`
      })
    }
  }

  // 2. 持续监听根应该有 outgoing（除非整个 graph 就只有一个监听节点）
  if (nodes.length > 1) {
    for (const n of nodes) {
      if (CONTINUOUS_ROOT_KEYS.has(n.key) && !outgoingByNode.has(String(n.id))) {
        warnings.push({
          kind: 'root-no-outgoing',
          nodeId: String(n.id),
          message: `持续监听根 ${n.key}(${n.id}) 无 outgoing，监听了但没下游处理`
        })
      }
    }
  }

  // 3. control-loop 应该有 outgoing（否则循环体空跑）
  for (const n of nodes) {
    if (n.key === 'control-loop' && !outgoingByNode.has(String(n.id))) {
      errors.push({
        kind: 'loop-no-outgoing',
        nodeId: String(n.id),
        message: `control-loop(${n.id}${n.label ? `,${n.label}` : ''}) 无 outgoing，循环体空跑`
      })
    }
  }

  // 4. 孤立节点（无 incoming 也无 outgoing，且非根/常量）—— 多见于转换器 bug
  for (const n of nodes) {
    if (CONTINUOUS_ROOT_KEYS.has(n.key) || LEAF_KEYS.has(n.key) || TERMINAL_KEYS.has(n.key)) continue
    if (n.key === 'control-loop' || n.key === 'control-if') continue
    const hasIn = incomingByNode.has(String(n.id))
    const hasOut = outgoingByNode.has(String(n.id))
    if (!hasIn && !hasOut) {
      warnings.push({
        kind: 'orphan-node',
        nodeId: String(n.id),
        message: `孤立节点 ${n.key}(${n.id}${n.label ? `,${n.label}` : ''})：无 incoming 也无 outgoing`
      })
    }
  }

  // 5. 连线引用不存在的节点（断链）
  for (const c of conns) {
    if (!nodeMap.has(String(c.source))) {
      errors.push({
        kind: 'dangling-connection',
        message: `连线 source=${c.source} 不存在（target=${c.target}）`
      })
    }
    if (!nodeMap.has(String(c.target))) {
      errors.push({
        kind: 'dangling-connection',
        message: `连线 target=${c.target} 不存在（source=${c.source}）`
      })
    }
  }

  const result: ValidateGraphResult = { ok: errors.length === 0, errors, warnings }

  if (errors.length > 0) {
    const msg = `[dslToGraph] graph 完整性校验失败（${errors.length} 个 error）:\n` +
      errors.map((e) => `  - [${e.kind}] ${e.message}`).join('\n')
    // throwOnError 独立于 silent：测试锁定用，即使 silent 也抛
    if (options.throwOnError) throw new Error(msg)
    if (!options.silent) console.warn(msg)
  }
  if (warnings.length > 0 && !options.silent) {
    console.warn(`[dslToGraph] graph 完整性警告（${warnings.length} 个 warning）:\n` +
      warnings.map((w) => `  - [${w.kind}] ${w.message}`).join('\n'))
  }

  return result
}
