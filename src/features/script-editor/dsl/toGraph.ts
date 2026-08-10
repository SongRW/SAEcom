/**
 * DSL → graph 转换器：把 ProtocolDsl 转成合法的 ReteGraphExport。
 *
 * 适配器模式：字段 → 节点的映射由 AdapterRegistry 管理，默认注册 SAEcom 内置
 * 适配器。插件/其他节点系统可注册自己的适配器覆盖默认映射。
 *
 * 布局模型（横向流水线，告别纵向大链）：
 * - 每条消息 = 一条泳道（row 偏移），泳道内字段呈横向网格（col 递增、行换行）
 * - 组包链：帧头常量 → 字段网格 → concat 组帧 → 长度前缀（依赖 body）→ CRC（依赖前序）→ 发送
 * - 接收链：input-tcp → 拆 msgType 识别 → 按共享布局拆帧（长度驱动动态截取、CRC 重算比对）
 * - 多消息类型：每条消息一条泳道 + msgType 识别（v2 模式，接收侧无条件执行）
 *
 * 前后依赖（雄安林草式正算/反算）：
 * - 组包：seq 接循环序号、len-prefix 依赖 body、CRC 依赖全部前序字节、TLV 长度依赖 value
 * - 拆包：先解析长度字段 → 用解析值驱动 body 动态截取 → 重算 CRC 与帧尾比对
 *
 * 保证 graph 契约（importGraphState 不丢节点/连线）：
 * - 连线全部通过 socket 兼容性校验（data→data / bool→data / flow→flow）
 * - control-if 分支仅含 output-log（trigger 输入），与 v2 示例一致
 */

import type { ReteGraphExport, ReteGraphNode, ReteGraphConnection } from '@shared/types'
import type { ProtocolDsl, ProtocolField, MessageSpec } from '@shared/protocol-dsl'
import { AdapterRegistry, type NodeSpecWithOutput } from './adapters'
import { createDefaultRegistry } from './saecomAdapters'
import { validateGraph } from './validateGraph'

// ── 布局常量 ──
const X_STRIDE = 300
const Y_STRIDE = 104
const Y_BASE = 40
/** 泳道内每行字段数（横向网格宽度） */
const GRID_COLS = 10
/** 每条消息泳道占用行数（字段网格 + 间隔） */
const LANE_ROWS = 9

interface BuildCtx {
  nodes: ReteGraphNode[]
  connections: ReteGraphConnection[]
  nextId: number
}

interface Cursor {
  col: number
  row: number
}

function createBuildCtx(): BuildCtx {
  return { nodes: [], connections: [], nextId: 1 }
}

function addNode(
  ctx: BuildCtx,
  key: string,
  data: Record<string, unknown>,
  label: string,
  position: { x: number; y: number }
): string {
  const id = String(ctx.nextId++)
  ctx.nodes.push({ id, key, label, position, data })
  return id
}

function placeNode(ctx: BuildCtx, key: string, data: Record<string, unknown>, label: string, cursor: Cursor): string {
  const pos = { x: cursor.col * X_STRIDE, y: Y_BASE + cursor.row * Y_STRIDE }
  cursor.col++
  return addNode(ctx, key, data, label, pos)
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

/** 把一个简单字段经适配器转成节点（含 preNodes 处理），返回节点 id + 输出端口。
 *  主节点置于网格格位；preNodes 垂直堆叠在格位下方，避免横向溢出。 */
function fieldToNode(
  ctx: BuildCtx,
  field: ProtocolField,
  namePrefix: string,
  fieldIndex: number,
  registry: AdapterRegistry,
  cursor: Cursor
): { id: string; outputPort: string } | null {
  const adapter = registry.resolve(field)
  if (!adapter) return null

  const spec = adapter(field, { namePrefix, fieldIndex }) as NodeSpecWithOutput | null
  if (!spec) return null

  const mainPos = { x: cursor.col * X_STRIDE, y: Y_BASE + cursor.row * Y_STRIDE }
  cursor.col++

  // preNodes：堆叠在主节点正下方（同列，行递增）
  const preNodes = spec.preNodes ?? []
  preNodes.forEach((pre, k) => {
    const preId = addNode(ctx, pre.key, pre.data, pre.label, { x: mainPos.x, y: mainPos.y + (k + 1) * Y_STRIDE })
    ;(pre as any)._id = preId
  })

  // 创建主节点
  const id = addNode(ctx, spec.key, spec.data, spec.label, mainPos)

  // 补 preNodes → 主节点的连线
  for (const pre of preNodes) {
    connect(ctx, (pre as any)._id, 'out', id, pre.toInput)
  }

  return { id, outputPort: spec.outputPort }
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
    case 'tlv': {
      // type(1) + len(1) + value 字节
      return field.entries.reduce((sum, entry) => {
        const valueBytes = entry.mode === 'text'
          ? new TextEncoder().encode(entry.value).length
          : Math.max(1, Math.ceil(entry.value.replace(/\s/g, '').length / 2))
        return sum + 2 + valueBytes
      }, 0)
    }
    case 'repeat-block': {
      const blockSize = field.blockFields.reduce((sum, f) => sum + fieldByteWidth(f), 0)
      return 1 + (field.count ?? 1) * blockSize // count(1) + count × block
    }
    case 'optional': return fieldByteWidth(field.field)
    default: return 2
  }
}

