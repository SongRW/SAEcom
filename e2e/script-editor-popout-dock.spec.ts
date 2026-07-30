import { test, expect, NAV, openNavPage, clickReady, waitForWindow } from './fixtures'


/**
 * 脚本编辑器弹出/嵌回（dock）双向传图覆盖（修复问题2）。
 *
 * 回归场景：此前 graph 是 ScriptEditorDialog 的局部 useState，弹出→onClose 卸载→
 * dock 重新挂载 = 空图，导致画布空、缩略图/拖动失效。
 *
 * 两条断言覆盖双向传图：
 *  - 去程：弹出时主窗图快照带到弹窗（弹窗画布节点数与主窗一致，非空）
 *  - 回程：dock 后主窗内嵌弹层重新挂载，画布节点数不变（图被带回，不再是空图）
 *
 * 流程：打开编辑器 → 加 input-serial → 弹出 → 断言弹窗画布有该节点（去程）→
 * 不在弹窗编辑（避免重复节点定位歧义）→ dock → 断言主窗画布仍有节点（回程）。
 */
test.describe('脚本编辑器弹出/dock 双向传图', () => {
  test('dock 回主窗后画布节点不丢失', async ({ page, electronApp }) => {
    // 1) 切「脚本」→ 打开编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 2) 打开组件库 → 加一个「接收串口」节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    // 3) 弹出为独立窗
    await editor.locator('[title="弹出为独立窗口"]').click()
    const popout = await waitForWindow(electronApp, 'script-editor.html')
    const popoutEditor = popout.getByRole('dialog', { name: '脚本编辑器' })
    await expect(popoutEditor).toBeVisible()

    // 4) 去程断言：弹窗画布已带回主窗的图（1 个节点），不是空画布
    await expect(popoutEditor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    // 5) dock 回主窗
    await popoutEditor.locator('[title="回到主窗口"]').click()

    // 6) 回程断言：主窗内嵌弹层重新挂载，画布节点数应仍为 1（图被带回）。
    //    回归前此步为 0（空图），缩略图/拖动因此失效。
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })
  })
})
