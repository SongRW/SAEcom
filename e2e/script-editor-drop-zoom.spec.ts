import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 回归：被 fit 过（带大平移量）的画布上拖入组件，落点应正确（Bug 2）。
 *
 * 根因：GraphCanvas.onDrop 把屏幕坐标换算成世界坐标时只除了 zoom，
 * 漏减 Rete area 的平移量（transform.x/y）。复杂脚本 fit 到低缩放时
 * transform 很大（把大世界包围盒居中），之后即使手动放大到 100%，
 * transform 仍保留 → 拖入落点严重偏移（甚至飞出可见区）。
 *
 * 修复：world = (screen - canvasOrigin - transform) / zoom。
 *
 * 复现策略：建一张足够大的图触发 fit 平移 → 放大到 100%（平移不归零）→
 * 从组件库 HTML5 拖拽到画布中心 → 断言新节点 bbox 与拖放落点（画布中心）
 * 重叠，而非飞到画布外。
 */
test.describe('带平移的画布拖入落点（Bug 2）', () => {
  test('fit 后放大到 100%，拖入节点落在落点附近', async ({ page }) => {
    test.setTimeout(120000)
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 1) 加多个节点拉宽画布，制造非零 transform（fit 会把包围盒居中 → 平移量变大）。
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    for (let i = 0; i < 4; i++) {
      await clickReady(page, editor.locator('[data-node-key="input-serial"]').first())
      await expect(editor.locator('[data-testid="node"]')).toHaveCount(i + 1, { timeout: 10000 })
    }

    // 2) 放大到 100% 附近：fit 后 zoom 偏小，点几次放大拉到 ≥100%。
    //    关键：zoom() 不传锚点 → transform.x/y 保持，只 k 变大（这正是用户场景）。
    const zoomIn = editor.locator('button[title="放大"]')
    for (let i = 0; i < 8; i++) await clickReady(page, zoomIn)
    // 确认 HUD 显示已放大到 ≥100%（即用户描述的「拉到 100%」状态，且 transform 仍在）
    await expect(editor.locator('.script-editor-canvas__hud')).toContainText(/100%|[1-9]\d\d%/)

    const beforeCount = await editor.locator('[data-testid="node"]').count()

    // 3) 读画布元素 bbox + 中心点，作为 HTML5 drop 的目标屏幕坐标。
    const canvasBox = await editor.locator('.script-editor-canvas').boundingBox()
    expect(canvasBox).toBeTruthy()
    if (!canvasBox) return
    const dropX = canvasBox.x + canvasBox.width * 0.5
    const dropY = canvasBox.y + canvasBox.height * 0.5

    // 4) 真实 HTML5 拖拽：从组件库模板拖到画布中心。
    //    Playwright 的 dragTo 走 HTML5 D&D 协议，会写入 application/x-saecom-node。
    const source = editor.locator('[data-node-key="input-serial"]').first()
    await source.dragTo(editor.locator('.script-editor-canvas'), {
      targetPosition: { x: canvasBox.width * 0.5, y: canvasBox.height * 0.5 },
      force: true
    })

    // 5) 断言：新节点出现，且其 bbox 与画布中心落点重叠（修复前会飞到画布外远处）。
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(beforeCount + 1, { timeout: 10000 })
    const newNode = editor.locator('[data-testid="node"]').last()
    await expect(newNode).toBeVisible()
    const nodeBox = await newNode.boundingBox()
    expect(nodeBox).toBeTruthy()
    if (!nodeBox) return

    // 节点中心应靠近画布中心落点（误差 < 画布半宽），而非偏移到画布外。
    const nodeCx = nodeBox.x + nodeBox.width / 2
    const nodeCy = nodeBox.y + nodeBox.height / 2
    const dx = Math.abs(nodeCx - dropX)
    const dy = Math.abs(nodeCy - dropY)
    // 允许一定容差（节点锚点偏移、Rete 渲染），但不应超过画布半尺寸——
    // 旧 bug 下偏移可达数千 px，远超此阈值。
    expect(dx).toBeLessThan(canvasBox.width * 0.5)
    expect(dy).toBeLessThan(canvasBox.height * 0.5)
  })
})
