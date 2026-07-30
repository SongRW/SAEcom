import { test, expect, openNewPanelDialog, clickReady, confirmNewPanelDialog, expectDialogClosed } from './fixtures'

import { startEchoServer } from './helpers/tcp-echo'

/**
 * 串口面板列表点击 toggle（修复问题5）。
 *
 * 回归场景：此前 PaneList.handleToggle 只 setHidden(false)（只显示），「点一下显示、
 * 再点一下取消显示」的旧交互丢失。修复后：已显示的面板点击列表项 → 隐藏；已隐藏 → 显示。
 *
 * 用 TCP echo 面板（避免依赖真实串口）。新建 TCP 面板的表单交互与 tcp-panel.spec.ts 一致。
 * 默认已在「串口」页，无需再点页签。
 */
test.describe('面板列表点击 toggle 显示/隐藏', () => {
  test('点击列表项在显示/隐藏间切换', async ({ page }) => {
    const echo = await startEchoServer()
    try {
      // 1) 打开新建面板对话框 → 建 TCP 面板（默认已在串口页）
      const dialog = await openNewPanelDialog(page)
      await clickReady(page, dialog.getByRole('button', { name: 'TCP' }))
      await dialog.locator('input').nth(0).fill('127.0.0.1')
      await dialog.locator('input').nth(1).fill(String(echo.port))
      await confirmNewPanelDialog(page, dialog)

      // 2) 浮动面板（FloatingPane）出现。标题栏带 data-pane-header-drag 标识。
      const floatingPane = page.locator('[data-pane-header-drag]').first()
      await expect(floatingPane).toBeVisible({ timeout: 10000 })

      // 3) 点击侧栏列表项（面板名按钮，title 含「双击重命名」）→ 浮动面板应隐藏
      // 名称按钮在 draggable 行内：Playwright 指针序列/force 偶发不触发 onClick，原生 DOM click 最稳
      const listItem = page.locator('[title*="双击重命名"]').first()
      await listItem.evaluate((el: HTMLElement) => el.click())
      await expect(floatingPane).toBeHidden({ timeout: 5000 })

      // 4) 再点击同一列表项 → 浮动面板应重新出现
      await listItem.evaluate((el: HTMLElement) => el.click())
      await expect(floatingPane).toBeVisible({ timeout: 5000 })
    } finally {
      await echo.close()
    }
  })

  test('长备注不挤出右侧操作按钮', async ({ page }) => {
    const echo = await startEchoServer()
    const longNote = '超长面板备注名称确保操作按钮可'

    try {
      const dialog = await openNewPanelDialog(page)
      await clickReady(page, dialog.getByRole('button', { name: 'TCP' }))
      await dialog.locator('input').nth(0).fill('127.0.0.1')
      await dialog.locator('input').nth(1).fill(String(echo.port))
      await confirmNewPanelDialog(page, dialog)

      const listItem = page.locator('[title*="双击重命名"]').first()
      await expect(listItem).toBeVisible()
      // 行容器是带 group 的 draggable div；双击名称打开备注（比 hover 后点铅笔更稳）
      await listItem.dblclick()
      const prompt = page.getByRole('dialog').filter({ hasText: '备注' })
      await expect(prompt).toBeVisible({ timeout: 10000 })
      await prompt.locator('input').fill(longNote)
      await prompt.getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())
      await expectDialogClosed(page)

      const renamedItem = page.getByTitle(`${longNote}（双击重命名）`)
      await expect(renamedItem).toBeVisible()
      const renamedRow = renamedItem.locator('xpath=ancestor::div[contains(@class,"group")][1]')
      await renamedItem.hover({ force: true })

      const sidebar = page.locator('[data-slot="sidebar-container"]')
      const sidebarBox = await sidebar.boundingBox()
      expect(sidebarBox).toBeTruthy()

      for (const title of ['添加备注', '清空数据', '删除面板']) {
        const action = renamedRow.getByTitle(title)
        await expect(action).toBeVisible()
        const actionBox = await action.boundingBox()
        expect(actionBox).toBeTruthy()
        expect(actionBox!.x).toBeGreaterThanOrEqual(sidebarBox!.x)
        expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(sidebarBox!.x + sidebarBox!.width)
      }
    } finally {
      await echo.close()
    }
  })
})
