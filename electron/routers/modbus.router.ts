import { registerRouter, type InvokeRoutes } from '../core/ipc'
import type { ModbusService } from '../services/modbus.service'

/**
 * ModbusRouter —— Modbus 域的 IPC 注册。
 *
 * 通道名零变化：modbus:open / modbus:close / modbus:read / modbus:write /
 *   modbus:setPolls / modbus:status。
 *
 * 注意：原 main.ts modbus:* handler 用位置参数（ipcMain.handle('modbus:open', (e, panelId, opts) => ...)），
 * preload 也用位置参数 invoke（见 preload.ts modbus 命名空间）。
 * registerRouter 把 (...args) 透传给 handler，故此处签名保持位置参数，零变化。
 */
export function registerModbusRouter(service: ModbusService): void {
  const invoke: InvokeRoutes = {
    open: (_e, panelId: string, opts: any) => service.open(panelId, opts),
    close: async (_e, panelId: string) => { await service.close(panelId); return undefined },
    read: (_e, panelId: string, slaveId: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number) =>
      service.read(panelId, slaveId, fc, addr, qty),
    write: (_e, panelId: string, target: any) => service.write(panelId, target),
    setPolls: (_e, panelId: string, blocks: any[]) => { service.setPolls(panelId, blocks); return undefined },
    status: (_e, panelId: string) => service.status(panelId)
  }

  registerRouter({ namespace: 'modbus', invoke })
}
