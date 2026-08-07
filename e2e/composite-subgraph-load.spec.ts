/**
 * 组合组件子图加载回归：
 * 打开已有组合组件（含 subgraph）时，编辑器应自动切到 compose 模式，
 * 子画布渲染 descriptor.subgraph 里定义的节点（此前画布空白——
 * implMode 初始 'emit' + 子图从未从 descriptor 加载）。
 */
import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

test.describe('组合组件子图加载', () => {
  test('打开组合组件 → compose 画布显示 descriptor 里的节点', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await page.waitForTimeout(3000)

    // 打开自定义面板，点开「编码转换链」（descriptor 含 2 个节点的组合组件）
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await page.waitForTimeout(2000)
    const item = editor.locator('.script-editor-custom-panel__item').filter({ hasText: '编码转换链' }).first()
    await item.waitFor({ timeout: 10000 })
    await item.click()
    await page.waitForTimeout(4000)

    // compose 画布应可见（implMode 切到 compose，而非 emit 的代码编辑器）
    await expect(editor.locator('[data-testid="cc-compose-pane"]')).toBeVisible()

    // 子画布应渲染 descriptor.subgraph.nodes 定义的节点（编码转换链有 2 个）
    const nodes = editor.locator('[data-testid="cc-compose-pane"] [data-testid="node"]')
    const count = await nodes.count()
    expect(count, '组合组件子画布应显示 descriptor 里的节点（≥1）').toBeGreaterThanOrEqual(1)
  })

  test('打开 JS 组件 → 显示代码编辑器（emit 模式），非 compose 画布', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await page.waitForTimeout(3000)
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await page.waitForTimeout(2000)
    await editor.locator('.script-editor-custom-panel__item').filter({ hasText: '转时间' }).first().click()
    await page.waitForTimeout(3000)

    // JS 组件应显示代码编辑器（emit 模式），compose 画布不渲染
    await expect(editor.locator('[data-testid="cc-compose-pane"]')).toHaveCount(0)
    await expect(editor.locator('.monaco-editor')).toBeVisible()
  })
})
