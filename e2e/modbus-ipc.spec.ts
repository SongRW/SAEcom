/**
 * Modbus IPC 端到端（阶段 1：协议层 + 主进程服务）。
 *
 * 阶段 1 无面板 UI——这里直接在 renderer 调 window.api.modbus.*（走真实
 * preload → ipcMain → modbusService → modbus-serial client → TCP），连到一个
 * 本地 mock Modbus TCP 从站（e2e/helpers/mock-modbus-slave.ts），验证：
 *   open/close/status、read（FC3/FC4/FC1/FC2）、write（FC6/FC5/FC16/FC15）、
 *   onData 事件、连接级错误（连不上）。
 *
 * 这是 Task 9 手动验证的程序化替代，跑在真实 Electron + 真实 modbus-serial 上。
 */
import { test, expect } from './fixtures'
import { startModbusSlave } from './helpers/mock-modbus-slave'

const PANEL_ID = 'modbus-e2e-panel'

test.describe('Modbus IPC（阶段 1 协议层）', () => {
  let slave: Awaited<ReturnType<typeof startModbusSlave>>

  test.beforeEach(async () => {
    slave = await startModbusSlave()
  })

  test.afterEach(async () => {
    await slave.close()
  })

  test('open/status/close：TCP 连接生命周期', async ({ page }) => {
    // 初始：面板无连接
    const initialStatus = await page.evaluate(async (id) => {
      return await (window as any).api.modbus.status(id)
    }, PANEL_ID)
    expect(initialStatus).toBe('closed')

    // 连接
    const openRes = await page.evaluate(
      async ({ id, port }) => {
        return await (window as any).api.modbus.open(id, {
          variant: 'tcp',
          tcpHost: '127.0.0.1',
          tcpPort: port
        })
      },
      { id: PANEL_ID, port: slave.port }
    )
    expect(openRes.ok).toBe(true)

    // status 应为 open，且从站收到 1 个连接
    const openStatus = await page.evaluate(async (id) => {
      return await (window as any).api.modbus.status(id)
    }, PANEL_ID)
    expect(openStatus).toBe('open')
    expect(slave.connections).toBeGreaterThanOrEqual(1)

    // 关闭
    await page.evaluate(async (id) => {
      await (window as any).api.modbus.close(id)
    }, PANEL_ID)

    const closedStatus = await page.evaluate(async (id) => {
      return await (window as any).api.modbus.status(id)
    }, PANEL_ID)
    expect(closedStatus).toBe('closed')
  })

  test('read FC3 保持寄存器：返回 mock 从站 holding 区的值', async ({ page }) => {
    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    // holding 初始化为 (i+1)*10 → [10,20,30,40]
    const res = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.read(id, 1, 3, 0, 4)
      },
      { id: PANEL_ID }
    )
    expect(res.error).toBeUndefined()
    expect(res.values).toEqual([10, 20, 30, 40])
  })

  test('read FC4 输入寄存器', async ({ page }) => {
    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    // inputRegs 初始化为 (i+1)*100 → [100,200]
    const res = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.read(id, 1, 4, 0, 2)
      },
      { id: PANEL_ID }
    )
    expect(res.error).toBeUndefined()
    expect(res.values).toEqual([100, 200])
  })

  test('read FC1/FC2 线圈/离散输入：返回 0/1 数组', async ({ page }) => {
    // 预置线圈值
    slave.coils[0] = 1
    slave.coils[2] = 1
    slave.discrete[1] = 1

    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    const coils = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.read(id, 1, 1, 0, 4)
      },
      { id: PANEL_ID }
    )
    expect(coils.values).toEqual([1, 0, 1, 0])

    const discrete = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.read(id, 1, 2, 0, 2)
      },
      { id: PANEL_ID }
    )
    expect(discrete.values).toEqual([0, 1])
  })

  test('write FC6 单寄存器 + 回读校验', async ({ page }) => {
    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    const writeRes = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.write(id, {
          slaveId: 1,
          functionCode: 6,
          startAddress: 0,
          values: [7777]
        })
      },
      { id: PANEL_ID }
    )
    expect(writeRes.ok).toBe(true)
    expect(writeRes.error).toBeUndefined()

    // 从站 holding[0] 应被写为 7777
    expect(slave.holding[0]).toBe(7777)
  })

  test('write FC5 单线圈 + FC15 多线圈', async ({ page }) => {
    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    await page.evaluate(
      async ({ id }) => {
        await (window as any).api.modbus.write(id, {
          slaveId: 1, functionCode: 5, startAddress: 3, values: [1]
        })
      },
      { id: PANEL_ID }
    )
    expect(slave.coils[3]).toBe(1)

    await page.evaluate(
      async ({ id }) => {
        await (window as any).api.modbus.write(id, {
          slaveId: 1, functionCode: 15, startAddress: 0, values: [1, 0, 1, 1]
        })
      },
      { id: PANEL_ID }
    )
    expect(slave.coils[0]).toBe(1)
    expect(slave.coils[1]).toBe(0)
    expect(slave.coils[2]).toBe(1)
    expect(slave.coils[3]).toBe(1) // 被覆盖为 1
  })

  test('write FC16 多寄存器', async ({ page }) => {
    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    const res = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.write(id, {
          slaveId: 1, functionCode: 16, startAddress: 5, values: [111, 222, 333]
        })
      },
      { id: PANEL_ID }
    )
    expect(res.ok).toBe(true)
    expect(slave.holding[5]).toBe(111)
    expect(slave.holding[6]).toBe(222)
    expect(slave.holding[7]).toBe(333)
  })

  test('连接级错误：连不上的端口返回 ok:false 且不进入注册表', async ({ page }) => {
    // 从站已 close（用 afterEach 会关，但这里故意连一个未监听端口：用 slave.port+1 大概率未监听）
    await slave.close()
    const deadPort = slave.port // 现在已无监听

    const res = await page.evaluate(
      async ({ id, port }) => {
        return await (window as any).api.modbus.open(id, {
          variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port
        })
      },
      { id: PANEL_ID, port: deadPort }
    )
    expect(res.ok).toBe(false)
    expect(res.message).toBeTruthy()

    // 不应进入注册表
    const status = await page.evaluate(async (id) => {
      return await (window as any).api.modbus.status(id)
    }, PANEL_ID)
    expect(status).toBe('closed')
  })

  test('未连接时 read 返回错误（请求级错误不崩）', async ({ page }) => {
    const res = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.read(id, 1, 3, 0, 4)
      },
      { id: PANEL_ID }
    )
    expect(res.error).toBeTruthy()
    expect(res.values).toEqual([])
  })

  test('setPolls 轮询：onData 事件周期性到达', async ({ page }) => {
    await page.evaluate(
      async ({ id, port }) => {
        await (window as any).api.modbus.open(id, { variant: 'tcp', tcpHost: '127.0.0.1', tcpPort: port })
      },
      { id: PANEL_ID, port: slave.port }
    )

    // 在 renderer 注册 onData 回调，事件收集到 window.__modbusEvents
    await page.evaluate(async (id) => {
      ;(window as any).__modbusEvents = []
      const off = (window as any).api.modbus.onData((u: unknown) => {
        ;(window as any).__modbusEvents.push(u)
      })
      ;(window as any).__modbusOff = off

      // 配置轮询：FC3 读 4 个寄存器，每 200ms
      await (window as any).api.modbus.setPolls(id, [
        {
          id: 'block-1', slaveId: 1, functionCode: 3,
          startAddress: 0, quantity: 4,
          pollEnabled: true, pollIntervalMs: 200,
          displayFormat: 'signed',
          title: '轮询区'
        }
      ])
    }, PANEL_ID)

    // 等 3 个周期（首次立即 + 2 次 interval）
    await page.waitForTimeout(700)

    const events = await page.evaluate((id) => {
      const evs = (window as any).__modbusEvents as any[]
      return evs
        .filter((e) => e.panelId === id && e.blockId === 'block-1')
        .map((e) => ({ values: e.values, error: e.error }))
    }, PANEL_ID)

    expect(events.length).toBeGreaterThanOrEqual(2)
    // 首个非错误事件应有 4 个值 [10,20,30,40]
    const ok = events.find((e) => !e.error && e.values?.length === 4)
    expect(ok, `应至少有一个成功的轮询事件，实际: ${JSON.stringify(events)}`).toBeTruthy()
    expect(ok!.values).toEqual([10, 20, 30, 40])

    // 清理：卸载回调
    await page.evaluate(() => {
      const off = (window as any).__modbusOff
      if (typeof off === 'function') off()
    })
  })
})
