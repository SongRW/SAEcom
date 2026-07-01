import { test, expect, waitForWindow, NAV } from './fixtures'

/**
 * 启动冒烟 + 多窗口。
 * 验证：主窗口能渲染（env 钩子让 prod 分支生效、renderer 产物加载正常），
 * 以及关于/更新日志独立窗口能通过 IPC 打开并被 Playwright 捕获。
 */
test.describe('启动冒烟 + 多窗口', () => {
  test('主窗口渲染：品牌块 + 侧栏页签可见', async ({ page, electronApp }) => {
    // 品牌方块 "S"
    await expect(page.locator('span.rounded-md', { hasText: 'S' })).toBeVisible()

    // 侧栏底部三个页签
    for (const label of [NAV.pageSerial, NAV.pageCommands, NAV.pageScript]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }

    // 底部「关于」「设置」菜单项
    await expect(page.getByText(NAV.about, { exact: true }).first()).toBeVisible()

    // 窗口标题应已设置（TitleBarChrome 用 document.title）
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('打开关于窗（独立 Electron 窗口）', async ({ page, electronApp }) => {
    const before = electronApp.windows().length
    await page.getByText(NAV.about, { exact: true }).first().click()

    // 新窗口出现
    await waitForWindow(electronApp, 'about.html')
    expect(electronApp.windows().length).toBe(before + 1)

    const aboutWin = await waitForWindow(electronApp, 'about.html')
    await expect(aboutWin.locator('.brand-title')).toHaveText('SAEcom')
    await expect(aboutWin.locator('.brand-version')).toContainText('Ver.')
  })

  test('打开更新日志窗（从关于窗触发）', async ({ page, electronApp }) => {
    // 先打开关于窗
    await page.getByText(NAV.about, { exact: true }).first().click()
    const aboutWin = await waitForWindow(electronApp, 'about.html')

    const before = electronApp.windows().length
    // 关于窗内的「更新日志」按钮
    await aboutWin.getByText(/更新日志/).click()

    // changelog 窗出现并加载完成
    const changelogWin = await waitForWindow(electronApp, 'changelog.html')
    expect(electronApp.windows().length).toBe(before + 1)
    await expect(changelogWin.locator('.changelog-content.loaded')).toBeVisible()
  })
})
