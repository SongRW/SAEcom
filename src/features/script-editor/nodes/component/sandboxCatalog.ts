/**
 * 与 electron/main.ts 脚本 sandbox 对齐的能力白名单。
 * 节点通过 sandboxApis() 声明依赖；codegen 可汇总校验。
 */
export const SANDBOX_API_CATALOG = [
  'console',
  'globalVars',
  '_last_recv',
  'checkStop',
  'sleep',
  'waitOnePacket',
  'waitPanelPacket',
  'waitTcpServer',
  'listenCurrentPackets',
  'listenPanelPackets',
  'listenSerialPackets',
  'listenTcpPackets',
  'listenTcpServerPackets',
  'send',
  'sendToPanel',
  'sendToSerial',
  'sendTCP',
  'broadcastTcpServer',
  'modbusRead',
  'modbusWrite',
  'readFile',
  'writeFile',
  'textToHex',
  'hexToText',
  'btoa',
  'atob',
  'convertEncoding',
  'swapBytes',
  'chunkString',
  'bytesToNumber',
  'convertBase',
  'crc8',
  'crc16',
  'crc16ccitt',
  'crc32',
  'checksum'
] as const

export type SandboxApiName = (typeof SANDBOX_API_CATALOG)[number]

const SANDBOX_API_SET = new Set<string>(SANDBOX_API_CATALOG)

export function isKnownSandboxApi(name: string): boolean {
  return SANDBOX_API_SET.has(name)
}

export function unknownSandboxApis(names: string[]): string[] {
  return names.filter((name) => !isKnownSandboxApi(name))
}
