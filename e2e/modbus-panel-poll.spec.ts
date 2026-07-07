import { test, expect, NAV } from './fixtures'
import { startModbusSlave } from './helpers/mock-modbus-slave'

/**
 * Modbus 面板端到端（阶段 2：轮询行为）。
 *
 * 覆盖轮询的生命周期：开轮询后「上次更新」时间戳随每次轮询刷新；点工具栏
 * 「暂停所有轮询」后，主进程 applyPolls 清掉所有 setInterval，时间戳不再变化。
 *
 * 设计权衡（UI clicks vs page.evaluate）：
 *  - 新建面板 / 加区块 / 连接 / 暂停：全部走真实 UI 点击（沿用 modbus-panel-basic 的
 *    已验证选择器）。轮询的开关由 setModbusBlocks → modbus:setPolls → applyPolls 链路
 *    驱动，端到端点击才能验证这条渲染层 → store → 主进程定时器的完整通路。
 *  - 时间戳断言：读区块表格首行第 4 列（上次更新）的可见文本。timeLabel 形如
 *    "HH:mm:ss.SSS"，轮询每 ~500ms 一次，等 2 个周期以上再对比即可观察到变化。
 *
 * 表格列序（ModbusBlockTable）：地址(1) 值(2) 格式(3) 上次更新(4) 状态(5)。
 */
test.describe('Modbus 面板轮询', () => {
  let slave: Awaited<ReturnType<typeof startModbusSlave>>

  test.beforeEach(async () => {
    slave = await startModbusSlave()
  })

  test.afterEach(async () => {
    await slave.close()
  })

  test('轮询刷新上次更新时间戳，暂停后停止', async ({ page }) => {
    // ---- 1) 新建 Modbus 面板并连接（沿用 modbus-panel-basic 的已验证流程）----
    await page.getByText(NAV.newPanel, { exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Modbus', exact: true }).click()
    await expect(dialog.locator('label', { hasText: 'Modbus TCP' })).toBeVisible()
    await dialog.locator('input').nth(0).fill('127.0.0.1')
    await dialog.locator('input').nth(1).fill(String(slave.port))
    await dialog.getByRole('button', { name: '创建' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: /新增区块/ })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: '连接', exact: true }).click()
    await expect(page.getByText('已连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // ---- 2) 加区块：FC3 slave=1 addr=0 qty=4，启用轮询，间隔 500ms ----
    // 草稿 input 顺序：0=标题 1=从站ID 2=起始地址 3=数量 4=轮询间隔(ms)（默认 pollEnabled=true）
    await page.getByRole('button', { name: /新增区块/ }).click()
    const blockDialog = page.getByRole('dialog')
    await expect(blockDialog.getByText('新增区块', { exact: true })).toBeVisible()
    await blockDialog.locator('input').nth(3).fill('4') // 数量 = 4
    await blockDialog.locator('input').nth(4).fill('500') // 轮询间隔 = 500ms
    await blockDialog.getByRole('button', { name: '确定' }).click()
    await expect(blockDialog).toHaveCount(0)

    // 区块卡片渲染，表格首行第 4 列（上次更新）出现真实时间戳（非 "—"）
    const blockCard = page.locator('.rounded-md.border.bg-card', { hasText: '从站1 FC3' }).first()
    const updatedCell = blockCard.locator('tbody tr td:nth-child(4)').first()
    await expect(updatedCell).not.toHaveText('—', { timeout: 10000 })

    // ---- 3) 捕获首次时间戳，等 ≥2 个轮询周期后再次捕获，断言已变化 ----
    let ts1 = (await updatedCell.innerText()) ?? ''
    expect(ts1.trim().length).toBeGreaterThan(0)
    await page.waitForTimeout(1300) // 2+ 个 500ms 周期
    let ts2 = (await updatedCell.innerText()) ?? ''
    // 轮询在跑：时间戳应已刷新
    expect(ts2).not.toBe(ts1)

    // ---- 4) 点工具栏「暂停所有轮询」：applyPolls 清掉所有定时器 ----
    await page.getByRole('button', { name: /暂停所有轮询/ }).click()

    // 暂停后捕获时间戳，等 ~1.5s（足够跑 3 个周期却没有变化），断言不再变
    ts1 = (await updatedCell.innerText()) ?? ''
    await page.waitForTimeout(1500)
    ts2 = (await updatedCell.innerText()) ?? ''
    expect(ts2).toBe(ts1)

    // ---- 5) 断开，状态回落（与 basic spec 对称）----
    await page.getByRole('button', { name: '断开', exact: true }).click()
    await expect(page.getByText('未连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })
  })
})
