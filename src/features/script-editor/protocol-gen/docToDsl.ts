/**
 * docToDsl —— 启发式协议文档 → DSL agent（pi agent 式可观测 + llmCall seam）。
 *
 * 设计：
 * - AsyncGenerator<DocToDslEvent> 流式 yield 事件（对齐 pi agent 工具全可观测），
 *   编排层（useProtocolGenSession）消费并转成 ProtocolGenEvent 写入 transcript。
 * - 启发式规则解析（无真模型）：识别 magic / width / endian / CRC / TLV / 字段表。
 * - 歧义检测：字段同时匹配多种解读时 yield branch_decision_needed，
 *   编排层调 forkBranches + 往返裁决。
 * - llmCall? 注入点（与 dsl/pipeline.ts:31-39 同形）：留接口不接线，
 *   二期接 agent:chat IPC 后注入即可，本文件不改。
 *
 * 三条最稳路径（覆盖一期）：
 * - A：Markdown/纯文本字段表（「字段/长度/类型」列）→ 直接映射 ProtocolField[]
 * - B：自然语言描述（含 hex/字节序关键词）→ 启发式拼装
 * - C：选模板 → 填充微调
 */
import type { ProtocolDsl, ProtocolField } from '@shared/protocol-dsl'
import { SIMPLE_PROTOCOL_DSL, TLV_PROTOCOL_DSL, MULTI_MESSAGE_DSL } from '@/features/script-editor/dsl/sampleDsl'

/** docToDsl 流式事件（编排层转成 ProtocolGenEvent）。 */
export type DocToDslEvent =
  | { type: 'narrative'; text: string }
  | { type: 'tool_call'; tool: string; args: unknown }
  | { type: 'tool_result'; tool: string; result: unknown }
  | { type: 'field_detected'; field: ProtocolField }
  | { type: 'branch_decision_needed'; reason: string; interpretations: Array<{ label: string; dsl: ProtocolDsl }> }
  | { type: 'artifact_ready'; dsl: ProtocolDsl }
  | { type: 'aborted' }

/** docToDsl 选项。llmCall 是预留 seam（二期接真模型时注入）。 */
export interface DocToDslOptions {
  signal?: AbortSignal
  llmCall?: (prompt: string) => Promise<string>
}

/** 模板选择关键词 → 模板 DSL。关键词要求明确，避免与歧义检测冲突。 */
const TEMPLATE_KEYWORDS: Array<{ keywords: string[]; dsl: ProtocolDsl; label: string }> = [
  { keywords: ['多消息', 'REQ', 'ACK', '交互'], dsl: MULTI_MESSAGE_DSL, label: '多消息协议' },
  { keywords: ['tlv', 'TLV', 'type-length-value'], dsl: TLV_PROTOCOL_DSL, label: 'TLV 协议' },
  { keywords: ['简单', '定长', 'magic'], dsl: SIMPLE_PROTOCOL_DSL, label: '简单协议' }
]

/** hex 识别：AA55 / 0xAA55 / A5（偶数长度 hex 字符）。 */
const HEX_RE = /\b0x([0-9a-fA-F]+)\b|\b([0-9a-fA-F]{2,})\b/g

/** 字段表行识别：`字段名 | 长度 | 类型` 或 markdown 表格行。 */
const TABLE_ROW_RE = /\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*(?:\||$)/g

/**
 * 从文本提取协议名/标题（「协议名：xxx」「协议名称：xxx」「名称：xxx」行）。
 * 中文标题允许提取（作为 dsl.title 展示），ASCII 名才可用于 dsl.name。
 */
export function extractProtocolTitle(text: string): string | null {
  const m = /^(?:协议名称|协议名|名称|协议)\s*[:：]\s*(.+)$/m.exec(text)
  if (m) return m[1].trim()
  return null
}

/** 名称是否可直接用作 ASCII 标识（脚本名/节点前缀）；含中文/符号则只能作 title。 */
export function isAsciiProtocolName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(name)
}

/**
 * 按结构建议 ASCII 协议名（向导「中文名纠正」用）。
 * 依据字段结构给稳定前缀：TLV → TLV-PROTOCOL；多消息 → MULTI-MESSAGE-PROTOCOL；
 * 其余 → SIMPLE-PROTOCOL。无中文名时返回 null（不需要纠正）。
 */
