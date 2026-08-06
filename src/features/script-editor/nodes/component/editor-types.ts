/**
 * Monaco 编辑器注入的类型存根（addExtraLib）。
 *
 * 用户在编辑器写 emit 函数体时，获得：
 * - EmitHelpers 包的精确签名（getInputVar/jsString/outVar/...）+ 悬停文档
 * - sandbox API 全量签名（send/waitOnePacket/listenSerialPackets/...）—— 与 sandboxCatalog.ts 白名单一致
 *
 * 单一来源：签名必须与实际运行时（capabilities providers + codegen/emit/shared）保持一致。
 * 运行时白名单（SANDBOX_API_CATALOG）是最终防线；此处仅提供编辑期 IntelliSense。
 */

/** emit helpers 类型存根（emit 函数体的 helpers 参数 + ctx/node 参数）。 */
export function buildEmitHelpersExtraLib(): string {
  return `
declare interface EmitContext {
  graph: unknown
  registry: unknown
  varMap: Map<string, string>
  processedNodes: Set<string>
  blockedNodes: Set<string>
  inListenerClosure: boolean
  emitNode: (node: any, indent?: string) => string
}

declare interface EmitHelpers {
  /** 解析上游输出变量名（单输入默认 'in'，fallback '_last_recv'）。 */
  getInputVar(ctx: EmitContext, node: any, inputKey?: string, fallback?: string): string
  /** 解析所有上游输出变量名（多输入）。 */
  getInputVars(ctx: EmitContext, node: any): string[]
  /** JSON.stringify 一个字符串（含引号）。 */
  jsString(value: unknown): string
  /** JS 字面量（数字/布尔直出，否则 jsString）。 */
  jsLiteral(value: unknown): string
  /** 对象字面量（JSON.stringify，非对象返回 '{}'）。 */
  jsObjectLiteral(value: unknown): string
  /** 值转字符串，空值用 fallback。 */
  valueAsString(value: unknown, fallback?: string): string
  /** 值转数字，NaN 用 fallback。 */
  valueAsNumber(value: unknown, fallback: number): number
  /** 节点输出变量名（_out_<id>）。 */
  outVar(node: any): string
  /** 取节点 data（控件配置）。 */
  data(node: any): Record<string, unknown>
  /** 取节点的 configRef（panel/serial-port/tcp-endpoint 等来源引用）。 */
  configRef(config: Record<string, unknown>): { kind: string; [k: string]: unknown }
  /** 生成 N 层缩进字符串。 */
  indent(level: number): string
}

/**
 * emit 函数体约定：
 * - 参数顺序固定：(ctx, node, indent, helpers)
 * - 必须返回 string（生成的 JS 代码片段，含换行）
 * - 用 helpers.* 读取配置/输入变量；产出的代码只能调用 sandbox 白名单 API
 */
`
}

/** sandbox API 全量签名存根（与 SANDBOX_API_CATALOG + capabilities providers 对齐）。 */
export function sandboxApiExtraLib(): string {
  return `
// ===== 脚本沙箱 API（emit 产出的代码可调用；与白名单 SANDBOX_API_CATALOG 一致）=====
// 文档单一来源：SANDBOX_API_DOCS（sandboxApiDocs.ts）——悬停/补全说明与此一致。
declare const console: { log(...args: unknown[]): void }
declare const globalVars: Record<string, unknown>
declare let _last_recv: string

declare function checkStop(): Promise<boolean>
/** 延时等待（毫秒）。例：await sleep(1000)。 */
declare function sleep(ms: number): Promise<void>

/** 等待下一个数据包（可设超时），返回文本。例：const reply = await waitOnePacket(2000)。 */
declare function waitOnePacket(timeout?: number): Promise<string>
/** 等待指定面板的下一个数据包。 */
declare function waitPanelPacket(panelId: string, timeout?: number): Promise<string>
/** 等待 TCP 服务器端口收到数据。 */
declare function waitTcpServer(port: number, timeout?: number): Promise<string>

declare function listenCurrentPackets(): (handler: (pkt: { bytes: Uint8Array; text: string; hex: string }) => Promise<void> | void) => Promise<void>
declare function listenPanelPackets(panelId: string): (handler: (pkt: { bytes: Uint8Array; text: string; hex: string }) => Promise<void> | void) => Promise<void>
declare function listenSerialPackets(portPath: string, options?: { baudRate?: number; dataBits?: number; stopBits?: number; parity?: string }, listenOptions?: { bufferMs?: number; append?: string }): (handler: (pkt: { bytes: Uint8Array; text: string; hex: string }) => Promise<void> | void) => Promise<void>
declare function listenTcpPackets(host: string, port: number): (handler: (pkt: { bytes: Uint8Array; text: string; hex: string }) => Promise<void> | void) => Promise<void>
declare function listenTcpServerPackets(port: number): (handler: (data: string) => Promise<void> | void) => Promise<void>

/** 向当前活动面板发送数据。mode='hex' 按十六进制解析；append 可追加 CR/LF。 */
declare function send(data: string, mode?: 'text' | 'hex', append?: 'none' | 'CR' | 'LF' | 'CRLF'): Promise<{ ok: boolean; error?: string }>
/** 向指定面板 ID 发送数据（不依赖当前活动面板）。 */
declare function sendToPanel(panelId: string, data: string, mode?: 'text' | 'hex', append?: 'none' | 'CR' | 'LF' | 'CRLF'): Promise<{ ok: boolean; error?: string }>
/** 向指定串口路径发送数据（可临时指定波特率等）。 */
declare function sendToSerial(portPath: string, data: string, mode?: 'text' | 'hex', append?: 'none' | 'CR' | 'LF' | 'CRLF', options?: { baudRate?: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<{ ok: boolean; error?: string }>
/** 向指定 TCP 主机/端口发送数据。 */
declare function sendTCP(host: string, port: number, data: string, mode?: 'text' | 'hex'): Promise<{ ok: boolean; error?: string; sent?: unknown }>
/** 向 TCP 服务器的所有已连接客户端广播。 */
declare function broadcastTcpServer(port: number, data: string, mode?: 'text' | 'hex'): Promise<{ ok: boolean; sent?: number; failed?: number; error?: string }>

declare function modbusRead(panelId: string, fc: 1 | 2 | 3 | 4, slaveId: number, addr: number, qty: number): Promise<number[]>
declare function modbusWrite(panelId: string, fc: 5 | 6 | 15 | 16, slaveId: number, addr: number, values: number[]): Promise<{ ok: boolean }>

declare function readFile(filePath: string, encoding?: string): Promise<string>
declare function writeFile(filePath: string, content: string, mode?: 'overwrite' | 'append'): Promise<{ ok: boolean; error?: string }>

declare function textToHex(text: string): string
declare function hexToText(hex: string): string
declare function btoa(s: string): string
declare function atob(s: string): string
declare function convertEncoding(text: string, from: string, to: string): string
declare function swapBytes(input: string | Uint8Array, size?: number): string
declare function chunkString(str: string, size: number): string[]
declare function bytesToNumber(value: string | Uint8Array | number[], type?: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float', endian?: '大端' | '小端' | 'le' | 'be'): number
declare function convertBase(value: string, fromBase: number, toBase: number): string
declare function crc8(input: string | Uint8Array): string
declare function crc16(input: string | Uint8Array): string
declare function crc16ccitt(input: string | Uint8Array): string
declare function crc32(input: string | Uint8Array): string
declare function checksum(input: string | Uint8Array): string
`
}
