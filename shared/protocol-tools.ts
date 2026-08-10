/**
 * 协议拆包纯函数工具集。
 *
 * 设计目的：把 protocol-slice / protocol-parse-u / protocol-decode-text / protocol-crc
 * 等可视化节点的核心逻辑抽成可独立 import 的纯函数，供：
 *   1. 第二步「工具拆分验证」—— subagent 用这些函数对示例帧做真实拆分，断言每字段值正确。
 *   2. codegen —— 节点 emit 时引用同一套逻辑，保证「工具验证」与「生成代码运行时」一致。
 *   3. 单测 —— 不依赖 Electron runtime，Vitest 内可直接 import。
 *
 * 零 IO 依赖（无 fs/net/timer）。所有函数接收 hex 字符串 / 布局描述，返回值或错误。
 * 仅依赖 Node Buffer（latin1/utf8 转换）和可选的 iconv-lite（gbk，运行时 require）。
 *
 * 与 codec-provider.ts 的关系：codec-provider 的 textToHex/convertBase 等闭包函数
 * 逻辑与此处一致（搬移自同源），但 codec-provider 绑定 CapabilityProvider 运行时；
 * 本模块是可独立 import 的基座（shared/，renderer + main + test 均可引用）。二者保持行为一致。
 */

// iconv-lite 可选（仅 gbk 编码需要；缺失时 gbk 降级为 latin1）
let iconv: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  iconv = require('iconv-lite')
} catch {
  iconv = null
}

/**
 * 编码转换（与 electron/scriptSandbox convertEncoding 行为一致）。
 * - utf8 ↔ latin1/binary：Buffer 纯操作（字节袋语义）。
 * - gbk 等：iconv-lite（若可用）。
 */
export function convertEncoding(value: unknown, from = 'utf8', to = 'utf8'): string {
  const source = normalizeEncodingName(from)
  const target = normalizeEncodingName(to)
  const text = String(value ?? '')
  if (source === target) return text

  const unicode = decodeToUnicode(text, source)
  if (unicode == null) return text
  return encodeFromUnicode(unicode, target) ?? text
}

function normalizeEncodingName(encoding: string): string {
  const lowered = String(encoding || 'utf8').toLowerCase()
  if (lowered === 'binary') return 'latin1'
  return lowered
}

function isByteContainerEncoding(encoding: string): boolean {
  return encoding === 'latin1' || encoding === 'iso88591'
}

function decodeToUnicode(text: string, encoding: string): string | null {
  if (encoding === 'utf8') return text
  if (isByteContainerEncoding(encoding)) {
    return Buffer.from(text, 'binary').toString('utf8')
  }
  if (iconv && iconv.encodingExists(encoding)) {
    return iconv.decode(Buffer.from(text, 'binary'), encoding)
  }
  return null
}

function encodeFromUnicode(unicode: string, encoding: string): string | null {
  if (encoding === 'utf8') return unicode
  if (isByteContainerEncoding(encoding)) {
    return Buffer.from(unicode, 'utf8').toString('binary')
  }
  if (iconv && iconv.encodingExists(encoding)) {
    return iconv.encode(unicode, encoding).toString('binary')
  }
  return null
}

// ═══════════════════════════════════════════════════════════
// 基础编码工具（与 codec-provider 闭包实现一致，零行为差异）
// ═══════════════════════════════════════════════════════════

/** 字符串 → HEX（按 charCode 0-255 映射，中文等需先 convertEncoding 到字节袋）。 */
export function textToHex(s: unknown): string {
  const text = String(s ?? '')
  let hex = ''
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).padStart(2, '0')
  }
  return hex.toUpperCase()
}

/** HEX → 字符串（每两 hex 字符 → 一 charCode）。 */
export function hexToText(h: unknown): string {
  const cleanHex = String(h ?? '').replace(/\s/g, '')
  let text = ''
  for (let i = 0; i < cleanHex.length; i += 2) {
    text += String.fromCharCode(parseInt(cleanHex.slice(i, i + 2), 16))
  }
  return text
}

/**
 * 进制转换（与 codec-provider convertBase 一致）。
 * 支持中文进制名：二进制/八进制/十进制/十六进制。
 */
