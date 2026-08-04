import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 选中节点连线高亮与方向动画。
 *
 * 验证 GraphCanvas 选择→DOM effect 在连线 SVG 上设置：
 *   data-app-selected-endpoint / data-app-selected-direction
 * - 选中源节点 → 出边 direction="out"（绿色前向流动，数据流出）
 * - 选中目标节点 → 入边 direction="in"（橙色后向流动，数据流入）
 * - 两端同时选中 → direction="both"（确定性 out 方向，不叠加两种动画）
 * - 取消选择 → 高亮属性移除
 *
 * 选择采用 marquee（框选）：连线 path 有 pointer-events:auto，单击落在连线覆盖区
 * 会被 path 拦截而不触发 nodepicked；marquee 由画布 pointerdown 处理更稳定。
 * marquee 起点必须落在真正空白的 surface 上（用 elementFromPoint 扫描），
 * 否则会命中画布工具栏 / 连线 path / 节点而不启动框选。
 *
 * 遵守 CONV-GRAPH-CANONICAL-STATE：高亮是瞬态视觉，不持久化。
 */
test.describe('选中节点连线高亮与方向动画', () => {
  test.setTimeout(120000)

  // 创建一对相连节点（input-manual → output-log），等连线渲染完成。
  async function setupConnectedPair(page: import('@playwright/test').Page) {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-manual"]'))
    await clickReady(page, editor.getByText('输出类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="output-log"]'))

    const nodes = editor.locator('[data-testid="node"]')
    await expect(nodes).toHaveCount(2, { timeout: 10000 })
    const source = nodes.nth(0)
    const target = nodes.nth(1)

    // 拖一条连线 source.output-out → target.input-in
    const sourceSocket = source.getByTestId('output-out').locator('.output-socket')
    const targetSocket = target.getByTestId('input-in').locator('.input-socket')
    const fromBox = await sourceSocket.boundingBox()
    const toBox = await targetSocket.boundingBox()
    expect(fromBox).toBeTruthy()
    expect(toBox).toBeTruthy()
    if (!fromBox || !toBox) throw new Error('socket bounding box missing')
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 })
    await page.mouse.up()

    // 等连线 path 渲染出来（同 script-editor-arrange.spec 的判定方式）
    await expect.poll(async () => {
      const widths = await editor.locator('path').evaluateAll((paths) => paths
        .filter((path) => {
          const style = getComputedStyle(path)
          return style.fill === 'none' && style.stroke !== 'none'
        })
        .map((path) => path.getBoundingClientRect().width)
        .filter((width) => width > 1)
      )
      return widths.length
    }, { timeout: 10000 }).toBeGreaterThanOrEqual(1)

    return { editor, source, target }
  }

  /**
   * 切到「选择」工具后，用紧贴目标节点联合包围盒的 marquee 框选它们。
   *
   * marquee 矩形需精确包住目标节点（不能太大，否则框进无关节点），
   * 且起点必须落在真正空白的 surface 上（命中工具栏/节点/连线都会使画布
   * onPointerDown 不启动框选）。策略：把联合包围盒四角各外扩 pad，
   * 用 elementFromPoint 在 4 个外扩角中找一个命中 surface 的作为起点，
   * 其对角作为终点。这样矩形紧贴节点、起点保证空白。
   */
  async function marqueeSelectNodes(
    page: import('@playwright/test').Page,
    editor: import('@playwright/test').Locator,
    targets: import('@playwright/test').Locator[]
  ) {
    await clickReady(page, page.getByRole('radio', { name: '选择' }))
    await page.waitForTimeout(400)

    const nodeBoxes = await Promise.all(targets.map((t) => t.boundingBox()))
    for (const b of nodeBoxes) expect(b).toBeTruthy()

    const xs = nodeBoxes.flatMap((b) => [b!.x, b!.x + b!.width])
    const ys = nodeBoxes.flatMap((b) => [b!.y, b!.y + b!.height])
    const left = Math.min(...xs)
    const right = Math.max(...xs)
    const top = Math.min(...ys)
    const bottom = Math.max(...ys)

    // 在外扩四角中找一个命中 surface 的空白点作为 marquee 起点；对角为终点。
    const pad = 10
    const corners = [
      { sx: left - pad, sy: top - pad, ex: right + pad, ey: bottom + pad },     // 左上 → 右下
      { sx: right + pad, sy: top - pad, ex: left - pad, ey: bottom + pad },     // 右上 → 左下
      { sx: left - pad, sy: bottom + pad, ex: right + pad, ey: top - pad },     // 左下 → 右上
      { sx: right + pad, sy: bottom + pad, ex: left - pad, ey: top - pad }      // 右下 → 左上
    ]
    const pick = await editor.evaluate((root, { corners }) => {
      for (const c of corners) {
        const el = document.elementFromPoint(c.sx, c.sy)
        if (el && el.classList.contains('script-editor-canvas__surface')) return c
      }
      return null
    }, { corners })
    expect(pick, '未找到空白 marquee 起点（四角均被遮挡）').toBeTruthy()
    if (!pick) return

    await page.mouse.move(pick.sx, pick.sy)
    await page.mouse.down()
    await page.mouse.move(pick.ex, pick.ey, { steps: 12 })
    await page.mouse.up()
    // 等 marquee 落定 + 选择 effect 写入连线属性
    await page.waitForTimeout(700)
  }

  /**
   * 取消选择：在「选择」工具下，于真正命中 surface 的空白点做一次小 marquee 拖动。
   *
   * 不能用纯 click：画布 onPointerDown 设的 marquee 状态是异步的，紧接的 pointerUp
   * 闭包里 marquee 仍为 null → 提前 return，不清空选中。必须有一次实际拖动让
   * pointerUp 拿到非空 marquee 矩形 → nodesInMarquee 返回 [] → onSelectNodes([])。
   * 起点必须 elementFromPoint 命中 surface 本身（命中 Rete holder 空白 div 不会启动）。
   */
  async function deselectOnBlank(page: import('@playwright/test').Page, editor: import('@playwright/test').Locator) {
    await clickReady(page, page.getByRole('radio', { name: '选择' }))
    await page.waitForTimeout(300)

    const start = await editor.evaluate((root) => {
      const surface = root.querySelector('.script-editor-canvas__surface') as HTMLElement | null
      if (!surface) return null
      const cr = surface.getBoundingClientRect()
      const nodeEls = Array.from(root.querySelectorAll('[data-testid="node"]')) as HTMLElement[]
      const hitNode = (x: number, y: number) => nodeEls.some((n) => {
        const r = n.getBoundingClientRect()
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
      })
      for (let y = cr.bottom - 15; y > cr.top + 40; y -= 12) {
        for (let x = cr.left + 15; x < cr.right - 15; x += 12) {
          if (hitNode(x, y)) continue
          const el = document.elementFromPoint(x, y)
          if (el && el.classList.contains('script-editor-canvas__surface')) return { x, y }
        }
      }
      return null
    })
    expect(start, '未找到空白 marquee 起点（用于取消选择）').toBeTruthy()
    if (!start) return

    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 40, start.y - 30, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(600)
  }

  test('选中源节点 → 出边高亮 direction="out"', async ({ page }) => {
    const { editor, source } = await setupConnectedPair(page)
    await marqueeSelectNodes(page, editor, [source])

    const outConn = editor.locator('[data-testid="connection"][data-app-selected-direction="out"]')
    await expect(outConn.first()).toBeVisible({ timeout: 5000 })
    await expect(outConn.first()).toHaveAttribute('data-app-selected-endpoint', 'true')

    // CSS 流动动画已应用（reduced-motion 关闭的常规环境）
    const animationName = await outConn.first().locator('path').evaluate((el) => getComputedStyle(el).animationName)
    expect(animationName).toContain('flow')
  })

  test('选中目标节点 → 入边高亮 direction="in"', async ({ page }) => {
    const { editor, target } = await setupConnectedPair(page)
    await marqueeSelectNodes(page, editor, [target])

    const inConn = editor.locator('[data-testid="connection"][data-app-selected-direction="in"]')
    await expect(inConn.first()).toBeVisible({ timeout: 5000 })
    await expect(inConn.first()).toHaveAttribute('data-app-selected-endpoint', 'true')

    const animationName = await inConn.first().locator('path').evaluate((el) => getComputedStyle(el).animationName)
    expect(animationName).toContain('flow')
  })

  test('框选两端 → 连线 direction="both"', async ({ page }) => {
    const { editor, source, target } = await setupConnectedPair(page)
    await marqueeSelectNodes(page, editor, [source, target])

    const bothConn = editor.locator('[data-testid="connection"][data-app-selected-direction="both"]')
    await expect(bothConn.first()).toBeVisible({ timeout: 5000 })
    await expect(bothConn.first()).toHaveAttribute('data-app-selected-endpoint', 'true')
  })

  test('取消选择后连线高亮属性移除', async ({ page }) => {
    const { editor, source } = await setupConnectedPair(page)
    await marqueeSelectNodes(page, editor, [source])
    const outConn = editor.locator('[data-testid="connection"][data-app-selected-direction="out"]')
    await expect(outConn.first()).toBeVisible({ timeout: 5000 })

    await deselectOnBlank(page, editor)

    // 高亮属性应被移除：不再有带 endpoint / direction 的连线
    await expect(editor.locator('[data-testid="connection"][data-app-selected-endpoint]')).toHaveCount(0, { timeout: 5000 })
    await expect(editor.locator('[data-testid="connection"][data-app-selected-direction]')).toHaveCount(0, { timeout: 5000 })
  })
})
