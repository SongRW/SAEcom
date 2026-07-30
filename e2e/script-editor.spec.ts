import { test, expect, NAV, openNavPage, clickReady, expectDialogClosed } from './fixtures'


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
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 2) 打开组件库（Rail 的「组件」按钮）
    await clickReady(page, editor.getByRole('button', { name: '组件' }))

    // 3) 点击「接收串口」节点模板 → 添加到画布
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))

    // 4) 断言：画布出现节点（Rete 节点带 data-testid="node"）
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })
  })

  test('编辑器最小化与还原', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 工具栏「最小化」→ 出现最小化条
    await clickReady(page, editor.locator('[title="最小化"]'))
    const minimizedBar = page.locator('.script-editor-minimized-bar')
    await expect(minimizedBar).toBeVisible()

    // 点击还原（最小化条本身就是还原按钮）
    await clickReady(page, minimizedBar)
    await expect(editor).toBeVisible()
  })

  test('画布内部拖拽不会触发原生 dragstart 幽灵', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    // 在画布节点/空白上派发 dragstart：应被 GraphCanvas 拦截（defaultPrevented）。
    // 这对应用户看到的「半透明影子 + 平移中断」——原生 HTML5 drag 抢了 pointer。
    const prevented = await editor.locator('.script-editor-canvas').evaluate((canvas) => {
      const node = canvas.querySelector('[data-testid="node"]') as HTMLElement | null
      const target = node || (canvas as HTMLElement)
      const event = new DragEvent('dragstart', { bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(prevented).toBe(true)
  })

  test('输出栏为底部 dock：收起不占布局、展开可查看', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    const dock = editor.locator('[data-testid="script-output-dock"]')
    await expect(dock).toBeVisible()
    await expect(dock).toHaveAttribute('data-expanded', 'false')

    // 收起态：画布 shell 应接近 dialog 工作区高度（dock 不占 flex 行）。
    const heights = await editor.evaluate((root) => {
      const workspace = root.querySelector('.script-editor-workspace') as HTMLElement | null
      const shell = root.querySelector('.script-editor-canvas-shell') as HTMLElement | null
      return {
        workspace: workspace?.clientHeight ?? 0,
        shell: shell?.clientHeight ?? 0
      }
    })
    expect(heights.workspace).toBeGreaterThan(200)
    expect(heights.shell).toBeGreaterThan(heights.workspace * 0.9)

    // 侧栏「输出」→ 展开 dock
    await clickReady(page, editor.getByRole('button', { name: '输出' }))
    await expect(dock).toHaveAttribute('data-expanded', 'true')
    await expect(editor.locator('[data-testid="script-output-body"]')).toBeVisible()
    await expect(editor.locator('[data-testid="script-output-body"]')).toContainText('运行脚本后显示输出')

    // 顶部 grip 上拖 → 高度增大（可拖拽调高）
    const before = await dock.boundingBox()
    expect(before).toBeTruthy()
    if (!before) return
    const grip = editor.locator('[data-testid="script-output-grip"]')
    const gripBox = await grip.boundingBox()
    expect(gripBox).toBeTruthy()
    if (!gripBox) return
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 - 60, { steps: 6 })
    await page.mouse.up()
    const after = await dock.boundingBox()
    expect(after).toBeTruthy()
    if (!after) return
    expect(after.height).toBeGreaterThan(before.height + 20)

    // 面板内收起
    await clickReady(page, editor.locator('.script-editor-output-dock__actions button[title="收起"]'))
    await expect(dock).toHaveAttribute('data-expanded', 'false')

    // 右下角 handle 再展开
    await clickReady(page, editor.locator('[data-testid="script-output-handle"]'))
    await expect(dock).toHaveAttribute('data-expanded', 'true')
  })

  test('输出栏可弹出独立窗口并同步日志', async ({ page, electronApp }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await clickReady(page, editor.getByRole('button', { name: '输出' }))
    await expect(editor.locator('[data-testid="script-output-dock"]')).toHaveAttribute('data-expanded', 'true')

    const beforePages = electronApp.windows().length
    await clickReady(page, editor.locator('[data-testid="script-output-popout"]'))

    // 等待输出独立窗出现
    await expect.poll(async () => electronApp.windows().length, { timeout: 10000 }).toBeGreaterThan(beforePages)

    const outputWin = electronApp.windows().find((w) => {
      const url = w.url()
      return url.includes('script-output')
    })
    expect(outputWin).toBeTruthy()
    if (!outputWin) return

    await outputWin.waitForLoadState('domcontentloaded')
    const popoutRoot = outputWin.locator('[data-testid="script-output-popout"]')
    await expect(popoutRoot).toBeVisible({ timeout: 10000 })
    await expect(outputWin.locator('[data-testid="script-output-popout-body"]')).toContainText('运行脚本后显示输出')

    // host 标记已弹出
    await expect(editor.locator('[data-testid="script-output-dock"]')).toHaveAttribute('data-popped-out', 'true')
  })

  test('缩略图可见且拖拽视口后节点仍在画布内', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    const minimap = editor.locator('[data-testid="minimap"]')
    await expect(minimap).toBeVisible()
    // ratio 必须为 1 时才会渲染出节点块/视口框；此前 ratio≠1 会出现空白缩略图。
    await expect(minimap.locator('[data-testid="minimap-node"]')).toHaveCount(1, { timeout: 10000 })
    const viewport = minimap.locator('[data-testid="minimap-viewport"]')
    await expect(viewport).toBeVisible()

    // 拖视口框（不是整块 minimap 背景）：有 boundViewport + pan restrictor 时，
    // 不应把主画布节点甩到看不见的远处。
    const box = await viewport.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5 + 30, { steps: 6 })
    await page.mouse.up()

    const node = editor.locator('[data-testid="node"]').first()
    await expect(node).toBeVisible()
    const nodeBox = await node.boundingBox()
    expect(nodeBox).toBeTruthy()
    // 节点仍与编辑器画布有重叠（未被拖出有效可视区到无限远）
    const canvasBox = await editor.locator('.script-editor-canvas').boundingBox()
    expect(canvasBox).toBeTruthy()
    if (!nodeBox || !canvasBox) return
    const overlaps =
      nodeBox.x < canvasBox.x + canvasBox.width
      && nodeBox.x + nodeBox.width > canvasBox.x
      && nodeBox.y < canvasBox.y + canvasBox.height
      && nodeBox.y + nodeBox.height > canvasBox.y
    expect(overlaps).toBe(true)
  })

  // 回归（Bug A「放大状态退出重进后缩略图/缩放拖动失效」）：
  // 放大后关闭编辑器再重开，新建的 Rete area 必须按保留的 zoom 重新对齐，
  // 否则 React zoom 与画板 transform 脱节，minimap 视口框拖不动、节点被甩出画布。
  test('放大后关闭重开编辑器，缩略图视口仍可拖动', async ({ page }) => {
    test.setTimeout(120000)
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    let editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    // 加一个节点，让 minimap 有内容可渲染（minimap-node / minimap-viewport）
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    // 放大若干次，使 zoom 明显大于 1（HUD 显示 >100%）
    const zoomIn = editor.locator('button[title="放大"]')
    for (let i = 0; i < 4; i++) await clickReady(page, zoomIn)
    await expect(editor.locator('.script-editor-canvas__hud')).toContainText(/1[3-9]\d%|[2-9]\d\d%/)

    // 关闭编辑器（GraphCanvas 子树卸载）→ 重新打开（子树重建）
    await clickReady(page, editor.locator('button[title="关闭"]'))
    await expectDialogClosed(page, '脚本编辑器')
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 重开后画布节点仍在，minimap 视口框可拖动且节点未被甩出画布
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })
    const minimap = editor.locator('[data-testid="minimap"]')
    await expect(minimap).toBeVisible()
    const viewport = minimap.locator('[data-testid="minimap-viewport"]')
    await expect(viewport).toBeVisible({ timeout: 10000 })
    const box = await viewport.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.5 + 30, { steps: 6 })
    await page.mouse.up()

    const node = editor.locator('[data-testid="node"]').first()
    await expect(node).toBeVisible()
    const nodeBox = await node.boundingBox()
    const canvasBox = await editor.locator('.script-editor-canvas').boundingBox()
    expect(nodeBox).toBeTruthy()
    expect(canvasBox).toBeTruthy()
    if (!nodeBox || !canvasBox) return
    const overlaps =
      nodeBox.x < canvasBox.x + canvasBox.width
      && nodeBox.x + nodeBox.width > canvasBox.x
      && nodeBox.y < canvasBox.y + canvasBox.height
      && nodeBox.y + nodeBox.height > canvasBox.y
    expect(overlaps).toBe(true)
  })
})