/** 帧头公共字段（magic/version/msgType/seq），仅多消息 DSL 自动加入。 */
function headerFields(msg: MessageSpec, index: number): ProtocolField[] {
  return [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'const', name: 'version', value: '03', mode: 'hex' },
    { kind: 'uint', name: 'msgType', width: 1, value: msg.typeId ?? index + 1 },
    { kind: 'uint', name: 'seq', width: 2, value: 0 }
  ]
}

/** 消息内是否存在可选字段 → 需要 flags 字节（置于帧头之后）。 */
function hasOptionalField(fields: ProtocolField[]): boolean {
  return fields.some(f => f.kind === 'optional')
}

// ═══════════════════════════════════════════════════════════
// 嵌套结构组包（正算）——字段间前后依赖
// ═══════════════════════════════════════════════════════════

/** TLV 条目：type const + len-prefix(value)（长度依赖 value），条目 concat 后链入主 concat。 */
function emitTlvAssembly(
  ctx: BuildCtx,
  field: Extract<ProtocolField, { kind: 'tlv' }>,
  cursor: Cursor
): { id: string; outputPort: string } | null {
  const entryOutputs: Array<{ id: string; outputPort: string }> = []
  for (const entry of field.entries) {
    const typeId = placeNode(ctx, 'protocol-const', {
      mode: 'hex',
      content: entry.type.toString(16).toUpperCase().padStart(2, '0'),
      width: 1
    }, `${field.name}.类型T${entry.type.toString(16)}`, cursor)
    const valueId = placeNode(ctx, 'protocol-const', {
      mode: entry.mode === 'text' ? 'text' : 'hex',
      content: entry.value,
      width: 1,
      encoding: 'utf8'
    }, `${field.name}.值T${entry.type.toString(16)}`, cursor)
    // 长度依赖 value：len-prefix(body=value) → len+value
    const lenWrapId = placeNode(ctx, 'protocol-len-prefix', { width: 'u8' }, `${field.name}.长度T${entry.type.toString(16)}`, cursor)
    connect(ctx, valueId, 'out', lenWrapId, 'body')
    const entryId = placeNode(ctx, 'protocol-concat', { ports: 2 }, `${field.name}.条目T${entry.type.toString(16)}`, cursor)
    connect(ctx, typeId, 'out', entryId, 'a')
    connect(ctx, lenWrapId, 'out', entryId, 'b')
    entryOutputs.push({ id: entryId, outputPort: 'out' })
  }
  if (entryOutputs.length === 0) return null
  if (entryOutputs.length === 1) return entryOutputs[0]
  // 多个条目：链式 concat（横向流水线）
  const chainId = placeNode(ctx, 'protocol-concat', { ports: entryOutputs.length }, `${field.name}.合并`, cursor)
  entryOutputs.forEach((eo, i) => connect(ctx, eo.id, eo.outputPort, chainId, concatPortKey(i)))
  return { id: chainId, outputPort: 'out' }
}

/** repeat-block：count const + 块字段 × count，一块 concat 拼入。 */
function emitRepeatAssembly(
  ctx: BuildCtx,
  field: Extract<ProtocolField, { kind: 'repeat-block' }>,
  registry: AdapterRegistry,
  cursor: Cursor
): { id: string; outputPort: string } | null {
  const count = field.count ?? 1
  const countId = placeNode(ctx, 'protocol-const', { mode: 'decimal', content: String(count), width: 1 }, `${field.name}.数量`, cursor)
  const outputs: Array<{ id: string; outputPort: string }> = [{ id: countId, outputPort: 'out' }]
  for (let i = 0; i < count; i++) {
    for (const bf of field.blockFields) {
      const result = fieldToNode(ctx, bf, `${field.name}.块${i + 1}`, i, registry, cursor)
      if (result) outputs.push(result)
    }
  }
  const blockId = placeNode(ctx, 'protocol-concat', { ports: outputs.length }, `${field.name}.块拼接`, cursor)
  outputs.forEach((o, i) => connect(ctx, o.id, o.outputPort, blockId, concatPortKey(i)))
  return { id: blockId, outputPort: 'out' }
}

/** 组包：一个字段 → 节点（含嵌套结构），返回输出 id+port。 */
function emitAssemblyField(
  ctx: BuildCtx,
  field: ProtocolField,
  prefix: string,
  index: number,
  registry: AdapterRegistry,
  cursor: Cursor
): { id: string; outputPort: string } | null {
  if (field.kind === 'tlv') return emitTlvAssembly(ctx, field, cursor)
  if (field.kind === 'repeat-block') return emitRepeatAssembly(ctx, field, registry, cursor)
  // optional：组包侧按 flag=1 拼入（拆包侧按 flag 位条件检查）
  if (field.kind === 'optional') return fieldToNode(ctx, field.field, `${prefix}.${field.name}`, index, registry, cursor)
  return fieldToNode(ctx, field, prefix, index, registry, cursor)
}

// ═══════════════════════════════════════════════════════════
// 嵌套结构拆包（反算）——长度解析 → 动态截取
// ═══════════════════════════════════════════════════════════

