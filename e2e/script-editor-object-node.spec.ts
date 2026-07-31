import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

const COMPLEX_SAMPLE = '复杂协议v2-可视化.js'

/**
 * transform-object 节点 E2E：覆盖动态键/端口交互 + 持久化（AGENTS.md 硬性门槛）。
 *
 * 覆盖的用户可见行为：
 *  1. 从组件库添加 transform-object 节点到画布。
 *  2. 添加键 → 出现键名输入 + 动态输入端口（input-key_k1）。
 *     这一步直接验证 setup.ts 的 syncObjectNodePorts + area.update('node', id) 能把
 *     addInput 的新端口渲染到 DOM（最高价值断言）。
 *  3. 给键改名 → 输入值持久。
 *  4. 删除键 → 该键名输入与端口消失；其它键（id 稳定不重编号）保留。
 *  5. 持久化：保存脚本（走「另存为脚本」弹窗）→ 关闭编辑器 → 重开 → 从脚本列表选中 →
 *     断言节点 + 键名 + 端口仍在。
 *
 * 选择器来自源码（KeyListControl.tsx / setup.ts），非猜测：
 *  - 键添加按钮：[data-testid="key-add"]（KeyListControl.tsx）
 *  - 键名输入：[data-testid="key-name-<id>"]，id 形如 k1/k2（module 计数器，从 1 起，稳定不重编号）
 *  - 键删除按钮：[data-testid="key-remove-<id>"]
 *  - 动态输入端口：[data-testid="input-key_<id>"]（setup.ts ScriptClassicNode 渲染 input-<key>，
 *    端口 key 为 key_<id>）
 *
 * ── 关于交互方式：真实鼠标点击 ─────────────────────────────────────
 * key-add / key-remove 按钮用 Playwright 的 .click()（真实鼠标点击）触发。这要求按钮的
 * onClick 能正常合成 click 事件——而 Rete 节点拖拽处理器原本会拦截 pointerdown 导致
 * 节点移动、浏览器不再合成 click。KeyListControl.tsx 在 .script-key-list 容器上加了
 * onPointerDown={(e) => e.stopPropagation()} 修复了这一问题，故这里可以直接 .click()。
 * 用 .click()（而非早期的 focus + Space 键盘激活）才能真正回归验证该修复，防止回归。
 * 键名输入用 Playwright 的 fill()（派发 input 事件，触发 onChange），与真实键入一致。
 * ──────────────────────────────────────────────────────────────────
 */

