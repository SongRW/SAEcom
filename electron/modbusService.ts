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

export interface WriteParams {
  slaveId: number
  functionCode: 5 | 6 | 15 | 16
  startAddress: number
  values: number[]
}

export async function writeOnce(entry: ModbusClientEntry, params: WriteParams): Promise<void> {
  const c = entry.client
  c.setID(params.slaveId)
  c.setTimeout(2000)
  const { functionCode: fc, startAddress: addr, values } = params
  switch (fc) {
    case 5: {
      if (values.length !== 1) throw new Error('单写线圈(FC5)需要恰好 1 个值')
      await c.writeCoil(addr, !!values[0])
      return
    }
    case 6: {
      if (values.length !== 1) throw new Error('单写寄存器(FC6)需要恰好 1 个值')
      await c.writeRegister(addr, Number(values[0]))
      return
    }
    case 15: {
      await c.writeCoils(addr, values.map((v) => !!v))
      return
    }
    case 16: {
      await c.writeRegisters(addr, values.map((v) => Number(v)))
      return
    }
    default:
      throw new Error(`不支持的功能码: ${fc}`)
  }
}

export function applyPolls(panelId: string, blocks: ModbusBlock[]) {
  const entry = modbusClients.get(panelId)
  if (!entry) return

  // 清除所有现有 timers
  for (const p of entry.polls.values()) {
    if (p.timer) clearInterval(p.timer)
  }
  entry.polls.clear()

  for (const block of blocks) {
    const doRead = async () => {
      try {
        const values = await readOnce(entry, {
          slaveId: block.slaveId,
          functionCode: block.functionCode,
          startAddress: block.startAddress,
          quantity: block.quantity,
        })
        const update: ModbusBlockUpdate = { panelId, blockId: block.id, values, ts: Date.now() }
        broadcast('modbus:data', update)
      } catch (e: any) {
        const update: ModbusBlockUpdate = {
          panelId, blockId: block.id, values: [], ts: Date.now(), error: translateModbusError(e),
        }
        broadcast('modbus:data', update)
      }
    }

    const intervalMs = Math.max(50, block.pollIntervalMs)
    const timer = block.pollEnabled ? setInterval(() => { void doRead() }, intervalMs) : null
    entry.polls.set(block.id, { block, timer })
    if (block.pollEnabled) void doRead() // 立即首次读
  }
}

// 把 modbus-serial / Modbus 异常翻译成可读中文消息
export function translateModbusError(e: any): string {
  const code = e?.modbusExceptionCode ?? e?.code
  if (code != null) {
    const map: Record<number, string> = {
      1: '非法功能码(01)', 2: '非法地址(02)', 3: '非法值(03)', 4: '从站故障(04)',
    }
    return `从站异常：${map[code] ?? `代码(${String(code).padStart(2, '0')})`}`
  }
  return String(e?.message ?? e)
}

export async function ensureModbusOpen(
  panelId: string,
  opts: ModbusConnectOptions,
): Promise<{ ok: boolean; message?: string }> {
  // 已存在则先关
  if (modbusClients.has(panelId)) {
    await closeModbus(panelId).catch(() => {})
  }

  let client: any
  try {
    client = await clientFactory(opts)
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    broadcast('modbus:event', { id: panelId, type: 'error', message: msg })
    return { ok: false, message: msg }
  }

  const entry: ModbusClientEntry = {
    panelId, variant: opts.variant, client, connectOptions: opts,
    polls: new Map(), status: 'opening',
  }
  modbusClients.set(panelId, entry)

  try {
    if (opts.variant === 'tcp') {
      await client.connectTCP(opts.tcpHost, { port: opts.tcpPort ?? 502 })
    } else if (opts.variant === 'rtu') {
      // 阶段 3 实现；阶段 1 先抛错占位
      throw new Error('RTU 连接将在阶段 3 实现')
    } else if (opts.variant === 'ascii') {
      throw new Error('ASCII 连接将在阶段 3 实现')
    }
    entry.status = 'open'
    broadcast('modbus:event', { id: panelId, type: 'open' })
    return { ok: true }
  } catch (e: any) {
    entry.status = 'error'
    entry.lastError = String(e?.message ?? e)
    modbusClients.delete(panelId)
    try { await client.close() } catch { /* ignore */ }
    const msg = String(e?.message ?? e)
    broadcast('modbus:event', { id: panelId, type: 'error', message: msg })
    return { ok: false, message: msg }
  }
}

export async function closeModbus(panelId: string): Promise<void> {
  const entry = modbusClients.get(panelId)
  if (!entry) return
  // 清 timers
  for (const p of entry.polls.values()) {
    if (p.timer) clearInterval(p.timer)
  }
  entry.polls.clear()
  try { await entry.client?.close?.() } catch { /* ignore */ }
  modbusClients.delete(panelId)
  broadcast('modbus:event', { id: panelId, type: 'close' })
}
