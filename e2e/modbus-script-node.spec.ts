import { test, expect } from './fixtures'
import { startModbusSlave } from './helpers/mock-modbus-slave'

/**
 * Modbus script-node 沙箱函数 E2E（阶段 4：modbusRead / modbusWrite）。
 *
 * 阶段 4 在脚本 vm 沙箱里暴露了 modbusRead(panelId, fc, slaveId, addr, qty) 与
 * modbusWrite(panelId, fc, slaveId, addr, values)，二者分别调用主进程 modbusService 的
 * readOnce / writeOnce，操作的目标是 modbusClients 注册表里已 open 的连接。
 *
 * 本测试不驱动 Rete 画布（通过点击/连线增删节点极其脆弱），而是直接跑「节点 codegen
 * 会生成的那段 JS」——`window.api.scripts.run(code, { id })`——把脚本丢进真实 vm 沙箱，
 * 让沙箱里的 modbusRead 经 preload→ipcMain→modbusService→modbus-serial client 连到本地
 * mock 从站，端到端验证沙箱函数本身正确工作（这才是阶段 4 真正有价值的被测对象）。
 *
 * ── 关于 scripts.run 的时序（关键 gotcha）────────────────────────────
 * 主进程 `scripts:run` 处理器把脚本体放进一个 detached async IIFE 里执行，并立即返回
 * `{ ok, runId }`——也就是说 await window.api.scripts.run() 在脚本真正跑完之前就 resolve
 * 了。若用 onLog 在 run() 之后才开始收集日志，存在「run 已 resolve 但 onLog 事件尚未到达」
 * 的竞态。因此这里改用 onEnded：它在脚本结束后才触发，payload 里直接带上完整 logs 数组，
 * 且含 runId 便于按本次运行精确匹配。订阅在调用 run 之前注册，彻底避免丢事件。
 * ─────────────────────────────────────────────────────────────────────
 */
const PANEL_ID = 'script-test-panel'

/**
 * 在 renderer 侧跑一段脚本并等它结束，返回 { ok, error?, logs }。
 *
 * 订阅 onEnded → 调 scripts.run 拿 runId → 等待 runId 匹配的 ended 事件（带超时兜底）。
 * 全程在一个 page.evaluate 内完成，保证「先订阅、再 run」的顺序，规避事件竞态。
 */
async function runScript(
  page: import('@playwright/test').Page,
  code: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  return page.evaluate(async ({ src, panelId }) => {
    const api = (window as any).api
    let resolveEnded!: (v: any) => void
    let rejectEnded!: (e: any) => void
    const ended = new Promise<any>((res, rej) => {
      resolveEnded = res
      rejectEnded = rej
    })
    // 先订阅：ended 事件在脚本结束后才发，但订阅必须在 run 之前就绪
    const off = api.scripts.onEnded((p: any) => resolveEnded(p))
    const runRes = await api.scripts.run(src, { id: panelId })
    if (!runRes?.ok) {
      off()
      throw new Error('scripts.run 启动失败: ' + JSON.stringify(runRes))
    }
    const runId = runRes.runId
    // 超时兜底（modbus 读本身有 2s 超时，整体留足余量）
    const timer = setTimeout(() => rejectEnded(new Error('脚本超时未结束')), 20000)
    // 按本次 runId 等待结束事件（本用例每次 evaluate 只跑一个脚本，首个 ended 即为本次）
    const payload = await ended
    clearTimeout(timer)
    off()
    if (payload?.runId !== runId) {
      throw new Error(`runId 不匹配: 期望 ${runId} 实际 ${payload?.runId}`)
    }
    return { ok: !!payload?.ok, error: payload?.error, logs: payload?.logs ?? [] }
  }, { src: code, panelId: PANEL_ID })
}

test.describe('Modbus 脚本节点沙箱函数（modbusRead / modbusWrite）', () => {
  let slave: Awaited<ReturnType<typeof startModbusSlave>>

  test.beforeEach(async () => {
    slave = await startModbusSlave()
  })

  test.afterEach(async () => {
    await slave.close()
  })

  test('modbusRead：脚本读 FC3 保持寄存器，返回 holding 区初值', async ({ page }) => {
    // 1) 在 app 内 open 一个 Modbus TCP 连接（注册到 modbusClients）
    await page.evaluate(
      async ({ port, panelId }) => {
        await (window as any).api.modbus.open(panelId, {
          variant: 'tcp',
          tcpHost: '127.0.0.1',
          tcpPort: port
        })
      },
      { port: slave.port, panelId: PANEL_ID }
    )

    // 2) 跑「modbus-read 节点 codegen 会生成的那段」+ console.log
    //    模拟：var _out_read = await modbusRead(panelId, 3, 1, 0, 4); console.log(...)
    const code =
      'var _out_read = await modbusRead(' +
      JSON.stringify(PANEL_ID) +
      ', 3, 1, 0, 4); console.log("regs=" + JSON.stringify(_out_read));'

    const res = await runScript(page, code)

    // 3) 脚本应正常结束（无 error）
    expect(res.ok, `脚本应以 ok 结束，error=${res.error}`).toBe(true)

    // 4) 日志应含寄存器值：holding[0..3] = [10,20,30,40]（mock 从站初值 (i+1)*10）
    const regLine = res.logs.find((l) => l.startsWith('regs='))
    expect(regLine, `日志应含 regs= 行，实际 logs=${JSON.stringify(res.logs)}`).toBeTruthy()
    expect(regLine).toContain('[10,20,30,40]')

    // 5) 交叉校验：从站确实收到过读事务
    expect(slave.transactions).toBeGreaterThanOrEqual(1)
  })

  test('modbusWrite + 回读：脚本写 FC16 多寄存器后再读校验', async ({ page }) => {
    await page.evaluate(
      async ({ port, panelId }) => {
        await (window as any).api.modbus.open(panelId, {
          variant: 'tcp',
          tcpHost: '127.0.0.1',
          tcpPort: port
        })
      },
      { port: slave.port, panelId: PANEL_ID }
    )

    // 写 addr=10 起 3 个寄存器，随即读回同一区校验
    const code =
      'await modbusWrite(' +
      JSON.stringify(PANEL_ID) +
      ', 16, 1, 10, [111,222,333]);' +
      'var _out_read = await modbusRead(' +
      JSON.stringify(PANEL_ID) +
      ', 3, 1, 10, 3);' +
      'console.log("back=" + JSON.stringify(_out_read));'

    const res = await runScript(page, code)
    expect(res.ok, `脚本应以 ok 结束，error=${res.error}`).toBe(true)

    const backLine = res.logs.find((l) => l.startsWith('back='))
    expect(backLine, `日志应含 back= 行，实际 logs=${JSON.stringify(res.logs)}`).toBeTruthy()
    expect(backLine).toContain('[111,222,333]')

    // 交叉校验：从站 holding 区确被写入
    expect(slave.holding[10]).toBe(111)
    expect(slave.holding[11]).toBe(222)
    expect(slave.holding[12]).toBe(333)
  })
})
