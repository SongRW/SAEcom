/**
 * 沙箱 API 文档元数据（单一来源）。
 *
 * 两个消费方共用这份数据，保证文档不漂移：
 * 1. `editor-types.ts` 的 sandboxApiExtraLib() → 生成带 JSDoc 注释的 d.ts，
 *    Monaco 悬停即有完整文档（说明/参数/示例）。
 * 2. 自定义组件编辑器「查看 API 文档」面板 → 按分类渲染签名/参数/示例。
 *
 * 签名必须与运行时（electron/scriptSandbox.ts + capabilities providers）一致——
 * 白名单（sandboxCatalog.ts）是最终防线；此处仅提供编辑期文档。
 */
export interface SandboxApiDoc {
  /** 白名单 API 名（与 SANDBOX_API_CATALOG 一致）。 */
  name: string
  /** 分类（文档面板分组）。 */
  category: '控制流' | '收发' | '监听' | 'Modbus' | '文件' | '编码与校验' | '工具'
  /** 一句话说明。 */
  summary: string
  /** TypeScript 风格签名（悬停/面板展示）。 */
  signature: string
  /** 参数说明（可选）。 */
  params?: Array<{ name: string; desc: string }>
  /** 返回说明（可选）。 */
  returns?: string
  /** 示例代码（可选）。 */
  example?: string
}

