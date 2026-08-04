import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 节点名称编辑、备注与 Ctrl/Cmd+F 搜索定位 E2E。
 *
 * 覆盖的用户可见行为：
 *  1. 在 NodeConfigPanel 中编辑节点名称（label）→ 画布节点标题（.script-rete-node__name）
 *     即时同步更新（依赖 graphRevision bump 触发 Rete 结构重渲）。
 *  2. 为节点添加备注（node.data.note）→ 备注写入 data，可在配置面板回显。
 *  3. Ctrl/Cmd+F 打开节点搜索框 → 按备注内容搜索 → 点击结果选中并定位节点。
 *  4. 焦点在 INPUT/TEXTAREA 时按 Ctrl+F 不劫持（不打开搜索框），保留原生查找。
 *
 * 约束：搜索/定位/选中均为瞬态，不进入 GraphEditorState 持久化（除 label/note 本身）。
 */
test.describe('节点名称编辑、备注与搜索定位', () => {
  test.setTimeout(120000)

  /** 打开脚本编辑器并添加一个 input-manual 节点，返回 editor 与节点定位器。 */
  async function setupEditorWithNode(page: import('@playwright/test').Page) {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 打开组件库 → 添加 input-manual 节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-manual"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="input-manual"]').first()
    await expect(node).toBeVisible({ timeout: 10000 })
    return { editor, node }
  }

  test('编辑节点名称后画布标题同步更新', async ({ page }) => {
    const { editor, node } = await setupEditorWithNode(page)

    // 双击节点打开配置抽屉（NodeConfigPanel 所在）
    await node.dblclick()
    const drawer = editor.locator('.script-editor-drawer, [data-slot="drawer-content"]').first()
    await expect(drawer).toBeVisible({ timeout: 5000 })

    const labelInput = editor.locator('.script-editor-inspector__title-input').first()
    await expect(labelInput).toBeVisible({ timeout: 5000 })

    // 编辑名称：fill 触发 onChange → onLabelChange → graphRevision bump + transient
    await labelInput.fill('我的测试节点')

    // 画布节点标题应同步更新（结构重渲染后 .script-rete-node__name 文本变化）
    await expect(node.locator('.script-rete-node__name').first()).toHaveText('我的测试节点', { timeout: 5000 })
  })

  test('添加备注并在配置面板回显', async ({ page }) => {
    const { editor, node } = await setupEditorWithNode(page)

    await node.dblclick()
    const noteArea = editor.locator('.script-editor-inspector__note-input').first()
    await expect(noteArea).toBeVisible({ timeout: 5000 })

    await noteArea.fill('年月日测试备注')
    await expect(noteArea).toHaveValue('年月日测试备注')

    // 关闭并重开配置抽屉，备注应持久回显（note 写入 node.data，随 graph 状态存活）。
    // 抽屉是自定义组件，只能通过其关闭按钮关闭（Esc 不生效）。
    await clickReady(page, editor.locator('.script-editor-drawer__header [title="关闭"]'))
    await expect(noteArea).toHaveCount(0)
    await node.dblclick()
    const noteAreaReopened = editor.locator('.script-editor-inspector__note-input').first()
    await expect(noteAreaReopened).toHaveValue('年月日测试备注')
  })

  test('Ctrl+F 搜索备注并定位到节点', async ({ page }) => {
    const { editor, node } = await setupEditorWithNode(page)
    const uniqueNote = `定位备注${Date.now()}`

    // 先给节点加一个唯一备注
    await node.dblclick()
    const noteArea = editor.locator('.script-editor-inspector__note-input').first()
    await expect(noteArea).toBeVisible({ timeout: 5000 })
    await noteArea.fill(uniqueNote)
    await expect(noteArea).toHaveValue(uniqueNote)

    // 关闭抽屉，把焦点移出 textarea，否则 Ctrl+F 会被忽略
    await clickReady(page, editor.locator('.script-editor-drawer__header [title="关闭"]'))
    await expect(noteArea).toHaveCount(0)

    // 拖远节点（默认落点接近视口中心，定位前后屏幕位置差异不明显）。
    // 拖动用鼠标 down/move/up，避开 Rete pointer 拦截需在节点标题区按下。
    const box0 = await node.boundingBox()
    expect(box0).toBeTruthy()
    await page.mouse.move(box0!.x + 40, box0!.y + 12)
    await page.mouse.down()
    await page.mouse.move(box0!.x + 40 + 260, box0!.y + 12 + 200, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    // Ctrl+F 打开搜索框（焦点已在关闭按钮上，不在 INPUT/TEXTAREA）
    const isMac = process.platform === 'darwin'
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f')
    const searchInput = editor.locator('.script-editor-search-box__input').first()
    await expect(searchInput).toBeVisible({ timeout: 5000 })

    // 输入备注片段搜索 → 应出现匹配结果
    await searchInput.fill('定位备注')
    await expect(editor.locator('.script-editor-search-box__result').first()).toBeVisible({ timeout: 5000 })
    await expect(editor.locator('.script-editor-search-box__result-name').first()).toHaveText('手动输入')

    // 点击结果 → 关闭搜索框；focusNode 把节点居中到视口。
    await editor.locator('.script-editor-search-box__result').first().click()
    await expect(editor.locator('.script-editor-search-box')).toHaveCount(0)

    // 定位验证：节点的屏幕中心应靠近画布视口中心（focusNode 居中相机）。
    // 用 expect.poll 容忍 area.translate/zoom 的异步动画。
    const surface = editor.locator('.script-editor-canvas__surface')
    await expect.poll(async () => {
      const sBox = await surface.boundingBox()
      const nBox = await node.boundingBox()
      if (!sBox || !nBox) return null
      const cx = nBox.x + nBox.width / 2
      const cy = nBox.y + nBox.height / 2
      const centerCx = sBox.x + sBox.width / 2
      const centerCy = sBox.y + sBox.height / 2
      // 节点中心到视口中心的距离（px），定位后应小于视口最短边的 1/4
      const dist = Math.hypot(cx - centerCx, cy - centerCy)
      const limit = Math.min(sBox.width, sBox.height) / 4
      return { dist, limit, ok: dist < limit }
    }, { timeout: 8000 }).toMatchObject({ ok: true })
  })

  test('Ctrl+F 在备注 textarea 中不劫持原生查找', async ({ page }) => {
    const { editor, node } = await setupEditorWithNode(page)

    await node.dblclick()
    const noteArea = editor.locator('.script-editor-inspector__note-input').first()
    await expect(noteArea).toBeVisible({ timeout: 5000 })
    await noteArea.focus()
    await noteArea.fill('一些备注')

    // 焦点在 textarea 时按 Ctrl+F：搜索框不应打开
    const isMac = process.platform === 'darwin'
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f')
    await page.waitForTimeout(300)
    await expect(editor.locator('.script-editor-search-box')).toHaveCount(0)
    // textarea 仍持有焦点（未被劫持）
    await expect(noteArea).toBeFocused()
  })
})