export function suggestAsciiProtocolName(dsl: ProtocolDsl): string | null {
  if (isAsciiProtocolName(dsl.name)) return null
  const hasTlv = (dsl.fields ?? []).some((f) => f.kind === 'tlv')
  const hasMulti = (dsl.messages ?? []).length > 1
  if (hasTlv) return 'TLV-PROTOCOL'
  if (hasMulti) return 'MULTI-MESSAGE-PROTOCOL'
  return 'SIMPLE-PROTOCOL'
}

/**
 * 把提取的协议名/标题应用到 DSL：
 * - ASCII 名（如「名称：SimpleProto」）→ 覆盖 dsl.name
 * - 中文标题 → 仅写入 dsl.title（name 保持内置/模板名，脚本与节点前缀不受中文影响）
 */
function withProtocolIdentity(dsl: ProtocolDsl, text: string): ProtocolDsl {
  const title = extractProtocolTitle(text)
  if (!title) return dsl
  if (isAsciiProtocolName(title)) return { ...dsl, name: title }
  return { ...dsl, title }
}

const LLM_SYSTEM_PROMPT = `你是串口协议解析助手。把用户提供的协议描述转成 ProtocolDsl JSON（仅输出 JSON，不要解释、不要 markdown 围栏）。

字段 kind 取值：const（固定字节，value 为 hex 如 "AA55"）、uint（整数，width 1|2|4，endian big|little，value 可选）、text（value 字符串，encoding utf8|gbk）、bitfield（fields: [{name,bits}]）、length-prefix（width u8|u16）、crc（algorithm CRC8|CRC16|CRC32|校验和，endian，append）、tlv（entries: [{type: 0x10, value: "01", mode: hex|text}]）、repeat-block（blockFields + count）、optional（flagBit + field）、custom（componentKey）。

顶层字段：name（协议名，用 ASCII，如 TLV-DEVICE-INFO；中文名放 title）、fields（单消息字段数组，按帧序）、messages（多消息时替代 fields：[{msgType:"REQ", typeId:1, fields:[...]}]）、transport（可选：{mode:"tcp-loopback", port:9100}）、loop（可选：{count:1}）、receiveLog（"console"）、verifyOnRecv（true）。

输出示例：
{"name":"SimpleProtocol","fields":[{"kind":"const","name":"magic","value":"AA55","mode":"hex"},{"kind":"uint","name":"deviceId","width":1},{"kind":"text","name":"payload","value":"hello"},{"kind":"crc","name":"crc","algorithm":"CRC16","append":true}],"transport":{"mode":"tcp-loopback","port":9100},"loop":{"count":1},"receiveLog":"console","verifyOnRecv":true}`

/** 构造 LLM 解析的对话消息（系统提示 + 用户协议描述）。 */
export function buildLlmParseMessages(text: string): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: LLM_SYSTEM_PROMPT },
    { role: 'user', content: text.slice(0, 6000) }
  ]
}

/**
 * 从模型输出解析 ProtocolDsl（宽容解析）：
 * 剥 ```json 围栏 → 取第一个 {...} 平衡块 → JSON.parse → 最小结构校验。
 * 校验失败返回 null（调用方降级启发式）。
 */
export function parseLlmDslOutput(raw: string): ProtocolDsl | null {
  if (!raw) return null
  let text = raw.trim()
  // 去 ```json ... ``` 围栏
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence) text = fence[1].trim()
  // 取第一个平衡的 {...} 块（容忍模型前后废话）
  const start = text.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let end = -1
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') { i++; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  if (end < 0) return null
  let parsed: unknown
  try { parsed = JSON.parse(text.slice(start, end)) } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.name !== 'string' || !obj.name.trim()) return null
  const dsl = obj as unknown as ProtocolDsl
  const fields = dsl.fields ?? []
  const messages = dsl.messages ?? []
  // 最小结构校验：字段必须含 kind+name；多消息必须含 msgType+fields
  const fieldsOk = fields.every((f) => f && typeof f === 'object' && typeof (f as ProtocolField).kind === 'string' && typeof (f as ProtocolField).name === 'string')
  const messagesOk = messages.every((m) => typeof m.msgType === 'string' && Array.isArray(m.fields))
  if (fields.length === 0 && messages.length === 0) return null
  if (!fieldsOk || !messagesOk) return null
  return dsl
}

