// electron/modbusService.ts
// Modbus 主进程服务核心。镜像 electron/main.ts 的 ports 表模式，
// 但为可测试性抽到独立文件，并支持 client 工厂注入。
import type {
  ModbusConnectOptions, ModbusVariant, ModbusBlock, ModbusBlockUpdate,
} from '../shared/types'

// ---- 注册表（与 ports 表平行）----

export interface ModbusClientEntry {
  panelId: string
  variant: ModbusVariant
  client: any                 // modbus-serial 实例（或测试中的 mock）
  connectOptions: ModbusConnectOptions
  polls: Map<string, { block: ModbusBlock; timer: NodeJS.Timeout | null }>
  status: 'closed' | 'opening' | 'open' | 'error'
  lastError?: string
}

export const modbusClients = new Map<string, ModbusClientEntry>()

// 用于广播事件到所有渲染窗口（由 main.ts 注入，避免本文件直接依赖 BrowserWindow）
let broadcaster: ((channel: string, payload: unknown) => void) | null = null
export function setModbusBroadcaster(fn: (channel: string, payload: unknown) => void) {
  broadcaster = fn
}
function broadcast(channel: string, payload: unknown) {
  if (broadcaster) broadcaster(channel, payload)
}

// modbus-serial client 工厂（可注入）。默认工厂在 main.ts 接线时设置。
type ClientFactory = (opts: ModbusConnectOptions) => Promise<any>
async function defaultClientFactory(_opts: ModbusConnectOptions): Promise<any> {
  // 默认工厂使用真实的 modbus-serial。延迟 require 避免单元测试时强依赖。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ModbusRTU = require('modbus-serial')
  const client = new ModbusRTU()
  return client
}
let clientFactory: ClientFactory = defaultClientFactory
export function setModbusClientFactory(f: ClientFactory) {
  clientFactory = f
}

// ---- 核心读（手动读 / 轮询 / 脚本沙箱共用）----

export interface ReadParams {
  slaveId: number
  functionCode: 1 | 2 | 3 | 4
  startAddress: number
  quantity: number
}

export async function readOnce(entry: ModbusClientEntry, params: ReadParams): Promise<number[]> {
  const c = entry.client
  c.setID(params.slaveId)
  c.setTimeout(2000) // 默认 2s
  const { functionCode: fc, startAddress: addr, quantity: qty } = params
  switch (fc) {
    case 1: {
      const r = await c.readCoils(addr, qty)
      return normalizeData(r).map((b: unknown) => (b ? 1 : 0))
    }
    case 2: {
      const r = await c.readDiscreteInputs(addr, qty)
      return normalizeData(r).map((b: unknown) => (b ? 1 : 0))
    }
    case 3: {
      const r = await c.readHoldingRegisters(addr, qty)
      return normalizeData(r).map((n: unknown) => Number(n))
    }
    case 4: {
      const r = await c.readInputRegisters(addr, qty)
      return normalizeData(r).map((n: unknown) => Number(n))
    }
    default:
      throw new Error(`不支持的功能码: ${fc}`)
  }
}

// modbus-serial 响应可能是 { data: [...] } 或 { array: [...] }，统一取数组
function normalizeData(r: any): any[] {
  if (Array.isArray(r)) return r
  if (Array.isArray(r?.data)) return r.data
  if (Array.isArray(r?.array)) return r.array
  return []
}
