/**
 * DSL → graph 转换器：把 ProtocolDsl 转成合法的 ReteGraphExport。
 *
 * 适配器模式：字段 → 节点的映射由 AdapterRegistry 管理，默认注册 SAEcom 内置
 * 适配器。插件/其他节点系统可注册自己的适配器覆盖默认映射。
 *
 * 转换器负责：
 * - 查适配器注册表，把每个 DSL 字段转成节点
 * - 用 protocol-concat 拼帧（动态端口 a/b/c 自动计算）
 * - crc/length-prefix 在 concat 后处理
 * - transport 创建 TCP 收发节点
 * - loop 创建 control-loop
 * - 自动连线 + 布局
 *
 * 保证 graph 契约（importGraphState 不丢节点/连线）。
 */

import type { ReteGraphExport, ReteGraphNode, ReteGraphConnection } from '@shared/types'
import type { ProtocolDsl, ProtocolField } from '@shared/protocol-dsl'
import { AdapterRegistry, type NodeSpecWithOutput } from './adapters'
import { createDefaultRegistry } from './saecomAdapters'

// ── 布局常量 ──
const X_STRIDE = 280
const Y_STRIDE = 100
const Y_BASE = 40

interface BuildCtx {
  nodes: ReteGraphNode[]
  connections: ReteGraphConnection[]
  nextId: number
  col: number
  row: number
}

function createBuildCtx(): BuildCtx {
  return { nodes: [], connections: [], nextId: 1, col: 0, row: 0 }
}

function nextPosition(ctx: BuildCtx): { x: number; y: number } {
  const pos = { x: ctx.col * X_STRIDE, y: Y_BASE + ctx.row * Y_STRIDE }
  ctx.row++
  return pos
}

function addNode(
  ctx: BuildCtx,
  key: string,
  data: Record<string, unknown>,
  label: string,
  position?: { x: number; y: number }
): string {
  const id = String(ctx.nextId++)
  ctx.nodes.push({ id, key, label, position: position ?? nextPosition(ctx), data })
  return id
}

function connect(
  ctx: BuildCtx,
  source: string,
  sourceOutput: string,
  target: string,
  targetInput: string
): void {
  ctx.connections.push({ source, sourceOutput, target, targetInput })
}

/** 把一个字段经适配器转成节点（含 preNodes 处理），返回节点 id + 输出端口。 */
function fieldToNode(
  ctx: BuildCtx,
  field: ProtocolField,
  namePrefix: string,
  fieldIndex: number,
  registry: AdapterRegistry
): { id: string; outputPort: string } | null {
  const adapter = registry.resolve(field)
  if (!adapter) return null

  const spec = adapter(field, { namePrefix, fieldIndex }) as NodeSpecWithOutput | null
  if (!spec) return null

  // 先创建 preNodes（辅助节点），连线到本节点的输入
  for (const pre of spec.preNodes ?? []) {
    const preId = addNode(ctx, pre.key, pre.data, pre.label)
    // preNodes 的连线在主节点创建后补（因为需要主节点 id）
    // 这里先记录，用一个临时结构
    ;(pre as any)._id = preId
  }

  // 创建主节点
  const id = addNode(ctx, spec.key, spec.data, spec.label)

  // 补 preNodes → 主节点的连线
  for (const pre of spec.preNodes ?? []) {
    connect(ctx, (pre as any)._id, 'out', id, pre.toInput)
  }

  return { id, outputPort: spec.outputPort }
}

/**
 * 把 ProtocolDsl 转成 ReteGraphExport。
 *
 * @param dsl 协议描述
 * @param registry 可选的适配器注册表（不传则用默认 SAEcom 适配器）
 */