export function convertBase(value: unknown, from: string, to: string): string {
  const baseMap: Record<string, number> = { '二进制': 2, '八进制': 8, '十进制': 10, '十六进制': 16 }
  const fromBase = baseMap[from] || parseInt(from) || 10
  const toBase = baseMap[to] || parseInt(to) || 10

  let cleanValue = String(value ?? '').trim()
  if (fromBase === 16) cleanValue = cleanValue.replace(/^0x/i, '')
  if (fromBase === 2) cleanValue = cleanValue.replace(/^0b/i, '')

  const decimal = parseInt(cleanValue, fromBase)
  if (Number.isNaN(decimal)) return 'NaN'

  let result = decimal.toString(toBase)
  if (toBase === 16) result = result.toUpperCase()
  if (toBase === 2 && result.length < 8) result = result.padStart(8, '0')
  if (toBase === 16 && result.length < 2) result = result.padStart(2, '0')

  return result
}

// ═══════════════════════════════════════════════════════════
// HEX 归一化（与 codegen normalizeHexExpr 一致）
// ═══════════════════════════════════════════════════════════

/**
 * 把任意输入（latin1 字节串 / 文本 / 已是 hex）归一化成大写 HEX 字符串。
 *
 * - 若输入已是合法 hex（偶数长度、0-9a-f），直接 toUpperCase 返回。
 * - 否则按 textToHex 编码（适配 latin1 字节袋：每 char 一字节）。
 * - 输入是沙箱测试标记（'[测试'/'[超时'）时返回空串。
 *
 * 与 codegen protocol.ts normalizeHexExpr 行为一致。
 */
export function normalizeToHex(input: unknown): string {
  const s = String(input ?? '')
  if (s.indexOf('[测试') === 0 || s.indexOf('[超时') === 0) return ''
  const c = s.replace(/[\s,]/g, '')
  if (c.length > 0 && c.length % 2 === 0 && /^[0-9a-f]+$/i.test(c)) {
    return c.toUpperCase()
  }
  return textToHex(s).toUpperCase()
}

// ═══════════════════════════════════════════════════════════
// 拆包原子工具（对应可视化节点）
// ═══════════════════════════════════════════════════════════

/**
 * 按字节偏移/长度截取 HEX（对应 protocol-slice 节点）。
 * @param hex HEX 字符串（自动归一化）
 * @param startByte 起始字节偏移（0-based）
 * @param lengthBytes 截取字节数（0 表示取到末尾）
 */
export function sliceHex(hex: unknown, startByte: number, lengthBytes: number): string {
  const h = normalizeToHex(hex)
  const s = Math.max(0, Math.floor(startByte) || 0) * 2
  const l = Math.max(0, Math.floor(lengthBytes) || 0) * 2
  if (l === 0) return h.slice(s)
  return h.slice(s, s + l)
}

/**
 * HEX 无符号整数解析（对应 protocol-parse-u 节点）。
 * @param hex HEX 字符串（自动归一化，取前 width 字节）
 * @param width 字节宽（1/2/4）
 * @param endian 字节序：'big' | 'little' | '大端' | '小端'
 */
export function parseUint(hex: unknown, width: number, endian: string): number {
  const h = normalizeToHex(hex)
  const w = Math.max(1, Math.floor(width) || 2)
  let chunk = h.slice(0, w * 2)
  while (chunk.length < w * 2) chunk = '0' + chunk
  const isLittle = endian === 'little' || endian === '小端'
  if (isLittle) {
    chunk = (chunk.match(/.{2}/g) || []).reverse().join('')
  }
  return Number(convertBase(chunk, '十六进制', '十进制'))
}

/**
 * HEX → 文本（对应 protocol-decode-text 节点）。
 * @param hex HEX 字符串（自动归一化）
 * @param encoding 编码：'utf8' | 'gbk' | 'latin1'
 */
export function decodeText(hex: unknown, encoding: string): string {
  const h = normalizeToHex(hex)
  // hexToText 得到字节袋字符串（每 char 一字节），再按编码转 Unicode
  const byteBag = hexToText(h)
  const enc = encoding || 'utf8'
  if (enc === 'gbk') return convertEncoding(byteBag, 'gbk', 'utf8')
  if (enc === 'latin1' || enc === 'utf8') return convertEncoding(byteBag, 'latin1', 'utf8')
  return byteBag
}