/**
 * 从文本提取 hex 常量候选（magic / version 等）。
 * 返回去重后的 hex 字符串列表。
 */
export function extractHexConstants(text: string): string[] {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  HEX_RE.lastIndex = 0
  while ((m = HEX_RE.exec(text)) !== null) {
    const hex = (m[1] || m[2] || '').toUpperCase()
    // 过滤过短（单字符可能是变量名）和过长（可能是 hash）
    if (hex.length >= 2 && hex.length <= 8 && /^[0-9A-F]+$/.test(hex)) {
      found.add(hex)
    }
  }
  return [...found]
}

/** 从文本识别字节宽度关键词。 */
export function detectWidth(text: string, fieldName: string): 1 | 2 | 4 | undefined {
  const lower = (text + ' ' + fieldName).toLowerCase()
  if (/u8|uint8|1\s*字节|1\s*byte/.test(lower)) return 1
  if (/u16|uint16|2\s*字节|2\s*byte|short/.test(lower)) return 2
  if (/u32|uint32|4\s*字节|4\s*byte|int|long/.test(lower)) return 4
  return undefined
}

/** 从文本识别字节序。 */
export function detectEndian(text: string): 'big' | 'little' | undefined {
  const lower = text.toLowerCase()
  if (/小端|little[\s-]?endian|le\b/.test(lower)) return 'little'
  if (/大端|big[\s-]?endian|be\b/.test(lower)) return 'big'
  return undefined
}

/** 从文本识别 CRC 算法。 */
export function detectCrc(text: string): { algorithm: 'CRC8' | 'CRC16' | 'CRC32' | '校验和'; endian: 'big' | 'little' } | undefined {
  const lower = text.toLowerCase()
  if (/crc8/.test(lower)) return { algorithm: 'CRC8', endian: 'big' }
  if (/crc32/.test(lower)) return { algorithm: 'CRC32', endian: 'big' }
  if (/crc16|crc/.test(lower)) {
    const endian = detectEndian(text) || 'big'
    return { algorithm: 'CRC16', endian }
  }
  if (/校验和|checksum|sum/.test(lower)) return { algorithm: '校验和', endian: 'big' }
  return undefined
}

/** 识别文本里是否有 TLV 结构描述。 */
export function hasTlvDescription(text: string): boolean {
  return /tlv|TLV|type[\s-]?length[\s-]?value|类型[\s-]?长度[\s-]?值/i.test(text)
}

/**
 * 解析 Markdown/纯文本字段表为 ProtocolField[]。
 * 支持 `| 字段 | 长度 | 类型 |` 三列表格。
 */
export function parseFieldTable(text: string): ProtocolField[] | null {
  const rows: Array<[string, string, string]> = []
  let m: RegExpExecArray | null
  TABLE_ROW_RE.lastIndex = 0
  while ((m = TABLE_ROW_RE.exec(text)) !== null) {
    const name = m[1].trim()
    const len = m[2].trim()
    const type = m[3].trim()
    // 跳过表头分隔行（---）和空名
    if (!name || /^[-:]+$/.test(name) || /^字段名?$/i.test(name) || name === 'field') continue
    rows.push([name, len, type])
  }
  if (rows.length === 0) return null
  const fields: ProtocolField[] = []
  for (const [name, len, type] of rows) {
    const lower = (type + ' ' + len).toLowerCase()
    if (/const|常量|magic|帧头|hex/.test(lower)) {
      const hexMatch = extractHexConstants(type)
      fields.push({ kind: 'const', name, value: hexMatch[0] || '00', mode: 'hex' })
    } else if (/crc|校验/.test(lower)) {
      const crc = detectCrc(type) || { algorithm: 'CRC16' as const, endian: 'big' as const }
      fields.push({ kind: 'crc', name, algorithm: crc.algorithm, endian: crc.endian, append: true })
    } else if (/text|文本|string|str|gbk|utf/.test(lower)) {
      fields.push({ kind: 'text', name, value: '', encoding: /gbk/.test(lower) ? 'gbk' : 'utf8' })
    } else {
      const width = detectWidth(len + ' ' + type, name) || 1
      fields.push({ kind: 'uint', name, width, endian: detectEndian(type) || 'big' })
    }
  }
  return fields
}

