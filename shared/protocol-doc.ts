/**
 * 协议文档类型 —— 三步 pipeline 的中间产物。
 *
 * 设计意图：
 * - 第一步（generateProtocolDoc）把 ProtocolDsl 转成结构化文档，标注每个字段的
 *   偏移（静态/动态）、宽度、字节序、依赖关系。
 * - 第二步（validateProtocolFrame）用文档里的布局信息 + 示例帧做真实拆分验证。
 * - 第三步（convertDocToGraph）按文档生成 graph，动态字段用运行时偏移链。
 *
 * 这是 v3「编译期固定 offset」问题的核心解法：文档显式标注哪些字段是动态偏移，
 * 第三步据此生成 cursor 累加节点链，而非硬编码 slice.start。
 */

import type { ProtocolField } from './protocol-dsl'

/** 字段种类（与 ProtocolField.kind 对齐，补充拆包内部用的子种类） */
export type FieldKind =
  | 'const'
  | 'uint'
  | 'text'
  | 'bitfield'
  | 'length-prefix'
  | 'crc'
  | 'custom'
  | 'tlv-type'
  | 'tlv-len'
  | 'tlv-value'
  | 'repeat-count'
  | 'repeat-block-item'
  | 'optional-flag'
  | 'optional-field'

/** 偏移计算方式 */
export type OffsetMode =
  | 'static' // 固定偏移（字段位置在编译期可确定）
  | 'dynamic' // 动态偏移（运行时由 cursor 累加计算，受前序动态字段影响）

/** 动态长度来源（驱动 actualLength 的前序字段） */
export type DynamicLengthFrom =
  | 'len-prefix-value' // 本字段是 len-prefix 后的 body，长度 = len-prefix 解析值
  | 'tlv-value' // 本字段是 TLV value，长度 = 同 TLV 的 len 解析值
  | 'repeat-count' // 本字段是 repeat-block，长度 = count × blockSize

/** 字段文档项（扁平化字段表的一行） */
export interface FieldDoc {
  /** 字段全名（含点号路径，如 "参数区.T10.type"） */
  name: string
  /** 字段种类 */
  kind: FieldKind
  /** 偏移方式 */
  offsetMode: OffsetMode
  /** 静态偏移字节（offsetMode='static' 时有效；'dynamic' 时为初始猜测值） */
  offsetBytes: number
  /** 静态宽度字节（固定长度字段） */
  widthBytes: number
  /** 解析方式 */
  parse: 'hex' | 'uint' | 'text' | 'bits'
  /** parse='uint' 时的字节宽 */
  width?: number
  /** parse='uint' 时的字节序：'big' | 'little' */
  endian?: 'big' | 'little'
  /** parse='text' 时的编码 */
  encoding?: 'utf8' | 'gbk' | 'latin1'
  /** parse='bits' 时的位域子字段 */
  bitFields?: Array<{ name: string; bits: number }>
  /** 动态长度来源（actualLength 由前序字段决定时） */
  dynamicLengthFrom?: DynamicLengthFrom
  /** dynamicLengthFrom='repeat-count' 时的单块字节数 */
  blockSize?: number
  /** 前序依赖字段名列表（cursor 计算、长度驱动等） */
  dependsOn?: string[]
  /** 人类可读描述 */
  description: string
}

/** 示例帧（用于第二步验证） */
export interface ExampleFrame {
  /** 帧的 HEX 字符串（大写、无空格） */
  hex: string
  /** 每字段的期望解析值（字段名 → 值） */
  expected: Record<string, string | number | Record<string, number>>
}

/** 消息类型文档 */
export interface MessageDoc {
  /** 消息类型标识（如 'REQ', 'ACK'） */
  msgType: string
  /** 帧头 msgType 数值 */
  typeId: number
  /** 扁平化字段表（含帧头公共字段 magic/version/msgType/seq + body 各字段） */
  fields: FieldDoc[]
  /** 示例帧（可选，第二步验证用；DSL 不携带则留空） */
  exampleFrame?: ExampleFrame
}

/** 依赖关系图的一条边 */
export interface Dependency {
  /** 依赖字段名 */
  from: string
  /** 被依赖字段名 */
  to: string
  /** 依赖类型 */
  kind: 'length' | 'offset' | 'verify'
}

/** 完整协议文档 */
export interface ProtocolDoc {
  /** 协议名 */
  name: string
  /** 协议描述 */
  description: string
  /** 传输层（可选） */
  transport?: {
    mode: 'tcp-loopback' | 'tcp-client'
    host?: string
    port: number
  }
  /** 消息类型列表 */
  messages: MessageDoc[]
  /** 字段间依赖图 */
  dependencies: Dependency[]
}

