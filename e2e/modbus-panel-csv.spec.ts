import { test, expect, clickReady, createModbusTcpPanel } from './fixtures'
import { startModbusSlave } from './helpers/mock-modbus-slave'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Modbus 面板端到端（阶段 2：CSV 映射导入/导出）。
 *
 * 覆盖 ModbusPanelBody 工具栏的「导入映射」/「导出映射」两条链路：
 *  - 导入：隐藏 <input type="file"> + FileReader.readAsText → parseBlocksCsv →
 *    setModbusBlocks 追加区块。用 Playwright setInputFiles 喂真实 CSV 文件，
 *    断言区块标题出现 + 区块卡片计数增长 + 成功 toast。
 *  - 导出：serializeBlocksCsv → ipc.panel.saveLog → 主进程 dialog.showSaveDialog +
 *    fs.writeFileSync。必须 mock showSaveDialog（否则 OS 模态阻塞测试），mock 成写入
 *    临时文件，再从 Node fs 读回断言内容。
 *
 * 设计权衡：
 *  - 区块来源：先通过 UI「新增区块」加 2 个具名区块，再导入 2 个，导出时验证四者齐全。
 *    这样导入（setInputFiles）和导出（mock 对话框）两条独立路径都被真实端到端走一遍。
 *  - 渲染层只关心唯一的 file input（全应用仅此一个，见 ModbusPanelBody），故
 *    page.locator('input[type="file"]') 选择器足够特异。
 */
test.describe('Modbus 面板 CSV 映射导入/导出', () => {
  let slave: Awaited<ReturnType<typeof startModbusSlave>>

  test.beforeEach(async () => {
    slave = await startModbusSlave()
  })

  test.afterEach(async () => {
    await slave.close()
  })

  test('导入映射追加区块，导出映射写出完整 CSV', async ({ page, electronApp }) => {
    // ---- 1) 新建 Modbus 面板并连接 ----
    await createModbusTcpPanel(page, slave.port)

    await clickReady(page, page.getByRole('button', { name: '连接', exact: true }))
    await expect(page.getByText('已连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })

    // 区块卡片计数锚点：每个区块 = ModbusBlockTable(Collapsible, 类名 .rounded-md.border.bg-card)，
    // 是区块滚动容器（flex-1.overflow-auto）的直接子节点。限定为直接子节点以排除页面其它
    // 同类名 chrome（如抽屉/对话框）造成的误匹配。
    const blockCards = page.locator('.flex-1.overflow-auto > .rounded-md.border.bg-card')

    // ---- 2) 通过 UI 加 2 个具名区块：温度区(FC3, 默认功能码无需改) + 阀门(FC1) ----
    // 草稿 input 顺序：0=标题 1=从站ID 2=起始地址 3=数量 4=轮询间隔(ms)
    // 温度区用默认 FC3，只填标题+数量；阀门切到 FC1(线圈)，覆盖导出时不同的 functionCode。
    await page.getByRole('button', { name: /新增区块/ }).click()
    {
      const bd = page.getByRole('dialog')
      await expect(bd.getByText('新增区块', { exact: true })).toBeVisible()
      await bd.locator('input').nth(0).fill('温度区') // 标题
      await bd.locator('input').nth(3).fill('4') // 数量
      await bd.getByRole('button', { name: '确定' }).click()
      await expect(bd).toHaveCount(0)
    }
    await expect(page.getByText('温度区', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(blockCards).toHaveCount(1)

    await page.getByRole('button', { name: /新增区块/ }).click()
    {
      const bd = page.getByRole('dialog')
      await expect(bd.getByText('新增区块', { exact: true })).toBeVisible()
      await bd.locator('input').nth(0).fill('阀门') // 标题
      await bd.locator('input').nth(3).fill('2') // 数量
      // 功能码 Select（Radix Trigger 渲染为 button[role=combobox]，第一个=功能码）：
      // 点开 → 选项「线圈」(FC1)。功能码不同可让导出 CSV 覆盖多 FC。
      await bd.getByRole('combobox').first().click()
      await page.getByRole('option', { name: '线圈', exact: true }).click()
      await bd.getByRole('button', { name: '确定' }).click()
      await expect(bd).toHaveCount(0)
    }
    await expect(page.getByText('阀门', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(blockCards).toHaveCount(2)

    // ---- 3) 写一份示例 CSV 到临时文件，供导入 ----
    // 列序与 serializeBlocksCsv 的 HEADER 对齐。
    const sampleCsv =
      'title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat\n' +
      '导入A,1,3,0,4,true,500,signed\n' +
      '导入B,2,4,10,2,false,1000,unsigned\n'
    const importPath = join(tmpdir(), 'modbus-map-import.csv')
    writeFileSync(importPath, sampleCsv, 'utf-8')

    // ---- 4) 导入：点「导入映射」触发隐藏 file input，setInputFiles 喂文件 ----
    await page.getByRole('button', { name: /导入映射/ }).click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(importPath)

    // 成功 toast + 两个导入区块标题出现 + 卡片计数 +2
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已导入 2 个区块' })).toBeVisible({
      timeout: 10000
    })
    await expect(page.getByText('导入A', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('导入B', { exact: true })).toBeVisible({ timeout: 10000 })
    await expect(blockCards).toHaveCount(4)

    // ---- 5) 导出：mock showSaveDialog 写入临时文件，点「导出映射」----
    const exportPath = join(tmpdir(), 'modbus-map-test.csv')
    await electronApp.evaluate(async ({ dialog }, path) => {
      ;(dialog as unknown as {
        showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }>
      }).showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, exportPath)

    await page.getByRole('button', { name: /导出映射/ }).click()

    // 文件被写出，读回断言内容：表头 + 4 个区块行（2 UI 建的 + 2 导入的）
    await expect.poll(async () => existsSync(exportPath), { timeout: 10000 }).toBeTruthy()
    const exported = readFileSync(exportPath, 'utf-8')
    expect(exported).toContain('title,slaveId,functionCode,startAddress,quantity,pollEnabled,pollIntervalMs,displayFormat')
    expect(exported).toContain('温度区')
    expect(exported).toContain('阀门')
    expect(exported).toContain('导入A,1,3,0,4,true,500,signed')
    expect(exported).toContain('导入B,2,4,10,2,false,1000,unsigned')

    // ---- 6) 断开，状态回落 ----
    await page.getByRole('button', { name: '断开', exact: true }).click()
    await expect(page.getByText('未连接', { exact: true }).first()).toBeVisible({ timeout: 10000 })
  })
})
