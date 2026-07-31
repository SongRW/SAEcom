import { test, expect, NAV, openNavPage, clickReady, expectDialogClosed } from './fixtures'

/**
 * 回归：关闭脚本编辑器后重开，编辑态应完全清空（Bug 1）。
 *
 * 此前有两个叠加问题：
 *  1. ScriptEditorDialog 在主窗内嵌模式下 open=false 时仅 return null，
 *     组件本身不卸载（BottomNav 始终挂载它），所有 useState（graph/legacyCode/
 *     zoom/uiState/activeScriptName）全部保留 → 重开时仍显示上次脚本。
 *     修复：false→true 边沿（且非 popout 去程、无 dock 回灌）时重置编辑态。
 *  2. dev 模式 React.StrictMode 双 mount + Rete area.destroy() 不移除 holder DOM，
 *     导致重开时旧脚本的节点作为残影印在新画布背景里（放大缩小过的图尤甚）。
 *     修复：GraphCanvas mount 前清掉容器内残留的 Rete holder。
 *
 * 本测试复现用户精确路径：打开多节点脚本 → 放大缩小 → 关闭 → 重开 → 应为空。
 * 注意：E2E 默认跑 prod（StrictMode 双 mount 被禁用），第 2 点在 prod 不可见，
 * 但本测试的断言同时覆盖两点的期望结果（重开=空），保留作为回归门槛。
 */
test.describe('脚本编辑器重开重置（Bug 1）', () => {
  test('打开脚本+放大缩小→关闭→重开，画布回到空状态', async ({ page }) => {
    test.setTimeout(120000)
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    let editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 1) 打开一个多节点脚本（触发 fit 低缩放 + 大平移量）
    await clickReady(page, editor.locator('[title="脚本"]'))
    await clickReady(page, editor.getByRole('button', { name: '复杂协议v2-可视化.js', exact: true }))
    await expect(editor.locator('[data-testid="node"]').first()).toBeVisible({ timeout: 15000 })

    // 2) 放大缩小几轮（用户关键操作：改变 area transform）
    const zoomIn = editor.locator('button[title="放大"]')
    const zoomOut = editor.locator('button[title="缩小"]')
    for (let i = 0; i < 4; i++) await clickReady(page, zoomIn)
    await page.waitForTimeout(400)
    for (let i = 0; i < 4; i++) await clickReady(page, zoomOut)
    await page.waitForTimeout(400)

    // 3) 关闭编辑器
    await clickReady(page, editor.locator('button[title="关闭"]'))
    await expectDialogClosed(page, '脚本编辑器')

    // 4) 重新打开
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 5) 回归断言：画布回到空（0 节点 + 无 Rete 残影 holder）、zoom 回 100%、无活动脚本名
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(0, { timeout: 10000 })
    // 残影 holder 不带 data-testid，但带 data-node-id；应一并被清掉
    await expect(editor.locator('.script-editor-canvas__surface [data-node-id]')).toHaveCount(0)
    await expect(editor.locator('.script-editor-canvas__empty')).toBeVisible()
    await expect(editor.locator('.script-editor-canvas__hud')).toContainText('100%')
    await expect(editor.locator('.script-editor-current')).toContainText('未选中')
  })
})
