import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 脚本列表右键菜单：重命名 / 导出 / 删除。
 *
 * 覆盖用户可见行为：在脚本列表侧栏对脚本项右键，弹出上下文菜单，
 * 其中含「重命名」「导出」「删除」三项；点「删除」触发删除确认对话框。
 *
 * 关键回归点（曾发生 bug）：脚本编辑器全屏背景 .script-editor-backdrop 用
 * z-index:3000，而 Radix ContextMenu 默认 z-50，菜单被盖住「右键看不到菜单」。
 * 仅 toBeVisible 不够（它不检测遮挡），故用 elementFromPoint 验证菜单中心点的
 * 顶层元素确实是菜单自身，确保 z-index 提权后未被遮挡。
 *
 * 选择器来源：
 *  - 脚本项：.script-editor-list__item（ScriptList.tsx Button className）
 *  - Radix ContextMenuContent 渲染为 [role="menu"]，项为 [role="menuitem"]
 */
test.describe('脚本列表右键菜单', () => {
  test('右键脚本项弹出 重命名/导出/删除 菜单', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 先保存一个脚本，保证列表非空。首次保存弹「另存为脚本」对话框。
    await editor.getByRole('button', { name: '保存' }).click()
    const saveAsDialog = page.getByRole('dialog', { name: '另存为脚本' })
    await expect(saveAsDialog).toBeVisible()
    await saveAsDialog.getByRole('textbox').fill('ContextMenuProbe')
    await saveAsDialog.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已保存' })).toBeVisible({ timeout: 10000 })

    // 打开脚本列表侧栏（工具栏左侧「脚本页」标题按钮切换）
    await clickReady(page, editor.locator('.script-editor-toolbar__title'))

    const items = editor.locator('.script-editor-list__item')
    await expect(items.first()).toBeVisible({ timeout: 10000 })

    // 右键目标脚本项
    const target = editor.locator('.script-editor-list__item', { hasText: 'ContextMenuProbe' }).first()
    await expect(target).toBeVisible()
    await target.click({ button: 'right' })

    // Radix ContextMenuContent 挂载为 [role="menu"]，项为 [role="menuitem"]
    const menu = page.locator('[role="menu"]').first()
    await expect(menu).toBeVisible({ timeout: 5000 })
    const menuItems = menu.locator('[role="menuitem"]')
    const texts = await menuItems.allTextContents()
    expect(texts).toEqual(expect.arrayContaining(['重命名', '导出', '删除']))

    // 回归核心：菜单中心点的顶层元素必须是菜单自身，证明未被 z-index:3000 背景遮挡。
    // （toBeVisible 不检测遮挡，曾导致右键菜单「DOM 在但用户看不到」的 bug 漏测。）
    const notOccluded = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const top = document.elementFromPoint(cx, cy)
      return !!top && (el === top || el.contains(top))
    })
    expect(notOccluded, '右键菜单中心点未被遮挡（z-index 应高于脚本编辑器背景 3000）').toBe(true)

    // 点「删除」→ 触发删除确认 AlertDialog（destructive）
    await menu.locator('[role="menuitem"]', { hasText: '删除' }).click()
    const deleteDialog = page.getByRole('alertdialog')
    await expect(deleteDialog).toBeVisible({ timeout: 5000 })
    // 取消，避免真删
    await deleteDialog.getByRole('button', { name: '取消' }).click()
    await expect(deleteDialog).toHaveCount(0)
  })
})
