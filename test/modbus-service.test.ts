import { describe, it, expect, vi } from 'vitest'
import { readOnce } from '../electron/modbusService'

// 一个最小 mock client，模拟 modbus-serial 的方法签名
function makeMockClient() {
  return {
    setID: vi.fn(),
    setTimeout: vi.fn(),
    readCoils: vi.fn().mockResolvedValue({ data: [true, false, true] }),
    readDiscreteInputs: vi.fn().mockResolvedValue({ data: [false, true] }),
    readHoldingRegisters: vi.fn().mockResolvedValue({ data: [100, 200, 300] }),
    readInputRegisters: vi.fn().mockResolvedValue({ data: [7, 8] }),
    writeCoil: vi.fn().mockResolvedValue(undefined),
    writeRegister: vi.fn().mockResolvedValue(undefined),
    writeCoils: vi.fn().mockResolvedValue(undefined),
    writeRegisters: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('readOnce', () => {
  it('FC3 读保持寄存器：调用 readHoldingRegisters 并返回数字数组', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 1, functionCode: 3, startAddress: 0, quantity: 3 })
    expect(client.setID).toHaveBeenCalledWith(1)
    expect(client.readHoldingRegisters).toHaveBeenCalledWith(0, 3)
    expect(values).toEqual([100, 200, 300])
  })

  it('FC4 读输入寄存器：调用 readInputRegisters', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 2, functionCode: 4, startAddress: 10, quantity: 2 })
    expect(client.readInputRegisters).toHaveBeenCalledWith(10, 2)
    expect(values).toEqual([7, 8])
  })

  it('FC1 读线圈：布尔数组转 0/1', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 1, functionCode: 1, startAddress: 0, quantity: 3 })
    expect(client.readCoils).toHaveBeenCalledWith(0, 3)
    expect(values).toEqual([1, 0, 1])
  })

  it('FC2 读离散输入：布尔数组转 0/1', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    const values = await readOnce(entry, { slaveId: 1, functionCode: 2, startAddress: 0, quantity: 2 })
    expect(client.readDiscreteInputs).toHaveBeenCalledWith(0, 2)
    expect(values).toEqual([0, 1])
  })

  it('未知功能码抛错', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await expect(readOnce(entry, { slaveId: 1, functionCode: 99 as any, startAddress: 0, quantity: 1 }))
      .rejects.toThrow(/不支持的功能码/)
  })

  it('client 抛错时透传（超时）', async () => {
    const client = makeMockClient()
    client.readHoldingRegisters.mockRejectedValue(new Error('Modbus timeout'))
    const entry = { client } as any
    await expect(readOnce(entry, { slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1 }))
      .rejects.toThrow('Modbus timeout')
  })
})
