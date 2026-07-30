import { test, expect, clickReady, createModbusTcpPanel } from './fixtures'
import { startModbusSlave } from './helpers/mock-modbus-slave'

/**
 * Modbus 面板端到端（阶段 2：面板 UI）。
 *
 * 覆盖用户从 0 到 1 的主链路：NewPanelDialog 选 Modbus → 创建面板 → 连接（连接栏
 * 按钮）→ 状态徽章转「已连接」→ 手动读寄存器（window.api.modbus.read）→ 用
 * 「新增区块」对话框加一块并验证表格渲染值 → 断开后状态转「未连接」。
 *
 * 设计权衡（UI clicks vs page.evaluate）：
 *  - 创建面板、加区块、连接/断开：全部走真实 UI 点击。这是 Phase 2 面板 UI 的新
 *    增量，必须端到端验证渲染层；选 串口页 → 新建面板 → Modbus → 填表 → 创建 走
 *    NewPanelDialog，区块走 ModbusPanelBody 的 新增区块 Dialog。
 *  - 手动读：用 page.evaluate 直接调 window.api.modbus.read。理由：手动读写抽屉
 *    (ModbusManualDrawer) 里有多个 Select + Input + 模式切换，逐项点击既慢又脆；
 *    而连接本身已由 UI 点击验证（连接栏 连接 按钮），读通路走 IPC 直调既能稳定断言
 *    [10,20,30,40]，又不重复测 Drawer 的表单（那属于 Drawer 自身的测试范畴）。
 *
 * 断开后状态：modbus 主进程的 modbusService 没有 socket-error 自动降级（设计如此，
 * 见 useModbusDataBus 注释——状态由事件驱动），因此用「断开」按钮触发 close 事件，
 * 而非期望从站掉线自动改状态。
 */
test.describe('Modbus 面板基础流程', () => {
  let slave: Awaited<ReturnType<typeof startModbusSlave>>

  test.beforeEach(async () => {
    slave = await startModbusSlave()
  })

  test.afterEach(async () => {
    await slave.close()
  })

  test('新建 Modbus 面板 → 连接 → 手动读 → 加区块 → 断开', async ({ page }) => {
    // ---- 1-4) 新建 Modbus TCP 面板（统一 helper：DOM 创建 + 侧栏/工具栏锚点）----
    await createModbusTcpPanel(page, slave.port)
    await expect(page.getByRole('button', { name: /全部刷新/ })).toBeVisible({ timeout: 10000 })

    // ---- 5) 点击「连接」按钮（连接栏，未连接时文案=连接）----
    await clickReady(page, page.getByRole('button', { name: '连接', exact: true }))

    // 状态徽章转「已连接」；连接是真实 TCP，留足时间。
    // 状态徽章文本可能被 Radix 渲染成嵌套 span（外层/内层各含文案），用 first() 去重。
    await expect(page.getByText('已连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    // 从站应收到一个客户端连接
    expect(slave.connections).toBeGreaterThanOrEqual(1)

    // ---- 6) 手动读 FC3 保持寄存器：mock 从站 holding[i] = (i+1)*10 → [10,20,30,40] ----
    // 走 IPC 直调（见文件头注释），panelId 从 NewPanelDialog 的命名规则推导：
    // id = `modbus://tcp/<host>:<port>`。
    const panelId = `modbus://tcp/127.0.0.1:${slave.port}`
    const readRes = await page.evaluate(
      async ({ id }) => {
        return await (window as any).api.modbus.read(id, 1, 3, 0, 4)
      },
      { id: panelId }
    )
    expect(readRes.error).toBeUndefined()
    expect(readRes.values).toEqual([10, 20, 30, 40])

    // ---- 7) 加一个区块（UI 对话框）并验证表格渲染值 ----
    await page.getByRole('button', { name: /新增区块/ }).click()
    const blockDialog = page.getByRole('dialog')
    await expect(blockDialog).toBeVisible()
    await expect(blockDialog.getByText('新增区块', { exact: true })).toBeVisible()

    // 草稿默认值：slaveId=1, FC=3(保持寄存器), 起始=0, 数量=1, 格式=unsigned。
    // 把数量改成 4，以读取 [10,20,30,40]。表单内 input 顺序：
    //   0=标题, 1=从站ID, 2=起始地址, 3=数量, 4=轮询间隔(ms)
    //   (功能码/显示格式是 Select，不是 input)
    await blockDialog.locator('input').nth(3).fill('4')

    // 确认新增（对话框底部 确定 按钮，区别于 NewPanelDialog 的 创建）
    await blockDialog.getByRole('button', { name: '确定' }).click()
    await expect(blockDialog).toHaveCount(0)

    // 区块卡片标题默认为「从站1 FC3」，子标题含参数
    await expect(page.getByText('从站1 FC3', { exact: true })).toBeVisible({ timeout: 10000 })

    // 轮询默认开启（pollIntervalMs=1000），但首次读立即触发。表格列序：
    // 地址(1) 值(2) 格式(3) 上次更新(4) 状态(5)，值列在第 2 列。断言 4 行 = [10,20,30,40]
    // （unsigned 原样）。区块卡片作用域内定位值单元格，避免误中地址列（地址同样 font-mono）。
    const blockCard = page.locator('.rounded-md.border.bg-card', { hasText: '从站1 FC3' }).first()
    const valueCells = blockCard.locator('tbody tr td:nth-child(2)')
    await expect(valueCells.nth(0)).toHaveText('10', { timeout: 10000 })
    await expect(valueCells.nth(1)).toHaveText('20', { timeout: 10000 })
    await expect(valueCells.nth(2)).toHaveText('30', { timeout: 10000 })
    await expect(valueCells.nth(3)).toHaveText('40', { timeout: 10000 })

    // ---- 8) 断开连接：连接栏按钮文案已变为「断开」----
    await page.getByRole('button', { name: '断开', exact: true }).click()
    // close 事件由主进程广播 → useModbusDataBus 把状态置回 closed / open=false
    await expect(page.getByText('未连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // 断开后从站连接数回落
    expect(slave.connections).toBeLessThanOrEqual(0)
  })
})
