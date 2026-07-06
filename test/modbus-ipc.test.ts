import { describe, it, expectTypeOf } from 'vitest'
import type { WindowAPI, ModbusAPI, ModbusVariant, ModbusConnectOptions, ModbusBlock, ModbusBlockUpdate, ModbusWriteTarget, ModbusEvent } from '@shared/types'

describe('Modbus IPC 类型契约', () => {
  it('WindowAPI 含 modbus 域', () => {
    expectTypeOf<WindowAPI>().toHaveProperty('modbus').toEqualTypeOf<ModbusAPI>()
  })

  it('ModbusVariant 覆盖三种变体', () => {
    const v: ModbusVariant = 'rtu'
    expectTypeOf<ModbusVariant>().toEqualTypeOf<'rtu' | 'tcp' | 'ascii'>()
    void v
  })

  it('ModbusBlock.functionCode 限定 1-4', () => {
    expectTypeOf<ModbusBlock['functionCode']>().toEqualTypeOf<1 | 2 | 3 | 4>()
  })

  it('ModbusWriteTarget.functionCode 限定 5/6/15/16', () => {
    expectTypeOf<ModbusWriteTarget['functionCode']>().toEqualTypeOf<5 | 6 | 15 | 16>()
  })

  it('ModbusBlockUpdate 含 error 可选字段', () => {
    const u: ModbusBlockUpdate = { panelId: 'p', blockId: 'b', values: [1], ts: 0, error: 'timeout' }
    expectTypeOf(u.error).toEqualTypeOf<string | undefined>()
  })

  it('ModbusConnectOptions TCP/串口字段可选', () => {
    const o: ModbusConnectOptions = { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: 502 }
    void o
  })

  it('ModbusAPI 暴露完整方法集', () => {
    expectTypeOf<ModbusAPI>().toMatchTypeOf<{
      open: (panelId: string, options: ModbusConnectOptions) => Promise<{ ok: boolean; message?: string }>
      close: (panelId: string) => Promise<void>
      read: (panelId: string, slaveId: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number) => Promise<{ values: number[]; error?: string }>
      write: (panelId: string, target: ModbusWriteTarget) => Promise<{ ok: boolean; error?: string }>
      setPolls: (panelId: string, blocks: ModbusBlock[]) => Promise<void>
      status: (panelId: string) => Promise<'closed' | 'opening' | 'open' | 'error'>
      onData: (cb: (u: ModbusBlockUpdate) => void) => () => void
      onEvent: (cb: (e: ModbusEvent) => void) => () => void
    }>()
  })
})