// ═══════════════════════════════════════════════════════════
// 整帧拆解（第二步核心：验证协议布局）
// ═══════════════════════════════════════════════════════════

/** 字段布局项：描述帧中一个字段的位置与解析方式。 */
export interface FieldLayoutItem {
  /** 字段名（含点号路径，如 "参数区.T10"） */
  name: string
  /** 字段种类：const / uint / text / bitfield / len-prefix / crc / tlv-entry / repeat-block-item / optional-field */
  kind: string
  /** 起始字节偏移。对静态字段是固定数；对动态字段初始值会被解析结果覆盖。 */
  startByte: number
  /**
   * 字段字节长度。含义随 kind：
   * - 静态字段（const/uint/text/bitfield/crc）：固定数。
   * - len-prefix：长度字段自身的宽度（1 或 2），其 value 驱动后续 body 长度。
   * - tlv-entry：type(1)+len(1)+value，value 长度由解析出的 len 决定（此处 length 仅是初始猜测）。
   * - repeat-block：count(1) + count × blockSize，blockSize 固定。
   */
  lengthBytes: number
  /** 解析方式：'hex'（原样返回 hex）/ 'uint'（parseUint）/ 'text'（decodeText）/ 'bits'（位域展开） */
  parse: 'hex' | 'uint' | 'text' | 'bits'
  /** parse='uint' 时的字节宽 */
  width?: number
  /** parse='uint' 时的字节序 */
  endian?: string
  /** parse='text' 时的编码 */
  encoding?: string
  /** parse='bits' 时的位域子字段 [{name, bits}] */
  bitFields?: Array<{ name: string; bits: number }>
  /**
   * 动态长度来源：本字段的实际长度由前序某字段的解析值决定。
   * - 'len-prefix-value'：本字段是 len-prefix 后的 body，长度 = len-prefix 解析值。
   * - 'tlv-value'：本字段是 TLV value，长度 = 同 TLV 的 len 解析值。
   * - 'repeat-count'：本字段是 repeat-block，重复次数 = count 字段解析值，乘以 blockSize。
   * 用于 splitFrame 运行时 cursor 推进。
   */
  dynamicLengthFrom?: 'len-prefix-value' | 'tlv-value' | 'repeat-count'
  /** dynamicLengthFrom='repeat-count' 时的单块字节数 */
  blockSize?: number
}

/** 拆帧结果：每字段的实际值。 */
export interface ParsedField {
  /** 字段名（含路径） */
  name: string
  /** 字段种类 */
  kind: string
  /** 原始 HEX（截取到的字节） */
  hex: string
  /** 解析后的值（uint→number, text→string, bits→Record<子字段名,number>, hex→string） */
  value: number | string | Record<string, number>
  /** 实际占用的字节数（动态字段运行时确定） */
  actualLength: number
  /** 起始字节偏移（动态字段运行时确定） */
  actualStart: number
}

/** splitFrame 拆帧结果。 */
export interface SplitFrameResult {
  /** 是否成功（无越界、无格式错） */
  ok: boolean
  /** 拆出的字段（按布局顺序） */
  fields: ParsedField[]
  /** 错误信息（ok=false 时） */
  errors: string[]
}

/**
 * 按布局表拆整帧。
 *
 * 运行时 cursor 推进规则：
 * - 静态字段：cursor += lengthBytes。
 * - len-prefix：cursor += 自身宽度（1/2），但解析出的值会被记录，供后续 dynamicLengthFrom='len-prefix-value' 的字段用。
 * - dynamicLengthFrom='len-prefix-value'：长度 = 前序 len-prefix 解析值，cursor += 该值。
 * - dynamicLengthFrom='tlv-value'：长度 = 前序 len 解析值（同 TLV 的 len 字段），cursor += 该值。
 * - dynamicLengthFrom='repeat-count'：长度 = count 解析值 × blockSize，cursor += 该值。
 *
 * 这是 v3 编译期固定 offset 的运行时替代方案：cursor 在拆帧过程中动态推进。
 */
