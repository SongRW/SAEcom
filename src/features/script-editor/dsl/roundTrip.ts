/**
 * 往返验证闭环：组包 vm 执行 → splitFrame 拆包 → 比对。
 *
 * 核心思想（解决静默失败）：
 * - 组包侧：执行 codegen 产出的代码（vm 沙箱），捕获 sendTCP 的帧 hex
 * - 拆包侧：用 splitFrame（纯函数）按布局拆这个 hex
 * - 比对：DSL 声明的字段值 vs 拆包解析出的值，逐字段比对
 *
 * 这是「精度提升」的关键闸门：组包和拆包不对称（offset 错位、len 不匹配、
 * CRC endian 错）时，往返验证的 mismatches 会精确暴露，而非等用户跑脚本看乱码。
 *
 * vm 沙箱执行仿 test/custom-components-sample.test.ts 的 runInSandbox：
 * 纯函数 API 从 protocol-tools + scriptSandbox import，副作用 API 用捕获 stub。
 */

import type { ProtocolDsl, ProtocolField } from '@shared/protocol-dsl'
import type { FieldLayoutItem, SplitFrameResult } from '@shared/protocol-tools'
import { splitFrame, convertBase, convertEncoding, textToHex, hexToText } from '@shared/protocol-tools'
import {
  bytesToNumber,
  checksum,
  chunkString,
  crc8,
  crc16,
  crc16ccitt,
  crc32,
  swapBytes
} from '../../../../electron/scriptSandbox'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import { generateProtocolDoc } from '@/features/script-editor/dsl/generateDoc'
import { staticFieldByteWidth } from '@shared/protocol-doc'
// 静态导入 buffer 包的 Buffer —— 渲染进程（ESM 构建）里 globalThis.Buffer 可能缺失
// （electron-vite externalizes Node 内置），而 protocol-tools/scriptSandbox 的纯函数
// （convertEncoding/textToHex 等）依赖 Buffer。静态导入保证 polyfill 可用。
import { Buffer as PolyfillBuffer } from 'buffer'

// 在执行组包沙箱前确保 globalThis.Buffer 可用：优先用已有全局，否则用 polyfill。
// 这是 roundTrip（渲染进程侧验证）的必要垫片，不影响主进程（主进程 Buffer 早已存在）。
if (typeof (globalThis as { Buffer?: unknown }).Buffer === 'undefined') {
  ;(globalThis as { Buffer: unknown }).Buffer = PolyfillBuffer
}

/** 往返验证结果。 */
export interface RoundTripResult {
  /** 是否通过（所有字段往返一致） */
  ok: boolean
  /** vm 执行捕获的发送帧（每条消息一帧） */
  sentFrames: string[]
  /** 拆包结果（messages[0] 的帧） */
  parsed: SplitFrameResult | null
  /** 字段比对结果 */
  fieldChecks: FieldCheck[]
  /** 错误（vm 执行失败、拆包失败等） */
  errors: string[]
}

/** 单字段往返比对。 */
export interface FieldCheck {
  /** 字段名 */
  field: string
  /** DSL 声明的期望值（hex 模式原样；uint 为数字；text 为字符串） */
  expected: string | number
  /** 拆包解析出的实际值 */
  actual: string | number
  /** 是否一致 */
  match: boolean
}

/**
 * 执行往返验证。
 *
 * @param dsl 协议 DSL（取 messages[0] 验证；多消息同构时验证第一条即可）
 * @returns 验证结果（ok=true 时可安全生成图；ok=false 时 fieldChecks/errors 含详情）
 */
