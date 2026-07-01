import { test, expect, NAV } from './fixtures'
import { startEchoServer } from './helpers/tcp-echo'

/**
 * TCP 面板收发：走真实 tcp:open/write/data IPC，连接本地 echo server。
 * 验证：新建 TCP 面板 → 连接 → 发送 → 看到 echo 回显 → 关闭。
 * 这条路径覆盖串口面板数据流主链路（store/IPC/虚拟列表渲染），是端到端核心。
 *
 * 注意：NewPanelDialog 的 Label 与 Input 是兄弟节点、无 htmlFor 关联，
 * 且 TCP 模式切换按钮必须在 dialog 作用域内点击，故所有对话框操作都限定在 dialog locator 内。
 */
test.describe('TCP 面板收发', () => {
  test('新建 TCP 面板并收发数据', async ({ page }) => {
    const echo = await startEchoServer()
    const payload = `E2E-${Date.now()}`

    // 1) 打开新建面板对话框，所有表单操作限定在 dialog 内
    await page.getByText(NAV.newPanel, { exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()

    // 2) 切 TCP 模式 + 填主机/端口
    // Label 与 Input 是兄弟节点、无 htmlFor 关联；TCP 模式下对话框内仅 2 个 input（主机/端口）
    await dialog.getByRole('button', { name: 'TCP' }).click()
    await expect(dialog.locator('label', { hasText: '主机' })).toBeVisible()
    await dialog.locator('input').nth(0).fill('127.0.0.1')
    await dialog.locator('input').nth(1).fill(String(echo.port))

    // 3) 创建
    await dialog.getByRole('button', { name: '创建' }).click()

    // 4) 侧栏面板行出现 → 点击连接开关
    await page.locator('[title="点击连接"]').click()
    await expect(page.locator('[title="点击断开"]')).toBeVisible()

    // 5) 发送数据（SendBar 输入框）
    await page.getByPlaceholder('发送内容').fill(payload)
    await page.getByRole('button', { name: '发送', exact: true }).click()

    // 6) 断言：发送内容 + echo 回显出现在数据区（DataDisplay 的虚拟行带 data-index）
    //    回显行额外带 .text-primary；用 hasText 覆盖「发送出去」与「回弹回来」两行
    await expect(page.locator('[data-index]', { hasText: payload }).first()).toBeVisible({ timeout: 15000 })

    // 7) echo server 也应收到数据
    expect(echo.received).toContain(payload)

    await echo.close()
  })

  test('断开 TCP 连接', async ({ page }) => {
    const echo = await startEchoServer()

    await page.getByText(NAV.newPanel, { exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'TCP' }).click()
    await expect(dialog.locator('label', { hasText: '主机' })).toBeVisible()
    await dialog.locator('input').nth(0).fill('127.0.0.1')
    await dialog.locator('input').nth(1).fill(String(echo.port))
    await dialog.getByRole('button', { name: '创建' }).click()

    await page.locator('[title="点击连接"]').click()
    await expect(page.locator('[title="点击断开"]')).toBeVisible()

    // 点击断开
    await page.locator('[title="点击断开"]').click()
    await expect(page.locator('[title="点击连接"]')).toBeVisible()

    await echo.close()
  })
})