/** 常用 API 文档。未收录的白名单 API 仍在白名单校验内，仅无文档展示。 */
export const SANDBOX_API_DOCS: SandboxApiDoc[] = [
  {
    name: 'send',
    category: '收发',
    summary: '向当前活动面板发送数据（文本/Hex，可追加 CR/LF）',
    signature: "send(data: string, mode?: 'text' | 'hex', append?: 'none' | 'CR' | 'LF' | 'CRLF'): Promise<{ ok: boolean; error?: string }>",
    params: [
      { name: 'data', desc: '要发送的字符串；mode=hex 时为十六进制文本（如 "7E 01 02"）' },
      { name: 'mode?', desc: "'text' 按文本发送；'hex' 按十六进制解析发送。默认 'text'" },
      { name: 'append?', desc: "行尾追加：'none' | 'CR' | 'LF' | 'CRLF'。默认 'none'" }
    ],
    returns: '{ ok } 发送是否成功；失败时 error 给出原因',
    example: "await send('AT+CSQ');\nawait send('7E 01 02', 'hex');\nawait send('OK', 'text', 'CRLF');"
  },
  {
    name: 'sendToPanel',
    category: '收发',
    summary: '向指定面板 ID 发送数据（不依赖当前活动面板）',
    signature: "sendToPanel(panelId: string, data: string, mode?: 'text' | 'hex', append?: 'none' | 'CR' | 'LF' | 'CRLF'): Promise<{ ok: boolean; error?: string }>",
    params: [
      { name: 'panelId', desc: '目标面板 ID（串口/TCP 面板）' },
      { name: 'data', desc: '要发送的字符串' }
    ],
    example: "await sendToPanel('panel-1', 'PING');"
  },
  {
    name: 'sendToSerial',
    category: '收发',
    summary: '向指定串口路径发送数据（可临时指定波特率等）',
    signature: "sendToSerial(portPath: string, data: string, mode?: 'text' | 'hex', append?: 'none' | 'CR' | 'LF' | 'CRLF', options?: { baudRate?: number }): Promise<{ ok: boolean; error?: string }>",
    example: "await sendToSerial('COM3', '55 AA', 'hex');"
  },
  {
    name: 'sendTCP',
    category: '收发',
    summary: '向指定 TCP 主机/端口发送数据',
    signature: "sendTCP(host: string, port: number, data: string, mode?: 'text' | 'hex'): Promise<{ ok: boolean; error?: string; sent?: unknown }>",
    example: "await sendTCP('127.0.0.1', 9000, 'hello');"
  },
  {
    name: 'broadcastTcpServer',
    category: '收发',
    summary: '向 TCP 服务器的所有已连接客户端广播',
    signature: "broadcastTcpServer(port: number, data: string, mode?: 'text' | 'hex'): Promise<{ ok: boolean; sent?: number; failed?: number; error?: string }>"
  },
  {
    name: 'sleep',
    category: '控制流',
    summary: '延时等待（毫秒）',
    signature: 'sleep(ms: number): Promise<void>',
    example: 'await sleep(1000); // 停 1 秒'
  },
  {
    name: 'waitOnePacket',
    category: '收发',
    summary: '等待下一个数据包（可设超时），返回文本',
    signature: 'waitOnePacket(timeout?: number): Promise<string>',
    example: "const reply = await waitOnePacket(2000);"
  },
  {
    name: 'waitPanelPacket',
    category: '收发',
    summary: '等待指定面板的下一个数据包',
    signature: 'waitPanelPacket(panelId: string, timeout?: number): Promise<string>'
  },
  {
    name: 'waitTcpServer',
    category: '收发',
    summary: '等待 TCP 服务器端口收到数据',
    signature: 'waitTcpServer(port: number, timeout?: number): Promise<string>'
  },
  {
    name: 'listenSerialPackets',
    category: '监听',
    summary: '监听串口数据流（指定端口，可缓冲合并）',
    signature: 'listenSerialPackets(portPath: string, options?: { baudRate?: number }, listenOptions?: { bufferMs?: number; append?: string }): (handler) => Promise<void>',
    example: "await listenSerialPackets('COM3', {}, { bufferMs: 50 })(async (pkt) => {\n  console.log(pkt.text);\n});"
  },
  {
    name: 'listenTcpPackets',
    category: '监听',
    summary: '监听 TCP 客户端数据',
    signature: 'listenTcpPackets(host: string, port: number): (handler) => Promise<void>'
  },
  {
    name: 'listenTcpServerPackets',
    category: '监听',
    summary: '监听 TCP 服务器端口收到的数据',
    signature: 'listenTcpServerPackets(port: number): (handler) => Promise<void>'
  },
  {
    name: 'listenCurrentPackets',
    category: '监听',
    summary: '监听当前活动面板的数据流',
    signature: 'listenCurrentPackets(): (handler) => Promise<void>'
  },
  {
    name: 'listenPanelPackets',
    category: '监听',
    summary: '监听指定面板的数据流',
    signature: 'listenPanelPackets(panelId: string): (handler) => Promise<void>'
  },
  {
    name: 'modbusRead',
    category: 'Modbus',
    summary: 'Modbus 读寄存器（功能码 1/2/3/4）',
    signature: 'modbusRead(panelId: string, fc: 1 | 2 | 3 | 4, slaveId: number, addr: number, qty: number): Promise<number[]>'
  },
  {
    name: 'modbusWrite',
    category: 'Modbus',
    summary: 'Modbus 写寄存器（功能码 5/6/15/16）',
    signature: 'modbusWrite(panelId: string, fc: 5 | 6 | 15 | 16, slaveId: number, addr: number, values: number[]): Promise<{ ok: boolean }>'
  },
  {
    name: 'readFile',
    category: '文件',
    summary: '读取文件（默认 utf-8）',
    signature: 'readFile(filePath: string, encoding?: string): Promise<string>'
  },
  {
    name: 'writeFile',
    category: '文件',
    summary: '写入文件（overwrite 覆盖 / append 追加）',
    signature: "writeFile(filePath: string, content: string, mode?: 'overwrite' | 'append'): Promise<{ ok: boolean; error?: string }>"
  },
  {
    name: 'textToHex',
    category: '编码与校验',
    summary: '文本 → 十六进制字符串',
    signature: 'textToHex(text: string): string',
    example: "textToHex('AB') // '4142'"
  },
  {
    name: 'hexToText',
    category: '编码与校验',
    summary: '十六进制字符串 → 文本',
    signature: 'hexToText(hex: string): string'
  },
  {
    name: 'convertEncoding',
    category: '编码与校验',
    summary: '编码转换（GBK/UTF-8 等）',
    signature: 'convertEncoding(text: string, from: string, to: string): string'
  },
  {
    name: 'swapBytes',
    category: '编码与校验',
    summary: '字节序交换（按 size 分组）',
    signature: 'swapBytes(input: string | Uint8Array, size?: number): string'
  },
  {
    name: 'chunkString',
    category: '编码与校验',
    summary: '按长度切分字符串',
    signature: 'chunkString(str: string, size: number): string[]'
  },
  {
    name: 'bytesToNumber',
    category: '编码与校验',
    summary: '字节 → 数值（可按类型/大小端解析）',
    signature: "bytesToNumber(value: string | Uint8Array | number[], type?: 'uint8' | 'int8' | 'uint16' | 'int16' | 'uint32' | 'int32' | 'float', endian?: '大端' | '小端' | 'le' | 'be'): number",
    example: "bytesToNumber('01 02', 'uint16', '大端') // 0x0102 = 258"
  },
  {
    name: 'convertBase',
    category: '编码与校验',
    summary: '进制转换',
    signature: 'convertBase(value: string, fromBase: number, toBase: number): string'
  },
  {
    name: 'crc8',
    category: '编码与校验',
    summary: 'CRC8 校验（返回十六进制字符串）',
    signature: 'crc8(input: string | Uint8Array): string'
  },
  {
    name: 'crc16',
    category: '编码与校验',
    summary: 'CRC16 校验（返回十六进制字符串）',
    signature: 'crc16(input: string | Uint8Array): string'
  },
  {
    name: 'crc16ccitt',
    category: '编码与校验',
    summary: 'CRC16-CCITT 校验（返回十六进制字符串）',
    signature: 'crc16ccitt(input: string | Uint8Array): string'
  },
  {
    name: 'crc32',
    category: '编码与校验',
    summary: 'CRC32 校验（返回十六进制字符串）',
    signature: 'crc32(input: string | Uint8Array): string'
  },
  {
    name: 'checksum',
    category: '编码与校验',
    summary: '累加和校验（返回十六进制字符串）',
    signature: 'checksum(input: string | Uint8Array): string'
  },
  {
    name: 'btoa',
    category: '工具',
    summary: 'Base64 编码',
    signature: 'btoa(s: string): string'
  },
  {
    name: 'atob',
    category: '工具',
    summary: 'Base64 解码',
    signature: 'atob(s: string): string'
  }
]

/** 按名字查询（供文档面板/搜索用）。 */
export function getSandboxApiDoc(name: string): SandboxApiDoc | undefined {
  return SANDBOX_API_DOCS.find((doc) => doc.name === name)
}
