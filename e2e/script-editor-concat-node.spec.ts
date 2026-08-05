import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * protocol-concat (HEX拼接) 节点 E2E：覆盖动态增减输入端口 + 持久化（AGENTS.md 硬性门槛）。
 *
 * 覆盖的用户可见行为：
 *  1. 从组件库添加 protocol-concat 节点到画布（默认 2 个输入端口 a/b）。
 *  2. 双击节点打开右侧配置抽屉 → 点「+ 添加输入」→ 输入端口数增加（c 出现）。
 *  3. 点「− 移除末尾输入」→ 端口数减少；下限 2 时按钮 disabled。
 *  4. 持久化：保存脚本 → 关闭编辑器 → 重开 → 从脚本列表选中 → 断言端口数仍在。
 *
 * 选择器来自源码（NodeConfigPanel.tsx / setup.ts），非猜测：
 *  - 输入端口 DOM：[data-testid="input-<key>"]（setup.ts ScriptClassicNode 渲染 input-<key>）
 *    concat 端口 key 为字母序 a/b/c...，故 data-testid="input-a"/"input-b"/"input-c"。
 *  - 增减按钮：NodeConfigPanel.tsx 里「+ 添加输入」「− 移除末尾输入」按钮文本。
 */
test.describe('protocol-concat 节点', () => {
  test('动态增减输入端口', async ({ page }) => {
    // 1) 打开脚本编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 2) 打开组件库 → 展开「协议类」→ 添加 protocol-concat 节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('协议类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="protocol-concat"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="protocol-concat"]')
    await expect(node).toBeVisible()

    // 3) 默认 2 个输入端口 a/b
    await expect(node.locator('[data-testid="input-a"]')).toBeVisible({ timeout: 10000 })
    await expect(node.locator('[data-testid="input-b"]')).toBeVisible()
    await expect(node.locator('[data-testid="input-c"]')).toHaveCount(0)

    // 4) 双击节点打开配置抽屉
    await node.locator('[data-testid="title"]').dblclick({ force: true })
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 5) 点「+ 添加输入」→ 出现第 3 个端口 c
    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await expect(node.locator('[data-testid="input-c"]')).toBeVisible({ timeout: 10000 })

    // 6) 再点一次 → 出现第 4 个端口 d
    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await expect(node.locator('[data-testid="input-d"]')).toBeVisible({ timeout: 10000 })

    // 7) 点「− 移除末尾输入」→ d 消失
    await clickReady(page, drawer.getByRole('button', { name: '− 移除末尾输入' }))
    await expect(node.locator('[data-testid="input-d"]')).toHaveCount(0)
    await expect(node.locator('[data-testid="input-c"]')).toBeVisible()

    // 8) 移除到只剩 2 个时，− 按钮 disabled
    await clickReady(page, drawer.getByRole('button', { name: '− 移除末尾输入' }))
    await expect(node.locator('[data-testid="input-c"]')).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: '− 移除末尾输入' })).toBeDisabled()
  })

  test('端口数持久化到脚本文件', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 添加 concat 节点 + 加到 4 个端口
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('协议类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="protocol-concat"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="protocol-concat"]')
    await expect(node).toBeVisible()
    await node.locator('[data-testid="title"]').dblclick({ force: true })
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible({ timeout: 5000 })

    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await clickReady(page, drawer.getByRole('button', { name: '+ 添加输入' }))
    await expect(node.locator('[data-testid="input-d"]')).toBeVisible({ timeout: 10000 })

    // 保存：首次保存（无活动脚本名）会弹「另存为脚本」对话框
    await editor.getByRole('button', { name: '保存' }).click()
    const saveAsDialog = page.getByRole('dialog', { name: '另存为脚本' })
    await expect(saveAsDialog).toBeVisible()
    await saveAsDialog.getByRole('textbox').fill('ConcatPersistTest')
    await saveAsDialog.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已保存' })).toBeVisible({ timeout: 10000 })

    // 关闭编辑器 → 重开
    // [title="关闭"] 同时命中工具栏 + 配置抽屉两个按钮；工具栏按钮在 DOM 中先出现，用 .first()。
    await editor.locator('[title="关闭"]').first().click()
    await expect(editor).toHaveCount(0)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editorReopened = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editorReopened).toBeVisible()

    // 打开脚本列表 → 选中刚保存的 ConcatPersistTest
    // normalizeScriptName 会补 .js 后缀，故列表条目文案为「ConcatPersistTest.js」
    await clickReady(page, editorReopened.locator('[title="脚本"]'))
    await clickReady(page, editorReopened.getByRole('button', { name: 'ConcatPersistTest.js', exact: true }))

    // 断言 4 端口仍在（a + d 都可见，证明 ports 字段持久化）
    const reloadedNode = editorReopened.locator('[data-testid="node"][data-node-key="protocol-concat"]')
    await expect(reloadedNode.locator('[data-testid="input-a"]')).toBeVisible({ timeout: 15000 })
    await expect(reloadedNode.locator('[data-testid="input-d"]')).toBeVisible()
  })
})
