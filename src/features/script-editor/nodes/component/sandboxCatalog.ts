/**
 * 脚本沙箱能力白名单（内置 + 可扩展）。
 *
 * 与 electron 主进程脚本 sandbox（CapabilityRegistry 装配的 5 个 provider）
 * 对齐：节点通过 sandboxApis() 声明依赖；codegen 汇总校验；运行时 vm 沙箱
 * 白名单是最终防线。
 *
 * 可扩展性：插件系统（utilityProcess host）在运行时贡献新能力时，经
 * `registerSandboxApi(name, providerId)` 把新 API 名追加到扩展表。
 * 内置表 SANDBOX_API_CATALOG 保持只读冻结（编译期常量，类型派生来源）；
 * 运行时新增经扩展表，不影响类型层面的 SandboxApiName 联合（内置 API
 * 可静态收窄；插件 API 名是动态字符串，类型层面统一为 string）。
 */

/** 内置能力白名单（编译期常量，禁止运行时修改）。与 5 个内置 provider 对齐。 */
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
  'checksum',
  'aesEncrypt',
  'aesDecrypt'
] as const

/** 内置 API 名联合类型（编译期可静态收窄）。插件扩展 API 类型层面为 string。 */
export type SandboxApiName = (typeof SANDBOX_API_CATALOG)[number]

// ── 扩展注册表（运行时可追加，插件贡献的能力） ──

interface SandboxApiRegistration {
  name: string
  /** 贡献者标识（providerId 或 pluginId），用于诊断与卸载时清理。 */
  provider: string
}

/**
 * 扩展表：插件在运行时注册的 API。
 * key = api name；value = 注册信息。同一 name 重复注册打 warn 覆盖（最后注册胜出）。
 */
const extendedSandboxApis = new Map<string, SandboxApiRegistration>()

/**
 * 注册一个插件贡献的沙箱 API。
 * @param name API 名（用户脚本里调用的标识符）
 * @param provider 贡献者（如 'plugin.com.example.mqtt'）
 */
export function registerSandboxApi(name: string, provider: string): void {
  if (!name || typeof name !== 'string') {
    throw new Error(`[sandboxCatalog] registerSandboxApi: name 必须为非空字符串`)
  }
  if (SANDBOX_API_CATALOG.includes(name as SandboxApiName)) {
    // 与内置同名：禁止覆盖内置（内置是核心能力，覆盖会让校验语义混乱）
    throw new Error(`[sandboxCatalog] registerSandboxApi: '${name}' 是内置 API，禁止覆盖`)
  }
  if (extendedSandboxApis.has(name)) {
    console.warn(`[sandboxCatalog] sandbox API '${name}' 已由 '${extendedSandboxApis.get(name)!.provider}' 注册，将被 '${provider}' 覆盖`)
  }
  extendedSandboxApis.set(name, { name, provider })
}

/** 按贡献者批量注销其扩展 API（插件卸载时清理）。内置 API 不受影响。 */
export function unregisterSandboxApisByProvider(provider: string): void {
  for (const [name, reg] of extendedSandboxApis) {
    if (reg.provider === provider) extendedSandboxApis.delete(name)
  }
}

/** 清空所有扩展 API（仅测试用）。 */
export function clearExtendedSandboxApisRegistrations(): void {
  extendedSandboxApis.clear()
}

/**
 * 全量 API 列表（内置 + 扩展），按内置在前、扩展在后（注册顺序）返回。
 * 消费方需要展示"共 N 个"或建全量 Set 时用此函数，而非直接用 SANDBOX_API_CATALOG。
 */
export function getAllSandboxApis(): string[] {
  return [...SANDBOX_API_CATALOG, ...extendedSandboxApis.keys()]
}

const SANDBOX_API_SET = new Set<string>(SANDBOX_API_CATALOG)

export function isKnownSandboxApi(name: string): boolean {
  // 内置表（Set 快速命中）+ 扩展表（Map 查询）
  return SANDBOX_API_SET.has(name) || extendedSandboxApis.has(name)
}

export function unknownSandboxApis(names: string[]): string[] {
  return names.filter((name) => !isKnownSandboxApi(name))
}
