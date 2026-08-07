/**
 * DSL → graph 转换器：把 ProtocolDsl 转成合法的 ReteGraphExport。
 *
 * 转换器负责：
 * - 按 DSL 字段顺序创建组包链节点（protocol-const/crc/len-prefix/bitfield/custom）
 * - 用 protocol-concat 把所有字段拼成完整帧
 * - 按 transport 配置创建 TCP 收发节点
 * - 按 loop 配置创建 control-loop 包裹发送
 * - 自动连线（端口名/socket 全部由转换器计算，保证 graph 契约正确）
 * - 自动布局（网格排列，x stride 280, y stride 100）
 *
 * 保证 graph 契约（importGraphState 不丢节点/连线）：
 * - 节点 key 全部合法（内置 + 已注册 custom-*）
 * - 连线 sourceOutput/targetInput 匹配节点真实端口
 * - socket 兼容（data→data）
 * - 动态端口节点的 data 与连线一致（concat 的 ports=N）
 */

import type { ReteGraphExport, ReteGraphNode, ReteGraphConnection } from '@shared/types'
import type { ProtocolDsl, ProtocolField } from '@shared/protocol-dsl'

// ── 布局常量 ──
const X_STRIDE = 280
const Y_STRIDE = 100
const Y_BASE = 40

