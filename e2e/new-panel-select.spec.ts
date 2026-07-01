import { test, expect, NAV } from './fixtures'

/**
 * 回归：「新建面板」弹窗内点开 Select 下拉后，点击框内别处，Dialog 不应被关闭。
 *
 * 根因：模态 Dialog 与内嵌 Select 都开启 disableOutsidePointerEvents，二者在同一个
 * DismissableLayer 上下文里按注册顺序比较层级。Select 后打开成为最高层，导致 Dialog
 * content 的 isPointerEventsEnabled 变 false，被 dismissable-layer 内联设成
 * pointer-events:none。于是下拉打开后 Dialog 整个面板不可点击，点击穿透到下面的
 * dialog-overlay（全屏遮罩），触发模态框「点遮罩关闭」→ Dialog 被关。
 * 修复：DialogContent 强制内联 pointer-events:auto，覆盖 dismissable-layer 的 none。
 *
 * 注：用 page.mouse.click 坐标点击模拟真实鼠标（Radix 打开下拉时会用 actionability
 * 不友好的 focus/scroll-lock，元素级 .click() 会误判超时；坐标点击贴近真实用户）。
 */
test.describe('新建面板 Select 下拉与 Dialog 误关闭', () => {
  test('下拉打开后点框内别处，Dialog 不应关闭', async ({ page }) => {
    await page.getByText(NAV.newPanel, { exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    const dlgEl = page.locator('[data-slot="dialog-content"]')
    const listbox = page.getByRole('listbox')

    // 打开波特率下拉
    await dialog.getByRole('combobox').nth(1).click()
    await expect(listbox).toBeVisible()

    // 取「新建面板」标题中心坐标，作为「框内别处」的点击点（标题在 dialog 顶部，
    // 绝不被 listbox 遮挡；若 Dialog 被设 pointer-events:none，点击会穿透到 overlay 关闭）
    const heading = page.locator('[data-slot="dialog-content"] h2')
    const box = await heading.boundingBox()
    expect(box).toBeTruthy()

    // 真实鼠标坐标点击标题
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.waitForTimeout(500)

    // 核心：Dialog 仍在，下拉已收起
    await expect(dlgEl).toHaveCount(1)
    await expect(listbox).toHaveCount(0)
  })
})