/**
 * 启发式 agent 主入口：文本 → DSL，流式 yield 事件。
 *
 * 流程：
 * 1. yield narrative（开始解析）
 * 2. 若识别到字段表 → parseFieldTable 路径
 * 3. 否则若匹配模板关键词 → 模板路径
 * 4. 否则启发式拼装（hex 常量 + CRC + 残留 uint）
 * 5. 歧义检测（TLV 描述但字段表里又是 uint）→ yield branch_decision_needed
 * 6. yield artifact_ready
 *
 * 任一步检查 signal.aborted → yield aborted 并 return。
 */
export async function* docToDsl(
  text: string,
  opts: DocToDslOptions = {}
): AsyncGenerator<DocToDslEvent> {
  const { signal } = opts

  yield { type: 'narrative', text: '开始解析协议描述…' }
  if (signal?.aborted) { yield { type: 'aborted' }; return }

  // 路径 LLM（二期：真模型）。llmCall 注入时优先走模型解析（深度模式）：
  // 输出经 parseLlmDslOutput 校验，失败降级启发式，不阻断流程。
  if (opts.llmCall) {
    yield { type: 'tool_call', tool: 'llmParse', args: { chars: text.length } }
    try {
      const raw = await opts.llmCall(JSON.stringify(buildLlmParseMessages(text)))
      if (signal?.aborted) { yield { type: 'aborted' }; return }
      const dsl = parseLlmDslOutput(raw)
      if (dsl) {
        yield { type: 'tool_result', tool: 'llmParse', result: { ok: true, name: dsl.name, fields: (dsl.fields ?? []).length } }
        yield { type: 'narrative', text: `模型解析出协议「${dsl.name}」（${(dsl.fields ?? []).length} 个字段）。` }
        yield { type: 'artifact_ready', dsl }
        return
      }
      yield { type: 'tool_result', tool: 'llmParse', result: { ok: false, error: '输出不是合法 DSL JSON' } }
      yield { type: 'narrative', text: '模型输出未通过 DSL 校验，降级走启发式解析。' }
    } catch (e) {
      yield { type: 'tool_result', tool: 'llmParse', result: { ok: false, error: String(e).slice(0, 120) } }
      yield { type: 'narrative', text: '模型调用失败，降级走启发式解析。' }
    }
  }

  // 路径 A：字段表
  const tableFields = parseFieldTable(text)
  if (tableFields && tableFields.length > 0) {
    yield { type: 'tool_call', tool: 'parseFieldTable', args: { rowCount: tableFields.length } }
    yield { type: 'tool_result', tool: 'parseFieldTable', result: { fields: tableFields.length } }
    for (const field of tableFields) {
      if (signal?.aborted) { yield { type: 'aborted' }; return }
      yield { type: 'field_detected', field }
    }
    yield { type: 'narrative', text: `从字段表解析到 ${tableFields.length} 个字段。` }
    const dsl: ProtocolDsl = withProtocolIdentity({
      name: 'ParsedProtocol',
      fields: tableFields,
      transport: { mode: 'tcp-loopback', port: 9100 },
      loop: { count: 1 },
      receiveLog: 'console',
      verifyOnRecv: true
    }, text)
    yield { type: 'artifact_ready', dsl }
    return
  }

  if (signal?.aborted) { yield { type: 'aborted' }; return }

  // 路径 B：模板关键词
  for (const tmpl of TEMPLATE_KEYWORDS) {
    if (tmpl.keywords.some((k) => text.includes(k))) {
      yield { type: 'narrative', text: `识别到「${tmpl.label}」特征，套用模板。` }
      yield { type: 'tool_call', tool: 'matchTemplate', args: { template: tmpl.label } }
      yield { type: 'tool_result', tool: 'matchTemplate', result: { matched: tmpl.label } }
      yield { type: 'artifact_ready', dsl: withProtocolIdentity({ ...tmpl.dsl }, text) }
      return
    }
  }

  if (signal?.aborted) { yield { type: 'aborted' }; return }

  // 路径 C：启发式拼装
  yield { type: 'narrative', text: '未识别字段表或模板，走启发式拼装。' }
  const hexConstants = extractHexConstants(text)
  yield { type: 'tool_call', tool: 'extractHexConstants', args: { text: text.slice(0, 60) } }
  yield { type: 'tool_result', tool: 'extractHexConstants', result: { count: hexConstants.length, samples: hexConstants.slice(0, 3) } }

  const fields: ProtocolField[] = []
  // magic：取第一个 hex 常量
  if (hexConstants.length > 0) {
    const magicField: ProtocolField = { kind: 'const', name: 'magic', value: hexConstants[0], mode: 'hex' }
    fields.push(magicField)
    yield { type: 'field_detected', field: magicField }
  }

  // CRC
  const crc = detectCrc(text)
  if (crc) {
    yield { type: 'tool_call', tool: 'detectCrc', args: {} }
    yield { type: 'tool_result', tool: 'detectCrc', result: crc }
  }

  // 歧义检测：同时有 TLV 描述和数值字段 → 分叉
  const tlvDescribed = hasTlvDescription(text)
  if (tlvDescribed && hexConstants.length > 0) {
    yield {
      type: 'branch_decision_needed',
      reason: '描述中同时出现 TLV 结构和固定数值字段，无法确定 T-data 字段是 uint 还是 tlv。',
      interpretations: [
        {
          label: 'uint 解读',
          dsl: withProtocolIdentity({
            name: 'HeuristicUintProtocol',
            fields: [
              ...(hexConstants.length > 0 ? [{ kind: 'const' as const, name: 'magic', value: hexConstants[0], mode: 'hex' as const }] : []),
              { kind: 'uint' as const, name: 'seq', width: 1 as 1, value: 1 },
              ...(crc ? [{ kind: 'crc' as const, name: 'crc', algorithm: crc.algorithm, endian: crc.endian, append: true }] : [])
            ],
            transport: { mode: 'tcp-loopback' as const, port: 9101 },
            loop: { count: 1 },
            receiveLog: 'console' as const,
            verifyOnRecv: true
          }, text)
        },
        {
          label: 'tlv 解读',
          dsl: withProtocolIdentity({
            name: 'HeuristicTlvProtocol',
            fields: [
              ...(hexConstants.length > 0 ? [{ kind: 'const' as const, name: 'magic', value: hexConstants[0], mode: 'hex' as const }] : []),
              { kind: 'tlv' as const, name: 'data', entries: [{ type: 0x10, value: '01', mode: 'hex' as const }] },
              ...(crc ? [{ kind: 'crc' as const, name: 'crc', algorithm: crc.algorithm, endian: crc.endian, append: true }] : [])
            ],
            transport: { mode: 'tcp-loopback' as const, port: 9102 },
            loop: { count: 1 },
            receiveLog: 'console' as const,
            verifyOnRecv: true
          }, text)
        }
      ]
    }
    // 分叉后由编排层往返裁决，这里结束
    yield { type: 'narrative', text: '已生成两种解读分支，等待往返验证裁决。' }
    return
  }

  // 无歧义：直接拼装
  fields.push({ kind: 'uint', name: 'seq', width: 1, value: 1 })
  yield { type: 'field_detected', field: { kind: 'uint', name: 'seq', width: 1, value: 1 } }
  if (crc) {
    const crcField: ProtocolField = { kind: 'crc', name: 'crc', algorithm: crc.algorithm, endian: crc.endian, append: true }
    fields.push(crcField)
    yield { type: 'field_detected', field: crcField }
  }

  yield { type: 'narrative', text: `启发式拼装出 ${fields.length} 个字段。` }
  const dsl: ProtocolDsl = withProtocolIdentity({
    name: 'HeuristicProtocol',
    fields,
    transport: { mode: 'tcp-loopback', port: 9103 },
    loop: { count: 1 },
    receiveLog: 'console',
    verifyOnRecv: true
  }, text)
  yield { type: 'artifact_ready', dsl }
}
