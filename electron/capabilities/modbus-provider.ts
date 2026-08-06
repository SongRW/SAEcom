import type { CapabilityProvider, RunContext } from '../core/capability-registry'
import { modbusClients, readOnce, writeOnce } from '../modbusService'

/**
 * ModbusCapabilityProvider —— 脚本沙箱 Modbus 读写能力。
 *
 * 对照搬移自 main.ts sandbox 对象字面量中 modbusRead / modbusWrite key。
 *
 * 注入：modbusClients（来自 electron/modbusService.ts，与 ModbusService 共享连接表）+
 *   readOnce / writeOnce（modbusService.ts 的核心读写函数，与轮询共用）。
 *
 * 行为逐行对照搬移，零变化。
 */
export class ModbusCapabilityProvider implements CapabilityProvider {
  readonly id = 'modbus'

  apis(_rc: RunContext): Record<string, any> {
    const { token } = _rc

    return {
      modbusRead: async (panelId: string, fc: number, slaveId: number, addr: number, qty: number) => {
        if (token.aborted) throw new Error('ABORTED')
        const entry = modbusClients.get(panelId)
        if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
        return readOnce(entry, { slaveId, functionCode: fc as 1 | 2 | 3 | 4, startAddress: addr, quantity: qty })
      },
      modbusWrite: async (panelId: string, fc: number, slaveId: number, addr: number, values: number[]) => {
        if (token.aborted) throw new Error('ABORTED')
        const entry = modbusClients.get(panelId)
        if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
        await writeOnce(entry, { slaveId, functionCode: fc as 5 | 6 | 15 | 16, startAddress: addr, values })
        return { ok: true }
      }
    }
  }
}