/** 接收侧日志 sink：console=控制台；file=写文件（压测防刷屏）；off=不生成。 */
export interface ReceiveLogSink {
  mode: 'console' | 'file' | 'off'
  filePath: string
}

/**
 * 创建一个接收侧日志节点：console → output-log；file → output-file（追加）。
 * file 模式先经 string-template 拼 `[字段名] 值\n`，保证文件可读（每行一个字段）。
 * @param valueId 日志数据来源节点
 * @param sourceOutput 数据来源输出端口
 */
function createLogNode(
  ctx: BuildCtx,
  sink: ReceiveLogSink,
  prefix: string,
  label: string,
  cursor: Cursor,
  valueId: string,
  sourceOutput = 'out'
): void {
  if (sink.mode === 'off') return
  if (sink.mode === 'file') {
    // 字段名 + 时间戳 + 值 + 换行：`[HH:mm:ss.SSS][字段名] 值\n`
    // {1} 绑定 value1 输入端口（字段值）；
    // 时间戳 + 字段名 + 值：`本地时间.毫秒 [字段名] 值\n`
    // 用数组 join 构造 template，避免引号嵌套。${...} 是字面文本（不是 JS 插值），
    // 原样进入 string-template 的 template 字段，codegen 放进反引号字符串后运行时求值。
    const tsExpr = '${new Date().toLocaleString("zh-CN",{hour12:false})}.${(new Date().getMilliseconds()+"").padStart(3,"0")}'
    const template = tsExpr + ' [' + prefix + '] {1}\n'
    const lineId = placeNode(ctx, 'string-template', { template }, label, cursor)
    connect(ctx, valueId, sourceOutput, lineId, 'value1')
    const logId = placeNode(ctx, 'output-file', { path: sink.filePath, mode: '追加' }, `${label}.落盘`, cursor)
    connect(ctx, lineId, 'out', logId, 'in')
    return
  }
  const logId = placeNode(ctx, 'output-log', { prefix, level: 'info' }, label, cursor)
  connect(ctx, valueId, sourceOutput, logId, 'in')
}

/**
 * 拆包一个字段（固定 offset + 动态 length 版）。
 *
 * 设计（v3 bug 修复）：
 * - slice.start 用编译期固定的 layout.offset（基于 fieldByteWidth 累加）。
 *   v3 的组包与拆包用同一套 DSL 声明，固定 offset 与运行时帧布局一致。
 * - 动态长度字段（tlv-value / len-prefix-body）的 slice.length 接解析出的 len 值，
 *   而非 DSL 声明的固定字节数。这是 TLV/repeat 结构「前后依赖」的核心。
 * - TLV 条目间的 entryOffset 累加：type(1)+len(1)+value(valueBytes) 逐项推进，
 *   与 fieldByteWidth(tlv) 的静态宽度计算一致。
 * - CRC endian 感知：little-endian CRC16 经 transform-byteorder 转大端后再比对。
 *
 * @param flagsOffset flags 字节在帧中的固定偏移（可选字段存在性检查用；无可选字段时为 -1）
 */
