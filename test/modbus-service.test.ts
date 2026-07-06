import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readOnce, writeOnce, applyPolls, modbusClients, setModbusBroadcaster, setModbusClientFactory, ensureModbusOpen, closeModbus } from '../electron/modbusService'

// 一个最小 mock client，模拟 modbus-serial 的方法签名
function makeMockClient() {
  return {
    connectTCP: vi.fn().mockResolvedValue(undefined),
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

describe('writeOnce', () => {
  it('FC6 写单寄存器：调用 writeRegister', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 6, startAddress: 5, values: [42] })
    expect(client.setID).toHaveBeenCalledWith(1)
    expect(client.writeRegister).toHaveBeenCalledWith(5, 42)
  })

  it('FC5 写单线圈：values[0] 非 0 转 true', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 5, startAddress: 3, values: [1] })
    expect(client.writeCoil).toHaveBeenCalledWith(3, true)
    client.writeCoil.mockClear()
    await writeOnce(entry, { slaveId: 1, functionCode: 5, startAddress: 3, values: [0] })
    expect(client.writeCoil).toHaveBeenCalledWith(3, false)
  })

  it('FC16 写多寄存器：调用 writeRegisters', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 16, startAddress: 10, values: [1, 2, 3] })
    expect(client.writeRegisters).toHaveBeenCalledWith(10, [1, 2, 3])
  })

  it('FC15 写多线圈：values 0/1 转 boolean 数组', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await writeOnce(entry, { slaveId: 1, functionCode: 15, startAddress: 0, values: [1, 0, 1] })
    expect(client.writeCoils).toHaveBeenCalledWith(0, [true, false, true])
  })

  it('未知功能码抛错', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await expect(writeOnce(entry, { slaveId: 1, functionCode: 99 as any, startAddress: 0, values: [1] }))
      .rejects.toThrow(/不支持的功能码/)
  })

  it('FC5/FC6 values 长度不为 1 抛错', async () => {
    const client = makeMockClient()
    const entry = { client } as any
    await expect(writeOnce(entry, { slaveId: 1, functionCode: 6, startAddress: 0, values: [1, 2] }))
      .rejects.toThrow(/单写.*1 个值/)
  })
})

describe('applyPolls', () => {
  beforeEach(() => {
    modbusClients.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('pollEnabled=true 的区块立即读一次 + 启动 interval', async () => {
    const client = makeMockClient()
    client.readHoldingRegisters.mockResolvedValue({ data: [11, 22] })
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    const blocks: any[] = [
      { id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 2, pollEnabled: true, pollIntervalMs: 1000 },
    ]
    applyPolls('p1', blocks)

    // 立即首次读
    await vi.advanceTimersByTimeAsync(0)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(1)

    // 推进一个周期后再读一次
    await vi.advanceTimersByTimeAsync(1000)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(2)
  })

  it('pollEnabled=false 的区块不启动 interval', async () => {
    const client = makeMockClient()
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 2, pollEnabled: false, pollIntervalMs: 1000 } as any])
    await vi.advanceTimersByTimeAsync(3000)
    expect(client.readHoldingRegisters).not.toHaveBeenCalled()
  })

  it('轮询间隔 <50ms 兜底为 50ms', async () => {
    const client = makeMockClient()
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)
    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 10 } as any])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(49)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(1) // 只首次读
    await vi.advanceTimersByTimeAsync(1)
    expect(client.readHoldingRegisters).toHaveBeenCalledTimes(2) // 50ms 到点
  })

  it('读失败时广播 error，不抛出（不影响其他区块）', async () => {
    const client = makeMockClient()
    client.readHoldingRegisters.mockRejectedValue(new Error('timeout'))
    client.readInputRegisters.mockResolvedValue({ data: [9] })
    const events: any[] = []
    // 注入 broadcaster
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [
      { id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000 } as any,
      { id: 'b2', slaveId: 2, functionCode: 4, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000 } as any,
    ])
    await vi.advanceTimersByTimeAsync(0)

    const e1 = events.find((e) => e.blockId === 'b1')
    const e2 = events.find((e) => e.blockId === 'b2')
    expect(e1.error).toBeTruthy()
    expect(e2.values).toEqual([9])
    expect(events).toHaveLength(2)
  })

  it('二次调用 applyPolls 清除旧 timers', async () => {
    const client = makeMockClient()
    const entry: any = {
      panelId: 'p1', variant: 'tcp', client,
      connectOptions: { variant: 'tcp' }, polls: new Map(), status: 'open',
    }
    modbusClients.set('p1', entry)

    applyPolls('p1', [{ id: 'b1', slaveId: 1, functionCode: 3, startAddress: 0, quantity: 1, pollEnabled: true, pollIntervalMs: 1000 } as any])
    await vi.advanceTimersByTimeAsync(0)
    const countAfterFirst = client.readHoldingRegisters.mock.calls.length

    applyPolls('p1', []) // 清空
    await vi.advanceTimersByTimeAsync(5000)
    expect(client.readHoldingRegisters.mock.calls.length).toBe(countAfterFirst) // 不再增长
  })
})

describe('ensureModbusOpen / closeModbus', () => {
  beforeEach(() => {
    modbusClients.clear()
    vi.useRealTimers()
  })

  it('TCP 连接成功：注入 client 工厂返回带 connectTCP 的 client，状态 open', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const r = await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: 502 })
    expect(r.ok).toBe(true)
    expect(fakeClient.connectTCP).toHaveBeenCalledWith('127.0.0.1', expect.objectContaining({ port: 502 }))
    expect(modbusClients.get('p1')?.status).toBe('open')
    expect(events.some((e) => e.type === 'open')).toBe(true)
  })

  it('连接失败：返回 ok:false，发 error 事件，不进入注册表', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectTCP = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    setModbusClientFactory(async () => fakeClient)

    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    const r = await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'x', tcpPort: 502 })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/ECONNREFUSED/)
    expect(modbusClients.has('p1')).toBe(false)
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('已存在连接：先关旧的再重开', async () => {
    const old = makeMockClient()
    old.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => old)
    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'a', tcpPort: 502 })

    const fresh = makeMockClient()
    fresh.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => fresh)
    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'b', tcpPort: 502 })

    expect(old.close).toHaveBeenCalled()
    expect(modbusClients.get('p1')?.client).toBe(fresh)
  })

  it('closeModbus：清 timers、client.close、从注册表删除、发 close 事件', async () => {
    const fakeClient = makeMockClient()
    fakeClient.connectTCP = vi.fn().mockResolvedValue(undefined)
    setModbusClientFactory(async () => fakeClient)
    const events: any[] = []
    setModbusBroadcaster((_ch, payload) => events.push(payload))

    await ensureModbusOpen('p1', { variant: 'tcp', tcpHost: 'a', tcpPort: 502 })
    // 注入一个轮询 timer
    modbusClients.get('p1')!.polls.set('b1', { block: {} as any, timer: setInterval(() => {}, 1000) })

    await closeModbus('p1')
    expect(fakeClient.close).toHaveBeenCalled()
    expect(modbusClients.has('p1')).toBe(false)
    expect(events.some((e) => e.type === 'close')).toBe(true)
  })
})