/**
 * 把 FieldDoc 渲染成 Markdown 字段表的一行。
 * 用于第一步产出人类可读文档（也可作为 AI 提示词的一部分）。
 */
export function fieldDocToMarkdownRow(f: FieldDoc): string {
  const offset = f.offsetMode === 'dynamic' ? '动态' : `${f.offsetBytes}`
  const width = f.dynamicLengthFrom
    ? `动态(${f.dynamicLengthFrom})`
    : `${f.widthBytes}`
  const endian = f.endian ? ` ${f.endian}` : ''
  const deps = f.dependsOn && f.dependsOn.length > 0 ? ` ← ${f.dependsOn.join(',')}` : ''
  return `| ${f.name} | ${f.kind} | ${offset} | ${width}${endian} | ${f.parse} |${deps} |`
}

/** 把 MessageDoc 渲染成 Markdown 字段表。 */
export function messageDocToMarkdown(msg: MessageDoc): string {
  const header = `### 消息类型 ${msg.msgType} (typeId=${msg.typeId})\n`
  const tableHeader =
    '| 字段 | 种类 | 偏移(字节) | 宽度(字节) | 解析 | 依赖 |\n|---|---|---|---|---|---|\n'
  const rows = msg.fields.map(fieldDocToMarkdownRow).join('\n')
  const example = msg.exampleFrame
    ? `\n\n**示例帧**: \`${msg.exampleFrame.hex}\`\n\n**期望值**:\n${Object.entries(
        msg.exampleFrame.expected
      )
        .map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n')}`
    : ''
  return `${header}${tableHeader}${rows}${example}`
}

/** 把整个 ProtocolDoc 渲染成 Markdown。 */
export function protocolDocToMarkdown(doc: ProtocolDoc): string {
  const transport = doc.transport
    ? `## 传输层\n- 模式: ${doc.transport.mode}\n- 地址: ${doc.transport.host ?? '127.0.0.1'}:${doc.transport.port}\n\n`
    : ''
  const messages = doc.messages.map(messageDocToMarkdown).join('\n\n')
  const deps =
    doc.dependencies.length > 0
      ? `\n\n## 依赖关系\n${doc.dependencies
          .map((d) => `- ${d.from} → ${d.to} (${d.kind})`)
          .join('\n')}`
      : ''
  return `# ${doc.name}\n\n${doc.description}\n\n${transport}## 字段布局\n\n${messages}${deps}`
}

/** 简单工具：判断 ProtocolField 是否为动态长度结构 */
export function isDynamicField(field: ProtocolField): boolean {
  return (
    field.kind === 'tlv' ||
    field.kind === 'repeat-block' ||
    field.kind === 'optional' ||
    field.kind === 'length-prefix'
  )
}

/**
 * 计算字段的「静态」字节宽度（编译期可确定的部分）。
 *
 * 与 toGraph.ts fieldByteWidth 逻辑一致，独立为纯函数供 generateDoc / validateFrame 复用。
 *
 * 注意：对动态结构（tlv/repeat-block/optional/length-prefix），这里的返回值是
 * 「按 DSL 声明值的初始布局宽度」，实际运行时宽度可能不同（由解析出的 len/count 决定）。
 * 动态字段的 actualLength 由 splitFrame 运行时 cursor 推进计算。
 */
export function staticFieldByteWidth(field: ProtocolField): number {
  switch (field.kind) {
    case 'const': {
      if (field.mode === 'hex') return Math.max(1, Math.ceil(field.value.replace(/\s/g, '').length / 2))
      if (field.mode === 'decimal' || field.mode === 'binary') return field.width ?? 2
      return new TextEncoder().encode(field.value).length
    }
    case 'uint':
      return field.width
    case 'text':
      return new TextEncoder().encode(field.value).length
    case 'bitfield':
      return Math.ceil(field.fields.reduce((s, f) => s + f.bits, 0) / 8)
    case 'crc':
      return field.algorithm === 'CRC8' ? 1 : field.algorithm === 'CRC32' ? 4 : 2
    case 'length-prefix':
      return field.width === 'u16' ? 2 : 1
    case 'custom':
      return 16 // 默认 16 字节（AES block）；精确值需组件自知
    case 'tlv': {
      return field.entries.reduce((sum, entry) => {
        const valueBytes =
          entry.mode === 'text'
            ? new TextEncoder().encode(entry.value).length
            : Math.max(1, Math.ceil(entry.value.replace(/\s/g, '').length / 2))
        return sum + 2 + valueBytes
      }, 0)
    }
    case 'repeat-block': {
      const blockSize = field.blockFields.reduce((sum, f) => sum + staticFieldByteWidth(f), 0)
      return 1 + (field.count ?? 1) * blockSize
    }
    case 'optional':
      return staticFieldByteWidth(field.field)
    default:
      return 2
  }
}
