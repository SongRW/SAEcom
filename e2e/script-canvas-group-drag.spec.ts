import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 多节点一起移动：框选多个节点后，拖动其中任意一个，其余选中节点按相同位移一起移动。
 *
 * 背景：此前 nodepicked 会无条件把选中重置为单选，导致多选后拖动只移动被拖节点本身。
 * 修复后：点击已选中节点保持多选 → 拖动时整组按 delta 同步位移（数据 + Rete 视图）。
 * 松手前若未拖动（纯点击）则切回单选，符合主流图形编辑器习惯。
 */
test.describe('画布多节点一起移动', () => {
  test('框选多个节点后拖动其一，整组同步位移', async ({ page }) => {
    test.setTimeout(120000)
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(2, { timeout: 10000 })

    // 切到「选择」工具开启 marquee 框选
    await clickReady(page, page.getByRole('radio', { name: '选择' }))

    // 框选两个节点
    const surface = editor.locator('.script-editor-canvas__surface')
    const sbox = await surface.boundingBox()
    expect(sbox).toBeTruthy()
    if (!sbox) return
    await page.mouse.move(sbox.x + 2, sbox.y + 2)
    await page.mouse.down()
    await page.mouse.move(sbox.x + sbox.width - 2, sbox.y + sbox.height - 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(600)

    // 记录拖动前两个节点的中心点（用 data-node-id 稳定追踪，避免拖动后 DOM 重排导致 nth 错位）
    const nodeIds = await editor.locator('[data-testid="node"]').evaluateAll(
      (els) => els.map((el) => el.getAttribute('data-node-id') || '')
    )
    expect(nodeIds.length).toBe(2)
    const idA = nodeIds[0]
    const idB = nodeIds[1]
    const nodeA = editor.locator(`[data-testid="node"][data-node-id="${idA}"]`)
    const nodeB = editor.locator(`[data-testid="node"][data-node-id="${idB}"]`)
    const beforeA = await nodeA.boundingBox()
    const beforeB = await nodeB.boundingBox()
    expect(beforeA).toBeTruthy()
    expect(beforeB).toBeTruthy()
    if (!beforeA || !beforeB) return

    // 在节点 A 中心按下，向右下拖动一段位移
    const startX = beforeA.x + beforeA.width / 2
    const startY = beforeA.y + beforeA.height / 2
    const dx = 80
    const dy = 60
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dx, startY + dy, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    // 两个节点都应发生大致相同的位移（允许像素级舍入误差）
    const afterA = await nodeA.boundingBox()
    const afterB = await nodeB.boundingBox()
    expect(afterA).toBeTruthy()
    expect(afterB).toBeTruthy()
    if (!afterA || !afterB) return

    const moveA = { x: afterA.x - beforeA.x, y: afterA.y - beforeA.y }
    const moveB = { x: afterB.x - beforeB.x, y: afterB.y - beforeB.y }
    // 节点 B 必须跟随移动（修复前 B 的位移 ≈ 0）
    expect(Math.abs(moveB.x - moveA.x), `B 的 x 位移应接近 A：A=${JSON.stringify(moveA)} B=${JSON.stringify(moveB)}`).toBeLessThan(6)
    expect(Math.abs(moveB.y - moveA.y), `B 的 y 位移应接近 A：A=${JSON.stringify(moveA)} B=${JSON.stringify(moveB)}`).toBeLessThan(6)
    // 且实际位移接近预期的 dx/dy
    expect(Math.abs(moveA.x - dx)).toBeLessThan(10)
    expect(Math.abs(moveA.y - dy)).toBeLessThan(10)
  })
})