function emitParseField(
  ctx: BuildCtx,
  field: ProtocolField,
  layout: { offset: number; length: number },
  frameId: string,
  prefix: string,
  cursor: Cursor,
  flagsOffset: number,
  sink: ReceiveLogSink
): void {
  switch (field.kind) {
    case 'const': {
      const sliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.拆.${field.name}`, cursor)
      connect(ctx, frameId, 'out', sliceId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, sliceId)
      break
    }
    case 'uint': {
      const sliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.拆.${field.name}`, cursor)
      connect(ctx, frameId, 'out', sliceId, 'hex')
      const parseId = placeNode(ctx, 'protocol-parse-u', { width: field.width, endian: field.endian === 'little' ? '小端' : '大端' }, `${prefix}.解析.${field.name}`, cursor)
      connect(ctx, sliceId, 'out', parseId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, parseId)
      break
    }
    case 'text': {
      const sliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.拆.${field.name}`, cursor)
      connect(ctx, frameId, 'out', sliceId, 'hex')
      const decodeId = placeNode(ctx, 'protocol-decode-text', { encoding: field.encoding ?? 'utf8' }, `${prefix}.解码.${field.name}`, cursor)
      connect(ctx, sliceId, 'out', decodeId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, decodeId)
      break
    }
    case 'bitfield': {
      const sliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.拆.${field.name}`, cursor)
      connect(ctx, frameId, 'out', sliceId, 'hex')
      const fields = field.fields.map((f, i) => ({ id: `f${i}`, name: f.name, bits: f.bits }))
      const unpackId = placeNode(ctx, 'protocol-bitfield', { mode: '解包', fields }, `${prefix}.解包.${field.name}`, cursor)
      connect(ctx, sliceId, 'out', unpackId, 'hex')
      fields.forEach((f) => {
        createLogNode(ctx, sink, `${prefix}.${field.name}.${f.name}`, `${prefix}.日志.${field.name}.${f.name}`, cursor, unpackId, `field_${f.id}`)
      })
      break
    }
    case 'custom': {
      const sliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.拆.${field.name}`, cursor)
      connect(ctx, frameId, 'out', sliceId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, sliceId)
      break
    }
    case 'tlv': {
      // 逐条目：type(1) + len(1) + value(动态长度 ← len 解析值)
      // entryOffset 累加：type(1) + len(1) + value 字节数，与 fieldByteWidth(tlv) 一致
      let entryOffset = layout.offset
      for (const entry of field.entries) {
        const typeHex = entry.type.toString(16).toUpperCase().padStart(2, '0')
        const valueBytes =
          entry.mode === 'text'
            ? new TextEncoder().encode(entry.value).length
            : Math.max(1, Math.ceil(entry.value.replace(/\s/g, '').length / 2))

        // type slice（固定 offset）
        const typeSliceId = placeNode(ctx, 'protocol-slice', { start: entryOffset, length: 1 }, `${prefix}.${field.name}.T${typeHex}.类型`, cursor)
        connect(ctx, frameId, 'out', typeSliceId, 'hex')
        const typeParseId = placeNode(ctx, 'protocol-parse-u', { width: 1, endian: '大端' }, `${prefix}.${field.name}.T${typeHex}.类型值`, cursor)
        connect(ctx, typeSliceId, 'out', typeParseId, 'hex')
        createLogNode(ctx, sink, `${prefix}.${field.name}.T${typeHex}`, `${prefix}.日志.${field.name}.T${typeHex}.类型`, cursor, typeParseId)

        // len slice（固定 offset）
        const lenSliceId = placeNode(ctx, 'protocol-slice', { start: entryOffset + 1, length: 1 }, `${prefix}.${field.name}.T${typeHex}.长度`, cursor)
        connect(ctx, frameId, 'out', lenSliceId, 'hex')
        const lenParseId = placeNode(ctx, 'protocol-parse-u', { width: 1, endian: '大端' }, `${prefix}.${field.name}.T${typeHex}.长度值`, cursor)
        connect(ctx, lenSliceId, 'out', lenParseId, 'hex')
        createLogNode(ctx, sink, `${prefix}.${field.name}.长度`, `${prefix}.日志.${field.name}.T${typeHex}.长度`, cursor, lenParseId)

        // value slice：length 接 lenParseId（运行时动态长度，v3 T12 越界 bug 核心修复）
        const valueSliceId = placeNode(ctx, 'protocol-slice', { start: entryOffset + 2, length: 0 }, `${prefix}.${field.name}.T${typeHex}.值`, cursor)
        connect(ctx, frameId, 'out', valueSliceId, 'hex')
        connect(ctx, lenParseId, 'out', valueSliceId, 'length')
        createLogNode(ctx, sink, `${prefix}.${field.name}.值T${typeHex}`, `${prefix}.日志.${field.name}.T${typeHex}.值`, cursor, valueSliceId)

        // entryOffset 推进：type(1) + len(1) + value(valueBytes)
        entryOffset += 2 + valueBytes
      }
      break
    }
    case 'repeat-block': {
      // count slice → 解析；块按固定 offset 逐一拆解
      const countSliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: 1 }, `${prefix}.${field.name}.数量`, cursor)
      connect(ctx, frameId, 'out', countSliceId, 'hex')
      const countParseId = placeNode(ctx, 'protocol-parse-u', { width: 1, endian: '大端' }, `${prefix}.${field.name}.数量值`, cursor)
      connect(ctx, countSliceId, 'out', countParseId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}.数量`, `${prefix}.日志.${field.name}.数量`, cursor, countParseId)

      const count = field.count ?? 1
      let blockOffset = layout.offset + 1
      for (let i = 0; i < count; i++) {
        for (const bf of field.blockFields) {
          const bfWidth = fieldByteWidth(bf)
          const bSliceId = placeNode(ctx, 'protocol-slice', { start: blockOffset, length: bfWidth }, `${prefix}.${field.name}.块${i + 1}.${bf.name}`, cursor)
          connect(ctx, frameId, 'out', bSliceId, 'hex')
          createLogNode(ctx, sink, `${prefix}.${field.name}.块${i + 1}.${bf.name}`, `${prefix}.日志.${field.name}.块${i + 1}.${bf.name}`, cursor, bSliceId)
          blockOffset += bfWidth
        }
      }
      break
    }
    case 'optional': {
      // flags 位检查：解析 flags → 与 mask → 不等于 0 → 日志（存在性检查）
      if (flagsOffset >= 0) {
        const flagSliceId = placeNode(ctx, 'protocol-slice', { start: flagsOffset, length: 1 }, `${prefix}.${field.name}.标志位`, cursor)
        connect(ctx, frameId, 'out', flagSliceId, 'hex')
        const flagParseId = placeNode(ctx, 'protocol-parse-u', { width: 1, endian: '大端' }, `${prefix}.${field.name}.标志值`, cursor)
        connect(ctx, flagSliceId, 'out', flagParseId, 'hex')
        const maskId = placeNode(ctx, 'numeric-calc', { operator: '与', operand2: String(1 << field.flagBit) }, `${prefix}.${field.name}.掩码`, cursor)
        connect(ctx, flagParseId, 'out', maskId, 'left')
        const cmpId = placeNode(ctx, 'compare-neq', { operand: '0' }, `${prefix}.${field.name}.存在?`, cursor)
        connect(ctx, maskId, 'out', cmpId, 'left')
        createLogNode(ctx, sink, `${prefix}.${field.name}存在`, `${prefix}.日志.${field.name}存在`, cursor, cmpId, 'result')
      }
      // 字段本身：直接拆解（v3 组装恒置 flag=1）
      const fieldSliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: fieldByteWidth(field.field) }, `${prefix}.${field.name}.字段`, cursor)
      connect(ctx, frameId, 'out', fieldSliceId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, fieldSliceId)
      break
    }
    case 'crc': {
      // CRC 校验：拆帧尾 CRC（固定 offset）→ 重算前序字节 → compare-eq（endian 感知）→ 日志
      const crcSliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.${field.name}`, cursor)
      connect(ctx, frameId, 'out', crcSliceId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, crcSliceId)
      // 重算源：前序全部字节 = frame[0, crcStart)（固定 length = layout.offset）
      const bodySliceId = placeNode(ctx, 'protocol-slice', { start: 0, length: layout.offset }, `${prefix}.${field.name}重算源`, cursor)
      connect(ctx, frameId, 'out', bodySliceId, 'hex')
      const crcCalcId = placeNode(ctx, 'protocol-crc', {
        algorithm: field.algorithm ?? 'CRC16',
        endian: field.endian === 'big' ? '大端' : '小端',
        append: '否'
      }, `${prefix}.${field.name}重算`, cursor)
      connect(ctx, bodySliceId, 'out', crcCalcId, 'body')
      // endian 感知比对：little-endian CRC16 经 transform-byteorder 转大端后再比
      let compareLeftId = crcCalcId
      let compareLeftPort = 'out'
      if (field.endian === 'little' && (field.algorithm ?? 'CRC16') === 'CRC16') {
        const swapId = placeNode(ctx, 'transform-byteorder', { type: '小端→大端', size: '2字节' }, `${prefix}.${field.name}字节序转换`, cursor)
        connect(ctx, crcCalcId, 'out', swapId, 'in')
        compareLeftId = swapId
        compareLeftPort = 'out'
      }
      const cmpId = placeNode(ctx, 'compare-eq', {}, `${prefix}.${field.name}校验`, cursor)
      connect(ctx, compareLeftId, compareLeftPort, cmpId, 'left')
      connect(ctx, crcSliceId, 'out', cmpId, 'right')
      createLogNode(ctx, sink, `${prefix}.${field.name}通过?`, `${prefix}.日志.${field.name}校验`, cursor, cmpId, 'result')
      break
    }
    case 'length-prefix': {
      // 长度前缀：拆长度 → 解析 → 驱动 body 动态截取（前后依赖核心）
      const lenWidth = field.width === 'u16' ? 2 : 1
      const lenSliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: lenWidth }, `${prefix}.${field.name}`, cursor)
      connect(ctx, frameId, 'out', lenSliceId, 'hex')
      const lenParseId = placeNode(ctx, 'protocol-parse-u', { width: lenWidth, endian: '大端' }, `${prefix}.${field.name}值`, cursor)
      connect(ctx, lenSliceId, 'out', lenParseId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${field.name}`, `${prefix}.日志.${field.name}`, cursor, lenParseId)
      // body 截取：start = layout.offset + lenWidth（固定），length 接 lenParseId（运行时动态长度）
      const bodySliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset + lenWidth, length: 0 }, `${prefix}.body(动态)`, cursor)
      connect(ctx, frameId, 'out', bodySliceId, 'hex')
      connect(ctx, lenParseId, 'out', bodySliceId, 'length')
      createLogNode(ctx, sink, `${prefix}.body`, `${prefix}.日志.body`, cursor, bodySliceId)
      break
    }
    default: {
      const f = field as ProtocolField
      const sliceId = placeNode(ctx, 'protocol-slice', { start: layout.offset, length: layout.length }, `${prefix}.拆.${f.name}`, cursor)
      connect(ctx, frameId, 'out', sliceId, 'hex')
      createLogNode(ctx, sink, `${prefix}.${f.name}`, `${prefix}.日志.${f.name}`, cursor, sliceId)
      break
    }
  }
}