export async function assemblyRoundTrip(dsl: ProtocolDsl): Promise<RoundTripResult> {
  const errors: string[] = []
  const sentFrames: string[] = []

  // 1. 生成 graph + code（只验证组包，用单次循环、单消息）
  const singleMsgDsl: ProtocolDsl = {
    ...dsl,
    messages: dsl.messages ? [dsl.messages[0]] : undefined,
    fields: dsl.fields,
    loop: { count: 1 },
    // 往返验证不需要 TCP 发送，用 console 模式避免 listener 干扰
    receiveLog: 'console',
    // 无 transport 时组包结果只进 output-log，不便捕获；强制 tcp-client 便于 sendTCP 捕获
    transport: dsl.transport ?? { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
  }

  let graph: ReturnType<typeof dslToGraph>
  let code: string
  try {
    graph = dslToGraph(singleMsgDsl)
    code = generateCodeFromRete(graph)
  } catch (e) {
    return {
      ok: false,
      sentFrames: [],
      parsed: null,
      fieldChecks: [],
      errors: [`graph/codegen 失败: ${(e as Error).message}`]
    }
  }

  // 2. vm 沙箱执行组包代码，捕获 sendTCP 帧
  try {
    const captured = await executeInSandbox(code)
    sentFrames.push(...captured.sentFrames)
    if (captured.sentFrames.length === 0) {
      // 把 sandbox 内的 console.log（codegen 的 try/catch 吞掉错误时打的）带出来，便于诊断
      const logHint = captured.logs.length > 0 ? `；sandbox 日志：${captured.logs.join(' | ').slice(0, 300)}` : ''
      errors.push(`vm 执行未捕获到发送帧（sendTCP 未被调用，组包链可能断裂）${logHint}`)
    }
  } catch (e) {
    return {
      ok: false,
      sentFrames,
      parsed: null,
      fieldChecks: [],
      errors: [`vm 执行失败: ${(e as Error).message}`]
    }
  }

  if (sentFrames.length === 0) {
    return { ok: false, sentFrames, parsed: null, fieldChecks: [], errors }
  }

  // 3. splitFrame 拆包（用 messages[0] 的帧）
  const frame = sentFrames[0]
  const doc = generateProtocolDoc(singleMsgDsl)
  const msgDoc = doc.messages[0]
  const layout = docToLayout(msgDoc.fields)
  const parsed = splitFrame(frame, layout)
  if (!parsed.ok) {
    errors.push(`拆包失败: ${parsed.errors.join('; ')}`)
  }

  // 4. 比对：DSL 声明值 vs 拆包解析值
  const fieldChecks = compareFields(singleMsgDsl, msgDoc.fields, parsed)

  const ok = errors.length === 0 && fieldChecks.every((c) => c.match)

  return { ok, sentFrames, parsed, fieldChecks, errors }
}

/**
 * vm 沙箱执行 codegen 产出的代码。
 * 仿 test/custom-components-sample.test.ts 的 runInSandbox，注入纯函数 + 副作用 stub。
 */
async function executeInSandbox(code: string): Promise<{ sentFrames: string[]; logs: string[] }> {
  const sentFrames: string[] = []
  const logs: string[] = []

  const sandbox: Record<string, unknown> = {
    // 纯函数 API（组包所需）
    convertBase,
    convertEncoding,
    textToHex,
    hexToText,
    bytesToNumber,
    checksum,
    chunkString,
    crc8,
    crc16,
    crc16ccitt,
    crc32,
    swapBytes,
    // 副作用 stub（捕获组包产出）
    console: { log: (...a: unknown[]) => logs.push(a.map(String).join(' ')) },
    checkStop: async () => false,
    sleep: async () => {},
    writeFile: async () => ({ ok: true }),
    sendTCP: async (_h: string, _p: number, data: string) => {
      sentFrames.push(String(data))
      return { ok: true }
    },
    sendToPanel: async (_id: string, data: string) => {
      sentFrames.push(String(data))
      return { ok: true }
    },
    sendToSerial: async (_port: string, data: string) => {
      sentFrames.push(String(data))
      return { ok: true }
    },
    send: async (data: string) => {
      sentFrames.push(String(data))
      return { ok: true }
    },
    broadcastTcpServer: async (_port: number, data: string) => {
      sentFrames.push(String(data))
      return { ok: true }
    },
    // listener stub：立即 resolve（组包在 listener 外时不触发；在内时也不会 hang）
    listenTcpPackets: () => () => Promise.resolve(),
    listenTcpServerPackets: () => () => Promise.resolve(),
    listenSerialPackets: () => () => Promise.resolve(),
    listenPanelPackets: () => () => Promise.resolve(),
    listenCurrentPackets: () => () => Promise.resolve(),
    waitOnePacket: async () => '',
    waitPanelPacket: async () => '',
    globalVars: {},
    _last_recv: ''
  }

  // 用 new Function 替代 node:vm —— 渲染进程无 node:vm（externalized for browser）。
  // 沙箱通过「形参注入 API + 闭包捕获组包数据」实现：API 全部从形参取（无 global 访问），
  // sentFrames/logs 在闭包里就地捕获。与 vm.createContext 语义等价（API 注入 + 副作用 stub），
  // 但能在渲染进程跑（不再 externalized）。
  // 包 (async()=>{...})() 支持 await（与 ScriptService.run 一致）。
  // 注意：不加 "use strict" —— codegen 产出的代码按非严格模式设计（与 ScriptService 的
  // vm.createContext 行为对齐），加 strict 会导致部分 var 重复声明等模式报错。
  const sandboxKeys = Object.keys(sandbox)
  const sandboxValues = Object.values(sandbox)
  const runner = new Function(...sandboxKeys, `return (async()=>{${code}})()`)
  await runner(...sandboxValues)

  return { sentFrames, logs }
}

/**
 * 把 FieldDoc[] 转成 splitFrame 用的 FieldLayoutItem[]。
 * 去掉帧头的 len-prefix/magic/version/msgType/seq（这些是自动加的，组包侧也自动产），
 * 只比对 DSL 声明的业务字段。
 */
function docToLayout(fields: import('@shared/protocol-doc').FieldDoc[]): FieldLayoutItem[] {
  return fields.map((f) => ({
    name: f.name,
    kind: f.kind,
    startByte: f.offsetBytes,
    lengthBytes: f.widthBytes,
    parse: f.parse,
    width: f.width,
    endian: f.endian,
    encoding: f.encoding,
    bitFields: f.bitFields,
    dynamicLengthFrom: f.dynamicLengthFrom,
    blockSize: f.blockSize
  }))
}

/**
 * 比对 DSL 声明值 vs 拆包解析值。
 * 只比对 DSL 里显式声明了 value 的字段（const/uint/text 的 value）。
 */
function compareFields(
  dsl: ProtocolDsl,
  docFields: import('@shared/protocol-doc').FieldDoc[],
  parsed: SplitFrameResult
): FieldCheck[] {
  const checks: FieldCheck[] = []
  const parsedMap = new Map(parsed.fields.map((f) => [f.name, f]))

  // 收集 DSL 声明的字段（含自动帧头）
  const multiMessage = Boolean(dsl.messages && dsl.messages.length > 0)
  const messages = multiMessage
    ? dsl.messages!
    : [{ msgType: 'FRAME', typeId: 1, fields: dsl.fields ?? [] }]
  const msg = messages[0]

  // 自动帧头字段（多消息时）的期望值
  if (multiMessage) {
    checks.push(...checkHeaderField('magic', 'AA55', parsedMap))
    checks.push(...checkHeaderField('version', '03', parsedMap))
    checks.push(...checkHeaderField('msgType', msg.typeId ?? 1, parsedMap, true))
  }

  // DSL 业务字段
  for (const field of msg.fields) {
    checks.push(...checkBusinessField(field, parsedMap))
  }

  return checks
}

/** 比对帧头字段（magic/version/msgType/seq）。 */
function checkHeaderField(
  name: string,
  expected: string | number,
  parsedMap: Map<string, { value: string | number | Record<string, number>; hex: string }>,
  isUint = false
): FieldCheck[] {
  const parsed = parsedMap.get(name)
  if (!parsed) return [] // 字段不在拆包结果里（可能被 offset 跳过）
  const actual = isUint ? parsed.value : parsed.hex
  return [{
    field: name,
    expected,
    actual: actual as string | number,
    match: String(expected).toUpperCase() === String(actual).toUpperCase()
  }]
}

/** 比对 DSL 业务字段。 */
function checkBusinessField(
  field: ProtocolField,
  parsedMap: Map<string, { value: string | number | Record<string, number>; hex: string }>
): FieldCheck[] {
  const checks: FieldCheck[] = []
  switch (field.kind) {
    case 'const': {
      const parsed = parsedMap.get(field.name)
      if (!parsed) break
      // const hex 模式期望 = field.value 大写；decimal 模式期望 = 转 hex 后的值
      let expected: string
      if (field.mode === 'hex') {
        expected = field.value.replace(/\s/g, '').toUpperCase()
      } else if (field.mode === 'decimal') {
        const n = Number(field.value)
        const w = field.width ?? 2
        expected = convertBase(String(n), '十进制', '十六进制').padStart(w * 2, '0').toUpperCase()
      } else {
        expected = field.value
      }
      checks.push({
        field: field.name,
        expected,
        actual: parsed.hex,
        match: parsed.hex === expected
      })
      break
    }
    case 'uint': {
      const parsed = parsedMap.get(field.name)
      if (!parsed) break
      checks.push({
        field: field.name,
        expected: field.value ?? 0,
        actual: parsed.value as number,
        match: Number(field.value ?? 0) === parsed.value
      })
      break
    }
    case 'text': {
      const parsed = parsedMap.get(field.name)
      if (!parsed) break
      checks.push({
        field: field.name,
        expected: field.value,
        actual: parsed.value as string,
        match: field.value === parsed.value
      })
      break
    }
    case 'tlv': {
      // TLV 逐条目比对 type/len/value
      for (const entry of field.entries) {
        const typeHex = entry.type.toString(16).toUpperCase().padStart(2, '0')
        // value 的拆包结果在 `${name}.T${typeHex}.value`
        const valueParsed = parsedMap.get(`${field.name}.T${typeHex}.value`)
        if (!valueParsed) continue
        if (entry.mode === 'text') {
          // text 模式：拆包返回 hex（splitFrame 的 tlv-value parse=hex），需 decode 后比对
          // decode：hex → latin1 字节袋 → utf8 文本
          const byteBag = hexToText(valueParsed.hex)
          const decoded = convertEncoding(byteBag, 'latin1', 'utf8')
          checks.push({
            field: `${field.name}.T${typeHex}.value`,
            expected: entry.value,
            actual: decoded,
            match: entry.value === decoded
          })
        } else {
          // hex 模式：直接比对 hex 字符串
          const expected = entry.value.replace(/\s/g, '').toUpperCase()
          checks.push({
            field: `${field.name}.T${typeHex}.value`,
            expected,
            actual: valueParsed.hex,
            match: valueParsed.hex === expected
          })
        }
      }
      break
    }
    // bitfield/crc/length-prefix/repeat-block/optional：结构性字段，v1 不强比对值
    // （CRC 会自动 append，len 会自动算；只验证它们存在且拆包没报错）
    default: {
      const parsed = parsedMap.get(field.name)
      if (parsed) {
        checks.push({
          field: field.name,
          expected: '(结构字段)',
          actual: parsed.hex || '(已解析)',
          match: true
        })
      }
    }
  }
  return checks
}
