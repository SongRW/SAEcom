import { test, expect, NAV } from './fixtures'

/**
 * 脚本编辑器画布：覆盖最复杂的 Rete 交互。
 * 流程：切「脚本」→ 打开编辑器 → 从组件库加节点到画布 → 断言节点出现。
 *
 * NodePalette 的节点模板点击即添加（onAddNode），无需拖拽。
 * 画布节点由 Rete 渲染，带 data-testid="node" + data-node-id。
 */
test.describe('脚本编辑器画布', () => {
  test('打开编辑器并添加节点到画布', async ({ page }) => {
    // 1) 切到「脚本」页 → 打开脚本编辑器
    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 2) 打开组件库（Rail 的「组件」按钮）
    await editor.getByRole('button', { name: '组件' }).click()

    // 3) 点击「接收串口」节点模板 → 添加到画布
    await editor.locator('[data-node-key="input-serial"]').click()

    // 4) 断言：画布出现节点（Rete 节点带 data-testid="node"）
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })
  })

  test('编辑器最小化与还原', async ({ page }) => {
    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 工具栏「最小化」→ 出现最小化条
    await editor.locator('[title="最小化"]').click()
    const minimizedBar = page.locator('.script-editor-minimized-bar')
    await expect(minimizedBar).toBeVisible()

    // 点击还原（最小化条本身就是还原按钮）
    await minimizedBar.click()
    await expect(editor).toBeVisible()
  })
})
