import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 画布右键删除节点回归。
 *
 * 背景：此前「右键命中节点」会无条件 onSelectNodes([nodeId])，把已有的多选清空成单选，
 * 导致用户框选多个节点后右键其一 → 点「删除节点」只删了被右键那一个，其余选中节点保留，
 * 体感上「删除没功能」。同时多选后右键空白处也没有任何删除入口。
 *
 * 修复后：
 * - 右键命中已在选中集内的节点时，保持多选；菜单「删除」作用于整个选中集。
 * - 右键命中未选中节点时，切为单选后删除单个（原行为）。
 * - 右键空白处且存在选中节点时，菜单追加「删除选中 N 个节点」。
 */
test.describe('画布右键删除节点', () => {
  test('单节点：右键未选中节点 → 删除节点', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    // 右键节点 → 菜单显示「删除节点」（单数）
    await editor.locator('[data-testid="node"]').first().click({ button: 'right' })
    const menu = editor.locator('.script-editor-context-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })
    await expect(menu.getByRole('menuitem', { name: '删除节点' })).toBeVisible()

    // 点删除 → 节点消失
    await menu.getByRole('menuitem', { name: '删除节点' }).click()
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(0, { timeout: 5000 })
  })

  test('多选：框选后右键命中节点 → 删除整个选中集', async ({ page }) => {
    test.setTimeout(120000)
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(3, { timeout: 10000 })

    // 切到「选择」工具（默认「指针」不开启 marquee 框选）
    await clickReady(page, page.getByRole('radio', { name: '选择' }))

    // 框选全部 3 个节点
    const surface = editor.locator('.script-editor-canvas__surface')
    const box = await surface.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, { steps: 10 })
    await page.mouse.up()
    // 等 marquee 落定 + 选中态写入
    await page.waitForTimeout(600)

    // 右键其中一个节点 → 菜单应显示「删除选中 3 个节点」（多选保留）
    await editor.locator('[data-testid="node"]').first().click({ button: 'right' })
    const menu = editor.locator('.script-editor-context-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })
    const batchItem = menu.getByRole('menuitem', { name: '删除选中 3 个节点' })
    await expect(batchItem).toBeVisible()

    // 点批量删除 → 全部节点消失
    await batchItem.click()
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(0, { timeout: 5000 })
  })

  test('多选：框选后右键空白 → 删除选中节点', async ({ page }) => {
    test.setTimeout(120000)
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(2, { timeout: 10000 })

    // 切到「选择」工具（默认「指针」不开启 marquee 框选）
    await clickReady(page, page.getByRole('radio', { name: '选择' }))

    // 框选全部
    const surface = editor.locator('.script-editor-canvas__surface')
    const box = await surface.boundingBox()
    expect(box).toBeTruthy()
    if (!box) return
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(600)

    // 右键画布空白处：在画布内找一个不在任何节点/minimap 上的空白点
    const blank = await editor.evaluate((root) => {
      const canvas = root.querySelector('.script-editor-canvas') as HTMLElement | null
      if (!canvas) return null
      const cr = canvas.getBoundingClientRect()
      // 在画布坐标系内沿网格扫描，跳过节点/minimap 命中的点
      const nodes = Array.from(canvas.querySelectorAll('[data-testid="node"]')) as HTMLElement[]
      const minimap = canvas.querySelector('[data-testid="minimap"]') as HTMLElement | null
      const hit = (x: number, y: number) => {
        const el = document.elementFromPoint(cr.left + x, cr.top + y)
        if (!el) return true
        // 命中画布表面或其纯容器（非节点/minimap/hud）算空白
        const onNode = nodes.some((n) => n.contains(el) || el === n)
        const onMinimap = minimap && (minimap.contains(el) || el === minimap)
        return !onNode && !onMinimap
      }
      for (let y = 40; y < cr.height - 40; y += 30) {
        for (let x = cr.width - 60; x > 60; x -= 30) {
          if (hit(x, y)) return { x: cr.left + x, y: cr.top + y }
        }
      }
      return null
    })
    expect(blank, '画布内应能找到空白点').toBeTruthy()
    if (!blank) return
    await page.mouse.move(blank.x, blank.y)
    await page.mouse.click(blank.x, blank.y, { button: 'right' })
    const menu = editor.locator('.script-editor-context-menu')
    await expect(menu).toBeVisible({ timeout: 3000 })
    // 空白菜单应含「删除选中 2 个节点」
    const batchItem = menu.getByRole('menuitem', { name: '删除选中 2 个节点' })
    await expect(batchItem).toBeVisible()

    await batchItem.click()
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(0, { timeout: 5000 })
  })
})