export function dslToGraph(dsl: ProtocolDsl, registry?: AdapterRegistry): ReteGraphExport {
  const reg = registry ?? createDefaultRegistry()
  const ctx = createBuildCtx()
  const namePrefix = dsl.name || '协议'

  // 分离特殊字段（crc/length-prefix 在 concat 后处理）
  const normalFields = dsl.fields.filter(f => f.kind !== 'crc' && f.kind !== 'length-prefix')
  const crcFields = dsl.fields.filter(f => f.kind === 'crc')
  const lenFields = dsl.fields.filter(f => f.kind === 'length-prefix')

  // 组包链 + 记录字段字节偏移（供接收侧拆包用）
  const fieldOutputs: Array<{ id: string; outputPort: string }> = []
  const fieldLayout: Array<{ name: string; offset: number; length: number }> = []
  let byteOffset = 0
  normalFields.forEach((field, i) => {
    const result = fieldToNode(ctx, field, namePrefix, i, reg)
    if (result) {
      fieldOutputs.push(result)
      // 计算字段字节宽度（供拆包 slice）
      const w = fieldByteWidth(field)
      fieldLayout.push({ name: field.name, offset: byteOffset, length: w })
      byteOffset += w
    }
  })

  // protocol-concat 拼帧
  ctx.col++
  ctx.row = 0
  const concatPortCount = Math.max(2, fieldOutputs.length)
  const concatId = addNode(ctx, 'protocol-concat', { ports: concatPortCount }, `${namePrefix}.组帧`, nextPosition(ctx))
  fieldOutputs.forEach((fo, i) => {
    connect(ctx, fo.id, fo.outputPort, concatId, concatPortKey(i))
  })

  let frameNodeId = concatId
  let frameOutputPort = 'out'

  // length-prefix
  if (lenFields.length > 0) {
    ctx.col++
    ctx.row = 0
    for (const lf of lenFields) {
      const result = fieldToNode(ctx, lf, namePrefix, 0, reg)
      if (!result) continue
      connect(ctx, frameNodeId, frameOutputPort, result.id, 'body')
      frameNodeId = result.id
      frameOutputPort = result.outputPort
    }
  }

  // CRC
  if (crcFields.length > 0) {
    ctx.col++
    ctx.row = 0
    for (const cf of crcFields) {
      const result = fieldToNode(ctx, cf, namePrefix, 0, reg)
      if (!result) continue
      connect(ctx, frameNodeId, frameOutputPort, result.id, 'body')
      frameNodeId = result.id
      frameOutputPort = result.outputPort
    }
  }

  // 输出（发送/日志）
  ctx.col++
  ctx.row = 0
  const hasTransport = Boolean(dsl.transport)

  if (hasTransport && dsl.transport?.mode === 'tcp-loopback') {
    if (dsl.loop) {
      addNode(ctx, 'control-loop', { count: dsl.loop.count, type: '次数循环' }, `${namePrefix}.循环`, nextPosition(ctx))
    }
    const sendId = addNode(ctx, 'output-tcp', { host: '127.0.0.1', port: dsl.transport!.port, mode: 'hex' }, `${namePrefix}.发送`, nextPosition(ctx))
    connect(ctx, frameNodeId, frameOutputPort, sendId, 'in')

    ctx.col++
    ctx.row = 0
    const srvRecvId = addNode(ctx, 'input-tcp-server', { port: dsl.transport!.port }, `${namePrefix}.服务端接收`, nextPosition(ctx))
    const srvSendId = addNode(ctx, 'output-tcp-server', { port: dsl.transport!.port, mode: 'hex' }, `${namePrefix}.服务端回包`, nextPosition(ctx))
    connect(ctx, srvRecvId, 'out', srvSendId, 'in')

    ctx.col++
    ctx.row = 0
    const cliRecvId = addNode(ctx, 'input-tcp', { host: '127.0.0.1', port: dsl.transport!.port }, `${namePrefix}.客户端接收`, nextPosition(ctx))

    // 接收侧拆包解析链：每个字段 protocol-slice 按偏移截取 → output-log 输出（人可读）
    // verifyOnRecv 默认 true；false 时只 log 原始帧
    const verifyOnRecv = dsl.verifyOnRecv !== false
    if (verifyOnRecv && fieldLayout.length > 0) {
      // 逐字段拆包：slice(offset, length) → log("字段名")
      for (const fl of fieldLayout) {
        const sliceId = addNode(ctx, 'protocol-slice', {
          start: fl.offset, length: fl.length
        }, `${namePrefix}.拆.${fl.name}`, nextPosition(ctx))
        connect(ctx, cliRecvId, 'out', sliceId, 'hex')
        const fLogId = addNode(ctx, 'output-log', {
          prefix: `${namePrefix}.${fl.name}`, level: 'info'
        }, `${namePrefix}.日志.${fl.name}`, nextPosition(ctx))
        connect(ctx, sliceId, 'out', fLogId, 'in')
      }
    } else {
      // 简单 log 原始帧
      const logId = addNode(ctx, 'output-log', { prefix: `${namePrefix}.收到`, level: 'info' }, `${namePrefix}.日志`, nextPosition(ctx))
      connect(ctx, cliRecvId, 'out', logId, 'in')
    }

  } else if (hasTransport && dsl.transport?.mode === 'tcp-client') {
    const sendId = addNode(ctx, 'output-tcp', { host: dsl.transport.host ?? '127.0.0.1', port: dsl.transport.port, mode: 'hex' }, `${namePrefix}.发送`, nextPosition(ctx))
    connect(ctx, frameNodeId, frameOutputPort, sendId, 'in')

  } else {
    const logId = addNode(ctx, 'output-log', { prefix: `${namePrefix}.帧`, level: 'info' }, `${namePrefix}.日志`, nextPosition(ctx))
    connect(ctx, frameNodeId, frameOutputPort, logId, 'in')
  }

  return { nodes: ctx.nodes, connections: ctx.connections }
}

/** protocol-concat 动态端口 key：index 0-25 → a-z，≥26 → in_N */
function concatPortKey(index: number): string {
  if (index < 26) return String.fromCharCode(97 + index)
  return `in_${index + 1}`
}

/** 计算字段的字节宽度（供拆包 protocol-slice 的 length 参数）。 */
function fieldByteWidth(field: ProtocolField): number {
  switch (field.kind) {
    case 'const': {
      if (field.mode === 'hex') return Math.max(1, Math.ceil(field.value.replace(/\s/g, '').length / 2))
      if (field.mode === 'decimal' || field.mode === 'binary') return field.width ?? 2
      // text：按 utf8 字节数（TextEncoder 浏览器原生，无需 Buffer）
      return new TextEncoder().encode(field.value).length
    }
    case 'uint': return field.width
    case 'text': return new TextEncoder().encode(field.value).length
    case 'bitfield': return Math.ceil(field.fields.reduce((s, f) => s + f.bits, 0) / 8)
    case 'crc': return field.algorithm === 'CRC8' ? 1 : field.algorithm === 'CRC32' ? 4 : 2
    case 'length-prefix': return field.width === 'u16' ? 2 : 1
    case 'custom': return 16 // 默认 16 字节（AES block）；精确值需组件自知
    default: return 2
  }
}
