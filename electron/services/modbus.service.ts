import type { ModbusConnectOptions } from '../../shared/types'
import {
  modbusClients, ensureModbusOpen, closeModbus, readOnce, writeOnce, applyPolls,
} from '../modbusService'

/**
 * ModbusService —— Modbus 主进程服务域。
 *
 * 薄封装：核心逻辑（连接/读/写/轮询/错误翻译）已在 electron/modbusService.ts，
 * 此处仅按 IPC 契约组织 + 暴露窗口关闭时的清理入口。
 * 行为逐函数对照搬移自 main.ts 的 modbus:* handler（main.ts:844-871），零变化。
 *
 * 注：modbusService.ts 的 setModbusBroadcaster / setModbusClientFactory 仍由 main.ts 装配时
 * 调用（广播到所有窗口）；此处不重复注入。
 */
export class ModbusService {
  async open(panelId: string, opts: ModbusConnectOptions): Promise<{ ok: boolean; message?: string }> {
    return ensureModbusOpen(panelId, opts)
  }

  async close(panelId: string): Promise<void> {
    await closeModbus(panelId)
  }

  async read(panelId: string, slaveId: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number): Promise<{ values: number[]; error?: string }> {
    const entry = modbusClients.get(panelId)
    if (!entry) return { values: [], error: 'Modbus 面板未连接' }
    try {
      const values = await readOnce(entry, { slaveId, functionCode: fc, startAddress: addr, quantity: qty })
      return { values, error: undefined }
    } catch (e: any) {
      return { values: [], error: String(e?.message ?? e) }
    }
  }

  async write(panelId: string, target: any): Promise<{ ok: boolean; error?: string }> {
    const entry = modbusClients.get(panelId)
    if (!entry) return { ok: false, error: 'Modbus 面板未连接' }
    try {
      await writeOnce(entry, target)
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) }
    }
  }

  setPolls(panelId: string, blocks: any[]): void {
    applyPolls(panelId, blocks)
  }

  status(panelId: string): string {
    return modbusClients.get(panelId)?.status ?? 'closed'
  }

  // ── 关闭时清理（window-all-closed）──
  closeAll(): void {
    modbusClients.forEach((entry) => {
      for (const p of entry.polls.values()) { if (p.timer) clearInterval(p.timer) }
      try { entry.client?.close?.(() => {}) } catch { /* ignore */ }
    })
    modbusClients.clear()
  }
}
