import { test, expect, NAV } from './fixtures'
import { startModbusSlave } from './helpers/mock-modbus-slave'

/**
 * Modbus 面板端到端（阶段 3：连接中断检测）。
 *
 * 验证：当从站 TCP 中途掉线（slave.close 销毁所有 socket）后，面板能在若干轮询周期
 * 内反映出断开。复用 modbus-panel-basic / modbus-panel-poll 的已验证 UI 选择器与流程
 * （新建 Modbus TCP 面板 → 连接 → 新增区块 → 断言值 → kill slave → 断言断开）。
 *
 * 断开检测的三条主进程通路（见 out/main/index.js applyPolls / openModbus）：
 *  1) client 'close' 事件 → modbus:event{type:"close"} → 状态徽章转 未连接（并清掉轮询）。
 *  2) client 'error' 事件 → modbus:event{type:"error"} → 破坏性徽章（错误）。
 *  3) applyPolls 的 isOpen 守卫（每轮询 tick 检查 client.isOpen）→ modbus:data 带
 *     error:"连接已断开" → 区块表格渲染 td.text-destructive 错误行。
 *     （或对死 socket 的读 reject 进 catch → 同样产生区块级 error 行。）
 *
 * 因此用「EITHER」断言：连接徽章离开「已连接」（→ 未连接/错误）**或** 区块卡片出现
 * text-destructive 错误行。只要任一通路在 ~8s 内触发即视为检测成功。若全部不触发，
 * 说明真实 Electron 下 isOpen 既不反映 socket close、close/error 事件也未转发——那是
 * 真实 bug（BLOCKED），而非测试问题。
 *
 * 表格列序（ModbusBlockTable）：地址(1) 值(2) 格式(3) 上次更新(4) 状态(5)。
 */
test.describe('Modbus 连接中断检测', () => {
  let slave: Awaited<ReturnType<typeof startModbusSlave>>

  test.beforeEach(async () => {
    slave = await startModbusSlave()
  })

  test.afterEach(async () => {
    await slave.close()
  })

  test('从站中途掉线后面板反映断开（徽章或区块错误）', async ({ page }) => {
    // ---- 1) 新建 Modbus TCP 面板（沿用 basic/poll 的已验证流程）----
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

    // ---- 2) 连接，状态徽章转「已连接」----
    await page.getByRole('button', { name: '连接', exact: true }).click()
    await expect(page.getByText('已连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // ---- 3) 加区块：FC3 slave=1 addr=0 qty=4，启用轮询，间隔 300ms（缩短以加快检测）----
    // 草稿 input 顺序：0=标题 1=从站ID 2=起始地址 3=数量 4=轮询间隔(ms)
    await page.getByRole('button', { name: /新增区块/ }).click()
    const blockDialog = page.getByRole('dialog')
    await expect(blockDialog.getByText('新增区块', { exact: true })).toBeVisible()
    await blockDialog.locator('input').nth(3).fill('4') // 数量 = 4
    await blockDialog.locator('input').nth(4).fill('300') // 轮询间隔 = 300ms
    await blockDialog.getByRole('button', { name: '确定' }).click()
    await expect(blockDialog).toHaveCount(0)

    // 区块卡片渲染
    await expect(page.getByText('从站1 FC3', { exact: true })).toBeVisible({ timeout: 10000 })
    const blockCard = page.locator('.rounded-md.border.bg-card', { hasText: '从站1 FC3' }).first()

    // ---- 4) 确认连接曾存活：首行值列出现 holding[0]=10（首次读在加区块时立即触发）----
    const valueCells = blockCard.locator('tbody tr td:nth-child(2)')
    await expect(valueCells.nth(0)).toHaveText('10', { timeout: 10000 })

    // ---- 5) kill 从站：销毁所有 socket 并关闭 server ----
    // （slave.connections 的回落由其 socket.on('close') 异步推进，此处不直接断言；
    //   面板侧的断开反映才是被测目标，见下方 expect.poll。）
    await slave.close()

    // ---- 6) 断言面板在 ~8s 内反映出断开（任一通路触发即通过）----
    // 路径 A：连接徽章离开「已连接」→ 未连接 或 错误（破坏性徽章）。
    //         "已连接" 精确文本数量归零即代表徽章已转出 open 状态。
    // 路径 B：区块卡片出现错误行（isOpen 守卫 → 连接已断开；或死 socket 读 reject →
    //         translateModbusError；二者均渲染 td.text-destructive）。
    await expect
      .poll(
        async () => {
          const connectedCount = await page.getByText('已连接', { exact: true }).count()
          const blockErrorCount = await blockCard.locator('td.text-destructive').count()
          return connectedCount === 0 || blockErrorCount > 0
        },
        { timeout: 8000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy()
  })
})
