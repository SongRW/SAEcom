import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * script-expr (表达式) 节点 E2E：覆盖动态字母端口 + 表达式控件 + 持久化（AGENTS.md 硬性门槛）。
 *
 * 覆盖的用户可见行为：
 *  1. 从组件库「数值类」添加 script-expr 节点（默认 2 个输入端口 a/b）。
 *  2. 双击节点打开配置抽屉，「+ 添加输入」→ 端口 c 出现；表达式控件可见。
 *  3. 修改表达式文本，断言落入 DOM。
 *  4. 持久化：保存 → 关闭 → 重开 → 从脚本列表选中 → 断言端口数 + 表达式仍在。
 *
 * 选择器依据：与 script-editor-concat-node.spec.ts 一致（同一套动态端口机制）。
 */
test.describe('script-expr 节点', () => {
  test('动态字母端口与表达式控件', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 打开组件库 → 展开「数值类」→ 添加 script-expr 节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('数值类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="script-expr"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="script-expr"]')
    await expect(node).toBeVisible()

    // 默认 2 个输入端口 a/b
    await expect(node.locator('[data-testid="input-a"]')).toBeVisible({ timeout: 10000 })
    await expect(node.locator('[data-testid="input-b"]')).toBeVisible()
    await expect(node.locator('[data-testid="input-c"]')).toHaveCount(0)

    // 双击打开配置抽屉
    await node.locator('[data-testid="title"]').dblclick({ force: true })
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 表达式控件可见，默认值 (a + b)
    const exprInput = drawer.locator('.script-editor-field', { hasText: '表达式' }).locator('input')
    await expect(exprInput).toHaveValue('(a + b)')

    // 改表达式为 a * b
    await exprInput.fill('a * b')
    await expect(exprInput).toHaveValue('a * b')

    // 点「+ 添加输入」→ 出现端口 c
    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await expect(node.locator('[data-testid="input-c"]')).toBeVisible({ timeout: 10000 })
  })

  test('端口数与表达式持久化到脚本文件', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('数值类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="script-expr"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="script-expr"]')
    await expect(node).toBeVisible()
    await node.locator('[data-testid="title"]').dblclick({ force: true })
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 加到 4 端口 + 改表达式
    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await expect(node.locator('[data-testid="input-d"]')).toBeVisible({ timeout: 10000 })
    await drawer.locator('.script-editor-field', { hasText: '表达式' }).locator('input').fill('a + b - c')

    // 保存
    await editor.getByRole('button', { name: '保存' }).click()
    const saveAsDialog = page.getByRole('dialog', { name: '另存为脚本' })
    await expect(saveAsDialog).toBeVisible()
    await saveAsDialog.getByRole('textbox').fill('ScriptExprPersistTest')
    await saveAsDialog.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已保存' })).toBeVisible({ timeout: 10000 })

    // 关闭 → 重开
    await editor.locator('[title="关闭"]').first().click()
    await expect(editor).toHaveCount(0)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editorReopened = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editorReopened).toBeVisible()

    await clickReady(page, editorReopened.locator('[title="脚本"]'))
    await clickReady(page, editorReopened.getByRole('button', { name: 'ScriptExprPersistTest.js', exact: true }))

    // 断言 4 端口仍在（a + d 可见）+ 表达式已落盘
    const reloadedNode = editorReopened.locator('[data-testid="node"][data-node-key="script-expr"]')
    await expect(reloadedNode.locator('[data-testid="input-a"]')).toBeVisible({ timeout: 15000 })
    await expect(reloadedNode.locator('[data-testid="input-d"]')).toBeVisible()
    await reloadedNode.locator('[data-testid="title"]').dblclick({ force: true })
    const reloadedDrawer = editorReopened.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(reloadedDrawer).toBeVisible({ timeout: 5000 })
    await expect(reloadedDrawer.locator('.script-editor-field', { hasText: '表达式' }).locator('input')).toHaveValue('a + b - c')
  })
})