// ═══════════════════════════════════════════════════════════
// 泳道组包（一条消息 = 一条泳道）
// ═══════════════════════════════════════════════════════════

interface LaneResult {
  frameNodeId: string
  frameOutputPort: string
  /** seq 常量节点 id（供循环序号接线） */
  seqNodeId: string | null
}

/**
 * 组装一条消息泳道：帧头常量 → flags → 字段网格 → concat → len-prefix → crc → 输出。
 * 字段按 GRID_COLS 横向网格排布（col 递增、行换行），组帧链在泳道右侧向右延伸。
 */
function buildAssemblyLane(
  ctx: BuildCtx,
  msg: MessageSpec,
  mi: number,
  namePrefix: string,
  registry: AdapterRegistry,
  fieldsOnly: boolean
): LaneResult {
  const label = `${namePrefix}.${msg.msgType}`
  const baseRow = 1 + mi * LANE_ROWS
  const header = fieldsOnly ? [] : headerFields(msg, mi)
  const flagsByte: ProtocolField | null = hasOptionalField(msg.fields)
    ? { kind: 'const', name: 'flags', value: 'FF', mode: 'hex', width: 1 }
    : null
  const bodyFields = msg.fields.filter(f => f.kind !== 'crc' && f.kind !== 'length-prefix')
  const crcFields = msg.fields.filter(f => f.kind === 'crc')
  const lenFields = msg.fields.filter(f => f.kind === 'length-prefix')

  // 组包顺序 = 帧头 + flags + 字段（与拆包布局一致）
  const gridFields: ProtocolField[] = [...header, ...(flagsByte ? [flagsByte] : []), ...bodyFields]

  const fieldOutputs: Array<{ id: string; outputPort: string }> = []
  let seqNodeId: string | null = null

  // 简单字段进网格（横向 GRID_COLS 排列、行换行）；嵌套结构（TLV/repeat）独占下方泳道行，
  // 避免横向溢出与 concat 列重叠
  let gridRows = 1
  const compositeFields: Array<{ field: ProtocolField; index: number }> = []
  gridFields.forEach((field, i) => {
    if (field.kind === 'tlv' || field.kind === 'repeat-block') {
      compositeFields.push({ field, index: i })
      return
    }
    const row = baseRow + Math.floor(i / GRID_COLS)
    const col = i % GRID_COLS
    const cell: Cursor = { col, row }
    const result = emitAssemblyField(ctx, field, label, i, registry, cell)
    if (result) {
      fieldOutputs.push(result)
      if (field.kind === 'uint' && field.name === 'seq') seqNodeId = result.id
    }
    gridRows = Math.max(gridRows, Math.floor(i / GRID_COLS) + 1)
  })
  compositeFields.forEach(({ field, index }, ci) => {
    const cell: Cursor = { col: 0, row: baseRow + gridRows + ci }
    const result = emitAssemblyField(ctx, field, label, index, registry, cell)
    if (result) fieldOutputs.push(result)
  })

  // 组帧 concat：置于字段网格右侧（泳道首行）
  const concatCursor: Cursor = { col: GRID_COLS + 2, row: baseRow }
  const concatPortCount = Math.max(2, fieldOutputs.length)
  const concatId = placeNode(ctx, 'protocol-concat', { ports: concatPortCount }, `${label}.组帧`, concatCursor)
  fieldOutputs.forEach((fo, i) => {
    connect(ctx, fo.id, fo.outputPort, concatId, concatPortKey(i))
  })

  let frameNodeId = concatId
  let frameOutputPort = 'out'

  // length-prefix（依赖 body）
  for (const lf of lenFields) {
    const result = fieldToNode(ctx, lf, label, 0, registry, concatCursor)
    if (!result) continue
    connect(ctx, frameNodeId, frameOutputPort, result.id, 'body')
    frameNodeId = result.id
    frameOutputPort = result.outputPort
  }

  // CRC（依赖全部前序字节）
  for (const cf of crcFields) {
    const result = fieldToNode(ctx, cf, label, 0, registry, concatCursor)
    if (!result) continue
    connect(ctx, frameNodeId, frameOutputPort, result.id, 'body')
    frameNodeId = result.id
    frameOutputPort = result.outputPort
  }

  return { frameNodeId, frameOutputPort, seqNodeId }
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

/**
 * 循环内压测进度节流日志：每 every 帧输出一行控制台摘要。
 * 结构：loop.out → numeric-calc(取余 every) → compare-eq(0) → control-if
 *       → true → output-log.trigger；日志数据来自 input-manual 叶子（v2 模式：
 *       叶子仅经 emitLeafSources 在分支内就地 emit，避免数据链+分支双发射）。
 * 只生成一次（挂在 loop.out 数据链上，随循环重复执行）。
 */
function emitProgressLog(ctx: BuildCtx, loopId: string, every: number, namePrefix: string): void {
  // 进度链从循环节点右侧展开（col 1 起），避免与 loop 重叠
  const cursor: Cursor = { col: 1, row: 0 }
  // 进度计算链挂在 loop.out 上（在循环体内执行）
  const calcId = placeNode(ctx, 'numeric-calc', { operator: '取余', operand2: String(every) }, `${namePrefix}.进度取余${every}`, cursor)
  connect(ctx, loopId, 'out', calcId, 'left')
  const cmpId = placeNode(ctx, 'compare-eq', { operand: '0' }, `${namePrefix}.进度到点?`, cursor)
  connect(ctx, calcId, 'out', cmpId, 'left')
  const ifId = placeNode(ctx, 'control-if', {}, `${namePrefix}.进度分支`, cursor)
  connect(ctx, cmpId, 'result', ifId, 'condition')
  // 日志数据 = 叶子常量（仅分支内就地 emit，不接 loop.out 避免双发射）
  const leafId = placeNode(ctx, 'input-manual', { content: '✓', mode: 'text' }, `${namePrefix}.进度标记`, cursor)
  const logId = placeNode(ctx, 'output-log', { prefix: `${namePrefix}.进度·每${every}帧`, level: 'info' }, `${namePrefix}.日志.进度`, cursor)
  connect(ctx, leafId, 'out', logId, 'in')
  connect(ctx, ifId, 'true', logId, 'trigger')
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

  // 简单协议用 fields（无自动帧头，向后兼容）；复杂协议用 messages（多消息类型）。
  const multiMessage = Boolean(dsl.messages && dsl.messages.length > 0)
  const messages: MessageSpec[] = multiMessage
    ? dsl.messages!
    : [{ msgType: 'FRAME', typeId: 1, fields: dsl.fields ?? [] }]

  const hasTransport = Boolean(dsl.transport)
  const verifyOnRecv = dsl.verifyOnRecv !== false
  // 接收侧日志 sink：压测时字段明细写文件，控制台静默（仅循环内节流进度）
  const receiveLogMode = dsl.receiveLog ?? 'console'
  const sink: ReceiveLogSink = receiveLogMode === 'file'
    ? { mode: 'file', filePath: dsl.receiveLogPath ?? `script-logs/${namePrefix}.log` }
    : { mode: receiveLogMode === 'off' ? 'off' : 'console', filePath: '' }

  // ══ 顶层循环（包裹所有组包泳道；loop.out → 各泳道 seq 常量 content）══
  // 注意：count===1 且无 seq 字段时不生成循环——单次执行无需循环，否则 control-loop 会无
  // outgoing（validateGraph 报 loop-no-outgoing error），且 codegen 产出空 for 循环体。
  const hasSeqField = messages.some((m) => m.fields.some((f) => f.kind === 'uint' && f.name === 'seq'))
  const needsLoop = !!dsl.loop && (dsl.loop.count > 1 || hasSeqField)
  const loopId = needsLoop
    ? addNode(ctx, 'control-loop', { count: dsl.loop!.count, type: '次数循环' }, `${namePrefix}.循环${dsl.loop!.count}次`, { x: 0, y: Y_BASE })
    : null

  // ══ 组装区：每条消息一条泳道 ══
  const lanes: LaneResult[] = []
  messages.forEach((msg, mi) => {
    lanes.push(buildAssemblyLane(ctx, msg, mi, namePrefix, reg, !multiMessage))
  })

  // 循环序号接线：loop.out → 每条泳道 seq 常量 content（seq 依赖循环，前后依赖）
  if (loopId) {
    for (const lane of lanes) {
      if (lane.seqNodeId) connect(ctx, loopId, 'out', lane.seqNodeId, 'content')
    }
    // 压测进度节流：循环体内每 progressEvery 帧打一行控制台摘要（file 模式专用）
    if (receiveLogMode === 'file') {
      emitProgressLog(ctx, loopId, dsl.progressEvery ?? 10, namePrefix)
    }
  }

  // ══ 无 transport：纯本地日志输出 ══
  if (!hasTransport) {
    const cursor: Cursor = { col: GRID_COLS + 3, row: 1 + messages.length * LANE_ROWS }
    for (const lane of lanes) {
      const logId = placeNode(ctx, 'output-log', { prefix: `${namePrefix}.帧`, level: 'info' }, `${namePrefix}.日志`, cursor)
      connect(ctx, lane.frameNodeId, lane.frameOutputPort, logId, 'in')
    }
    const result = { nodes: ctx.nodes, connections: ctx.connections }
    validateGraph(result)
    return result
  }

  // ══ 发送节点（每条泳道一个，置于泳道首行末尾）；端口统一走「端口常量」联动 ══
  const transport = dsl.transport!
  // 端口常量节点：用户只改这一处，所有 TCP 节点自动同步（codegen 内联 content）
  const portConstId = transport.mode === 'tcp-client'
    ? addNode(ctx, 'input-manual', { content: String(transport.port), mode: 'text' }, `${namePrefix}.端口(改这里)`, { x: 0, y: Y_BASE + (1 + messages.length * LANE_ROWS) * Y_STRIDE })
    : null

  messages.forEach((msg, mi) => {
    const lane = lanes[mi]
    const cursor: Cursor = { col: GRID_COLS + 3, row: 1 + mi * LANE_ROWS }
    if (transport.mode === 'tcp-loopback') {
      const sendId = placeNode(ctx, 'output-tcp', { host: '127.0.0.1', port: transport.port, mode: 'hex' }, `${namePrefix}.${msg.msgType}.发送`, cursor)
      connect(ctx, lane.frameNodeId, lane.frameOutputPort, sendId, 'in')
    } else {
      const sendId = placeNode(ctx, 'output-tcp', { host: transport.host ?? '127.0.0.1', mode: 'hex' }, `${namePrefix}.${msg.msgType}.发送`, cursor)
      connect(ctx, lane.frameNodeId, lane.frameOutputPort, sendId, 'in')
      if (portConstId) connect(ctx, portConstId, 'out', sendId, 'port')
    }
  })

  // tcp-client 模式：端口由用户填写（连本地 TCP 服务器面板/环回 echo 服务）。
  // 画布上有「端口(改这里)」常量节点，改它即全局生效。
  if (transport.mode === 'tcp-client') {
    addNode(ctx, 'input-manual',
      { content: `端口填写：改「${namePrefix}.端口(改这里)」节点的 content 为本地 TCP 面板端口（当前 ${transport.port}），所有发送/接收节点自动同步`, mode: 'text' },
      `${namePrefix}.端口说明`,
      { x: 0, y: Y_BASE + (2 + messages.length * LANE_ROWS) * Y_STRIDE }
    )
  }

  // ══ 接收区：拆包反算（横向流水线）══
  const recvBaseRow = 2 + messages.length * LANE_ROWS
  const recvCursor: Cursor = { col: 0, row: recvBaseRow }

  if (transport.mode === 'tcp-loopback') {
    // 自建服务端回环
    const srvRecvId = placeNode(ctx, 'input-tcp-server', { port: transport.port }, `${namePrefix}.服务端接收`, recvCursor)
    const srvSendId = placeNode(ctx, 'output-tcp-server', { port: transport.port, mode: 'hex' }, `${namePrefix}.服务端回包`, recvCursor)
    connect(ctx, srvRecvId, 'out', srvSendId, 'in')

    const cliRecvId = placeNode(ctx, 'input-tcp', { host: '127.0.0.1', port: transport.port }, `${namePrefix}.客户端接收`, recvCursor)
    if (verifyOnRecv) buildReceiveParse(ctx, messages, cliRecvId, recvCursor, namePrefix, reg, !multiMessage, sink)
  } else {
    // tcp-client：连外部服务端，端口走端口常量联动
    const cliRecvId = placeNode(ctx, 'input-tcp', { host: transport.host ?? '127.0.0.1' }, `${namePrefix}.接收`, recvCursor)
    if (portConstId) connect(ctx, portConstId, 'out', cliRecvId, 'port')
    if (verifyOnRecv) buildReceiveParse(ctx, messages, cliRecvId, recvCursor, namePrefix, reg, !multiMessage, sink)
  }

  const finalResult = { nodes: ctx.nodes, connections: ctx.connections }
  validateGraph(finalResult)
  return finalResult
}

/**
 * 接收侧拆包链（反算，与组装同布局）。
 * 布局顺序 = 长度前缀 + 帧头 + flags + 字段 + CRC（frame 顺序，与组包一致）。
 * 布局形式：简单字段每 3 列一带（slice/parse/log）、每行 3 个；嵌套/校验结构独占行，
 * 避免横向溢出成单行超长链。
 */
function buildReceiveParse(
  ctx: BuildCtx,
  messages: MessageSpec[],
  recvId: string,
  recvCursor: Cursor,
  namePrefix: string,
  registry: AdapterRegistry,
  fieldsOnly: boolean,
  sink: ReceiveLogSink
): void {
  const primary = messages[0]
  const header = fieldsOnly ? [] : headerFields(primary, 0)
  const flagsByte: ProtocolField | null = hasOptionalField(primary.fields)
    ? { kind: 'const', name: 'flags', value: 'FF', mode: 'hex', width: 1 }
    : null
  const lenFields = primary.fields.filter(f => f.kind === 'length-prefix')
  const crcFields = primary.fields.filter(f => f.kind === 'crc')
  const bodyFields = primary.fields.filter(f => f.kind !== 'crc' && f.kind !== 'length-prefix')

  // frame 顺序布局
  const orderFields: ProtocolField[] = [
    ...lenFields,
    ...header,
    ...(flagsByte ? [flagsByte] : []),
    ...bodyFields,
    ...crcFields
  ]
  const layout: Array<{ name: string; offset: number; length: number }> = []
  let offset = 0
  for (const f of orderFields) {
    layout.push({ name: f.name, offset, length: fieldByteWidth(f) })
    offset += fieldByteWidth(f)
  }
  const flagsOffset = flagsByte ? layout.find(l => l.name === 'flags')!.offset : -1

  // 多消息：拆 msgType → 解析 → 日志（识别；file 模式下同样进文件，控制台静默）
  if (!fieldsOnly && messages.length > 0) {
    const msgTypeOffset = layout.find(l => l.name === 'msgType')?.offset ?? 0
    const typeSliceId = placeNode(ctx, 'protocol-slice', { start: msgTypeOffset, length: 1 }, `${namePrefix}.拆.msgType`, recvCursor)
    connect(ctx, recvId, 'out', typeSliceId, 'hex')
    const typeParseId = placeNode(ctx, 'protocol-parse-u', { width: 1, endian: '大端' }, `${namePrefix}.msgType值`, recvCursor)
    connect(ctx, typeSliceId, 'out', typeParseId, 'hex')
    createLogNode(ctx, sink, `${namePrefix}.msgType`, `${namePrefix}.日志.msgType`, recvCursor, typeParseId)
  }

  // 拆包网格：简单字段 3 列一带（slice/parse/log），嵌套/校验结构独占一行
  const BAND = 3
  let bandCol = 0
  let bandRow = recvCursor.row + 2
  let heavyRow = bandRow

  const isHeavy = (kind: string): boolean =>
    kind === 'tlv' || kind === 'repeat-block' || kind === 'optional' || kind === 'crc' || kind === 'length-prefix' || kind === 'bitfield'

  for (const fl of layout) {
    const field = orderFields.find(f => f.name === fl.name)
    if (!field) continue
    let cursor: Cursor
    if (isHeavy(field.kind)) {
      cursor = { col: 0, row: heavyRow }
      heavyRow += 2
    } else {
      cursor = { col: bandCol, row: bandRow }
      bandCol += BAND
      if (bandCol >= GRID_COLS) {
        bandCol = 0
        bandRow += 2
      }
    }
    // 运行时偏移链：每个字段的 slice.start 接前序 cursor 节点，累加推进
    emitParseField(ctx, field, fl, recvId, namePrefix, cursor, flagsOffset, sink)
  }
}