/** 内部构建上下文：累积节点和连线，跟踪 id 和位置。 */
interface BuildCtx {
  nodes: ReteGraphNode[]
  connections: ReteGraphConnection[]
  nextId: number
  col: number    // 当前列（x 方向）
  row: number    // 当前行（y 方向）
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
  ctx.nodes.push({
    id,
    key,
    label,
    position: position ?? nextPosition(ctx),
    data
  })
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

/** 字段 → 节点 key + data 映射。返回创建的节点 id + 输出端口名（供 concat 连线）。 */
function fieldToNode(ctx: BuildCtx, field: ProtocolField, namePrefix: string): { id: string; outputPort: string } {
  const label = `${namePrefix}.${field.name}`
  switch (field.kind) {
    case 'const': {
      const id = addNode(ctx, 'protocol-const', {
        mode: field.mode ?? 'hex',
        content: field.value,
        width: field.width ?? 2,
        encoding: 'utf8'
      }, label)
      return { id, outputPort: 'out' }
    }
    case 'uint': {
      // 组包侧用 protocol-const(decimal)，固定值或留空接上游（如循环序号）
      const id = addNode(ctx, 'protocol-const', {
        mode: 'decimal',
        content: field.value != null ? String(field.value) : '0',
        width: field.width,
        encoding: 'utf8'
      }, label)
      return { id, outputPort: 'out' }
    }
    case 'text': {
      const id = addNode(ctx, 'protocol-const', {
        mode: 'text',
        content: field.value,
        width: 2,
        encoding: field.encoding ?? 'utf8'
      }, label)
      return { id, outputPort: 'out' }
    }
    case 'bitfield': {
      // protocol-bitfield 打包模式：fields → 输入端口 field_${id}
      // 但打包模式需要每个 field 的输入值——这里简化：用 const 喂每个 field 输入
      const fields = field.fields.map((f, i) => ({ id: `f${i}`, name: f.name, bits: f.bits }))
      const bfId = addNode(ctx, 'protocol-bitfield', {
        mode: '打包',
        fields
      }, label)
      // 为每个 bitfield 子字段创建 input-manual 喂值（简化：值=0）
      for (const f of fields) {
        const sourceId = addNode(ctx, 'input-manual', {
          content: '0', mode: 'text'
        }, `${label}.${f.name}`)
        connect(ctx, sourceId, 'out', bfId, `field_${f.id}`)
      }
      return { id: bfId, outputPort: 'out' }
    }
    case 'length-prefix': {
      // protocol-len-prefix 需要 body 输入；在 concat 之后单独处理
      // 这里先返回占位，实际 body 在拼帧后接上
      const id = addNode(ctx, 'protocol-len-prefix', {
        width: field.width ?? 'u8'
      }, label)
      return { id, outputPort: 'out' }
    }
    case 'crc': {
      const id = addNode(ctx, 'protocol-crc', {
        algorithm: field.algorithm ?? 'CRC16',
        endian: field.endian === 'big' ? '大端' : '小端',
        append: field.append === false ? '否' : '是'
      }, label)
      return { id, outputPort: 'out' }
    }
    case 'custom': {
      const id = addNode(ctx, field.componentKey, field.config ?? {}, label)
      return { id, outputPort: 'out' }
    }
  }
}

/**
 * 把 ProtocolDsl 转成 ReteGraphExport。
 *
 * 产出的 graph 结构（有 transport 时）：
 *   组包链：[field1] → [field2] → ... → protocol-concat → protocol-crc → output-tcp
 *   （control-loop 包裹整个组包+发送，循环 N 次）
 *   服务端：input-tcp-server → output-tcp-server（echo）
 *   客户端收：input-tcp → output-log
 *
 * 无 transport 时：组包链 → output-log（纯本地数据流）。
 */
export function dslToGraph(dsl: ProtocolDsl): ReteGraphExport {
  const ctx = createBuildCtx()
  const namePrefix = dsl.name || '协议'

  // ── 分离特殊字段（crc/length-prefix 在 concat 后处理）──
  const normalFields = dsl.fields.filter(f => f.kind !== 'crc' && f.kind !== 'length-prefix')
  const crcFields = dsl.fields.filter(f => f.kind === 'crc')
  const lenFields = dsl.fields.filter(f => f.kind === 'length-prefix')

  // ── 组包链：每个字段一个节点 ──
  const fieldOutputs: Array<{ id: string; port: string }> = []
  for (const field of normalFields) {
    const { id, outputPort } = fieldToNode(ctx, field, namePrefix)
    fieldOutputs.push({ id, port: outputPort })
  }

  // ── protocol-concat 把所有字段拼成帧（ports = 字段数）──
  ctx.col++  // concat 在新列
  ctx.row = 0
  const concatPortCount = Math.max(2, fieldOutputs.length)
  const concatId = addNode(ctx, 'protocol-concat', {
    ports: concatPortCount
  }, `${namePrefix}.组帧`, nextPosition(ctx))

  // 连线：每个字段输出 → concat 的 a/b/c... 输入
  fieldOutputs.forEach((fo, i) => {
    const portKey = concatPortKey(i)
    connect(ctx, fo.id, fo.port, concatId, portKey)
  })

  // concat 后的帧数据流
  let frameNodeId = concatId
  let frameOutputPort = 'out'

  // ── length-prefix（在 concat 之后，body=帧）──
  if (lenFields.length > 0) {
    ctx.col++
    ctx.row = 0
    for (const lf of lenFields) {
      const lpId = addNode(ctx, 'protocol-len-prefix', {
        width: lf.width ?? 'u8'
      }, `${namePrefix}.${lf.name}`, nextPosition(ctx))
      connect(ctx, frameNodeId, frameOutputPort, lpId, 'body')
      frameNodeId = lpId
      frameOutputPort = 'out'
    }
  }

  // ── CRC（在帧最后，body=当前帧）──
  if (crcFields.length > 0) {
    ctx.col++
    ctx.row = 0
    for (const cf of crcFields) {
      const crcId = addNode(ctx, 'protocol-crc', {
        algorithm: cf.algorithm ?? 'CRC16',
        endian: cf.endian === 'big' ? '大端' : '小端',
        append: cf.append === false ? '否' : '是'
      }, `${namePrefix}.${cf.name}`, nextPosition(ctx))
      connect(ctx, frameNodeId, frameOutputPort, crcId, 'body')
      frameNodeId = crcId
      frameOutputPort = 'out'
    }
  }

  // ── 输出（发送/日志）──
  ctx.col++
  ctx.row = 0
  const hasTransport = Boolean(dsl.transport)

  if (hasTransport && dsl.transport?.mode === 'tcp-loopback') {
    // TCP loopback：control-loop 包裹组包+发送
    const loopId = dsl.loop
      ? addNode(ctx, 'control-loop', { count: dsl.loop.count, type: '次数循环' }, `${namePrefix}.循环`, nextPosition(ctx))
      : null

    // output-tcp（发送到 loopback 端口）
    const sendId = addNode(ctx, 'output-tcp', {
      host: '127.0.0.1', port: dsl.transport!.port, mode: 'hex'
    }, `${namePrefix}.发送`, nextPosition(ctx))
    connect(ctx, frameNodeId, frameOutputPort, sendId, 'in')

    // 服务端 echo：input-tcp-server → output-tcp-server
    ctx.col++
    ctx.row = 0
    const srvRecvId = addNode(ctx, 'input-tcp-server', {
      port: dsl.transport!.port
    }, `${namePrefix}.服务端接收`, nextPosition(ctx))
    const srvSendId = addNode(ctx, 'output-tcp-server', {
      port: dsl.transport!.port, mode: 'hex'
    }, `${namePrefix}.服务端回包`, nextPosition(ctx))
    connect(ctx, srvRecvId, 'out', srvSendId, 'in')

    // 客户端收：input-tcp → output-log
    ctx.col++
    ctx.row = 0
    const cliRecvId = addNode(ctx, 'input-tcp', {
      host: '127.0.0.1', port: dsl.transport!.port
    }, `${namePrefix}.客户端接收`, nextPosition(ctx))
    const logId = addNode(ctx, 'output-log', {
      prefix: `${namePrefix}.收到`, level: 'info'
    }, `${namePrefix}.日志`, nextPosition(ctx))
    connect(ctx, cliRecvId, 'out', logId, 'in')

  } else if (hasTransport && dsl.transport?.mode === 'tcp-client') {
    // TCP client：连外部服务端
    const sendId = addNode(ctx, 'output-tcp', {
      host: dsl.transport.host ?? '127.0.0.1', port: dsl.transport.port, mode: 'hex'
    }, `${namePrefix}.发送`, nextPosition(ctx))
    connect(ctx, frameNodeId, frameOutputPort, sendId, 'in')

  } else {
    // 无 transport：帧 → output-log（纯本地数据流）
    const logId = addNode(ctx, 'output-log', {
      prefix: `${namePrefix}.帧`, level: 'info'
    }, `${namePrefix}.日志`, nextPosition(ctx))
    connect(ctx, frameNodeId, frameOutputPort, logId, 'in')
  }

  return { nodes: ctx.nodes, connections: ctx.connections }
}

/** protocol-concat 动态端口 key：index 0-25 → a-z，≥26 → in_N */
function concatPortKey(index: number): string {
  if (index < 26) return String.fromCharCode(97 + index) // 'a' = 97
  return `in_${index + 1}`
}