test.describe('transform-object 节点', () => {
  test('动态增删键与端口', async ({ page }) => {
    // 1) 打开脚本编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 2) 打开组件库 → 展开「转换类」→ 添加 transform-object 节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    // 转换类分组可能默认折叠，点一下展开（CollapsibleContent 在 DOM 但可能隐藏）
    await clickReady(page, editor.getByText('转换类', { exact: true }))
    await editor.locator('[data-node-key="transform-object"]').click()

    const node = editor.locator('[data-testid="node"][data-node-key="transform-object"]')
    await expect(node).toBeVisible()

    // 3) 添加两个键 → 期望出现 2 个键名输入 + 2 个动态输入端口
    const addBtn = node.locator('[data-testid="key-add"]')
    await addBtn.click()
    await addBtn.click()

    await expect(node.locator('[data-testid="key-name-k1"]')).toBeVisible({ timeout: 10000 })
    await expect(node.locator('[data-testid="key-name-k2"]')).toBeVisible({ timeout: 10000 })
    // 端口渲染依赖 area.update('node', id) 触发重绘；这是最高价值的断言——
    // 它证明 addInput 后的 area.update 确实把新 socket 渲染到了 DOM。
    await expect(node.locator('[data-testid="input-key_k1"]')).toBeVisible({ timeout: 10000 })
    await expect(node.locator('[data-testid="input-key_k2"]')).toBeVisible({ timeout: 10000 })

    // 4) 改名第一个键 → 输入值持久（fill 派发 input 事件，触发 onChange）
    await node.locator('[data-testid="key-name-k1"]').fill('temperature')
    await expect(node.locator('[data-testid="key-name-k1"]')).toHaveValue('temperature')

    // 5) 删除第一个键 → k1 键名输入与端口消失；k2（id 稳定不重编号）保留
    await node.locator('[data-testid="key-remove-k1"]').click()
    await expect(node.locator('[data-testid="key-name-k1"]')).toHaveCount(0)
    await expect(node.locator('[data-testid="input-key_k1"]')).toHaveCount(0)
    await expect(node.locator('[data-testid="key-name-k2"]')).toBeVisible()
    await expect(node.locator('[data-testid="input-key_k2"]')).toBeVisible()
  })


  test('右侧参数逐字编辑不会重建复杂协议画布', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.locator('[title="脚本"]'))
    await clickReady(page, editor.getByRole('button', { name: COMPLEX_SAMPLE, exact: true }))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(56, { timeout: 15000 })

    const log = editor.locator('[data-testid="node"][data-node-id="9"]')
    await log.evaluate((node) => { node.dataset.e2eInstance = 'before-edit' })
    await log.locator('[data-testid="title"]').dblclick()
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible()
    const prefix = drawer.getByRole('textbox').first()
    await prefix.focus()
    await prefix.pressSequentially('ABC')

    await expect(prefix).toHaveValue('发送结果ABC')
    await expect(prefix).toBeFocused()
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(56)
    await expect(log).toHaveAttribute('data-e2e-instance', 'before-edit')
    await expect(log).toBeAttached()
    await expect
      .poll(
        async () => editor.locator('path').evaluateAll((paths) => paths.filter((path) => {
          const style = getComputedStyle(path)
          return style.fill === 'none' && style.stroke !== 'none' && path.getBoundingClientRect().width > 1
        }).length),
        { timeout: 10000 }
      )
      .toBeGreaterThan(0)
  })

  test('保存后重开仍保留键与端口（持久化）', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 添加节点 + 一个键并命名
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('转换类', { exact: true }))
    await editor.locator('[data-node-key="transform-object"]').click()

    const node = editor.locator('[data-testid="node"][data-node-key="transform-object"]')
    await expect(node).toBeVisible()

    await node.locator('[data-testid="key-add"]').click()
    await expect(node.locator('[data-testid="key-name-k1"]')).toBeVisible({ timeout: 10000 })
    await expect(node.locator('[data-testid="input-key_k1"]')).toBeVisible({ timeout: 10000 })
    await node.locator('[data-testid="key-name-k1"]').fill('temperature')
    await expect(node.locator('[data-testid="key-name-k1"]')).toHaveValue('temperature')

    // 保存：首次保存（无活动脚本名）会弹「另存为脚本」对话框
    await editor.getByRole('button', { name: '保存' }).click()
    const saveAsDialog = page.getByRole('dialog', { name: '另存为脚本' })
    await expect(saveAsDialog).toBeVisible()
    await saveAsDialog.getByRole('textbox').fill('ObjTest')
    await saveAsDialog.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已保存' })).toBeVisible({ timeout: 10000 })

    // 保存完成：断言节点 + 键名 + 端口仍可见（保存不应清空画布）
    await expect(node).toBeVisible()
    await expect(node.locator('[data-testid="key-name-k1"]')).toBeVisible()
    await expect(node.locator('[data-testid="input-key_k1"]')).toBeVisible()

    // 关闭编辑器对话框（title="关闭"）
    await editor.locator('[title="关闭"]').click()
    await expect(editor).toHaveCount(0)

    // 重新打开编辑器
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editorReopened = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editorReopened).toBeVisible()

    // 打开脚本列表 → 选中刚保存的 ObjTest。
    // 注意：编辑器里有两个名字含「脚本」的 button——工具栏标题（「脚本页 …」）和 Rail 的
    // 「脚本」按钮（aria-label/title=脚本）。这里用 [title="脚本"] 精确命中 Rail 按钮。
    await editorReopened.locator('[title="脚本"]').click()
    // normalizeScriptName 会补 .js 后缀，故列表条目文案为「ObjTest.js」
    await editorReopened.getByRole('button', { name: 'ObjTest.js', exact: true }).click()

    // 断言持久化生效：节点 + 键名 + 端口仍存在
    const nodeAfter = editorReopened.locator('[data-testid="node"][data-node-key="transform-object"]')
    await expect(nodeAfter).toBeVisible({ timeout: 15000 })
    await expect(nodeAfter.locator('[data-testid="key-name-k1"]')).toBeVisible({ timeout: 10000 })
    await expect(nodeAfter.locator('[data-testid="input-key_k1"]')).toBeVisible({ timeout: 10000 })
  })
})