export function splitFrame(hex: unknown, layout: FieldLayoutItem[]): SplitFrameResult {
  const frameHex = normalizeToHex(hex)
  const frameBytes = frameHex.length / 2
  const fields: ParsedField[] = []
  const errors: string[] = []
  // 前序字段的解析值缓存（字段名 → 解析值），供 dynamicLengthFrom 查找
  const parsedValues = new Map<string, number | string | Record<string, number>>()
  // 前序 len-prefix / tlv-len 字段的「值字段名」映射（动态长度查找用）
  const lenValueOf = new Map<string, number>()

  for (const item of layout) {
    // 动态长度计算
    let actualLength = item.lengthBytes
    if (item.dynamicLengthFrom === 'len-prefix-value') {
      // 找前序最近一个 len-prefix 字段的解析值
      const lenKeys = Array.from(lenValueOf.keys())
      const lastLen = lenKeys.length > 0 ? lenValueOf.get(lenKeys[lenKeys.length - 1]) : undefined
      if (typeof lastLen === 'number') actualLength = lastLen
    } else if (item.dynamicLengthFrom === 'tlv-value') {
      const lenKeys = Array.from(lenValueOf.keys())
      const lastLen = lenKeys.length > 0 ? lenValueOf.get(lenKeys[lenKeys.length - 1]) : undefined
      if (typeof lastLen === 'number') actualLength = lastLen
    } else if (item.dynamicLengthFrom === 'repeat-count') {
      const lenKeys = Array.from(lenValueOf.keys())
      const lastCount = lenKeys.length > 0 ? lenValueOf.get(lenKeys[lenKeys.length - 1]) : undefined
      if (typeof lastCount === 'number' && item.blockSize) {
        actualLength = lastCount * item.blockSize
      }
    }

    const startByte = item.startByte
    // 越界检查
    if (startByte + actualLength > frameBytes) {
      errors.push(
        `字段 ${item.name} 越界：start=${startByte} length=${actualLength} 帧长=${frameBytes}`
      )
      continue
    }

    const fieldHex = sliceHex(frameHex, startByte, actualLength)
    let value: number | string | Record<string, number>
    if (item.parse === 'uint') {
      value = parseUint(fieldHex, item.width ?? 1, item.endian ?? 'big')
    } else if (item.parse === 'text') {
      value = decodeText(fieldHex, item.encoding ?? 'utf8')
    } else if (item.parse === 'bits' && item.bitFields) {
      value = parseBitfield(fieldHex, item.bitFields)
    } else {
      value = fieldHex
    }

    parsedValues.set(item.name, value)
    // len-prefix / tlv-len 字段：记录其解析值供后续动态长度字段查找
    if (item.kind === 'len-prefix' || item.kind === 'tlv-len') {
      if (typeof value === 'number') lenValueOf.set(item.name, value)
    }
    // repeat count 字段：记录解析值供 repeat-block 用
    if (item.kind === 'repeat-count') {
      if (typeof value === 'number') lenValueOf.set(item.name, value)
    }

    fields.push({
      name: item.name,
      kind: item.kind,
      hex: fieldHex,
      value,
      actualLength,
      actualStart: startByte
    })
  }

  return { ok: errors.length === 0, fields, errors }
}

/**
 * 位域解包：把 hex 按 bitFields 顺序展开成 {子字段名: 值}。
 * 总 bits = sum(bitFields.bits)。
 */
export function parseBitfield(
  hex: unknown,
  bitFields: Array<{ name: string; bits: number }>
): Record<string, number> {
  const totalBits = bitFields.reduce((s, f) => s + f.bits, 0)
  // hex → 二进制串，补齐到 totalBits
  let bin = convertBase(normalizeToHex(hex), '十六进制', '二进制')
  while (bin.length < totalBits) bin = '0' + bin
  bin = bin.slice(-totalBits)

  const result: Record<string, number> = {}
  let cursor = 0
  for (const f of bitFields) {
    const from = cursor
    const to = cursor + f.bits
    cursor = to
    result[f.name] = Number(convertBase(bin.slice(from, to), '二进制', '十进制'))
  }
  return result
}
