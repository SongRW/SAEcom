import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * string-pad (字符串填充) 节点 E2E：覆盖配置面板渲染 + 配置持久化（AGENTS.md 硬性门槛）。
 *
 * 覆盖的用户可见行为：
 *  1. 从组件库「字符类」添加 string-pad 节点（单 in → 单 out，非动态）。
 *  2. 双击节点打开配置抽屉，断言 4 个控件可见：目标长度 / 填充字符 / 填充侧 / 超长处理。
 *  3. 修改「目标长度」为 4、「填充侧」为 右侧，断言改动可落入 DOM。
 *  4. 持久化：保存脚本 → 关闭编辑器 → 重开 → 从脚本列表选中 → 断言配置仍在。
 *
 * 选择器依据：
 *  - 节点 DOM：[data-testid="node"][data-node-key="string-pad"]
 *  - 配置抽屉：.script-editor-drawer 含「节点配置」文本（NodeConfigPanel.tsx）
 *  - 控件 Label 即控件中文 label（NodeConfigPanel.tsx 渲染 <Label>{control.label}</Label>）
 */
test.describe('string-pad 节点', () => {
  test('配置面板渲染与修改', async ({ page }) => {
    // 1) 打开脚本编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 2) 打开组件库 → 展开「字符类」→ 添加 string-pad 节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('字符类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="string-pad"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="string-pad"]')
    await expect(node).toBeVisible()

    // 3) 单输入/单输出端口可见（非动态节点，无 + 添加输入 按钮）
    await expect(node.locator('[data-testid="input-in"]')).toBeVisible({ timeout: 10000 })

    // 4) 双击节点打开配置抽屉
    await node.locator('[data-testid="title"]').dblclick({ force: true })
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 5) 4 个控件 Label 可见
    await expect(drawer.getByText('目标长度', { exact: true })).toBeVisible()
    await expect(drawer.getByText('填充字符', { exact: true })).toBeVisible()
    await expect(drawer.getByText('填充侧', { exact: true })).toBeVisible()
    await expect(drawer.getByText('超长处理', { exact: true })).toBeVisible()

    // 6) 非动态节点不应出现动态增减端口按钮
    await expect(drawer.getByRole('button', { name: '+ 添加输入' })).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: '− 移除末尾输入' })).toHaveCount(0)

    // 7) 修改「目标长度」为 4
    const lengthInput = drawer.locator('.script-editor-field', { hasText: '目标长度' }).locator('input')
    await lengthInput.fill('4')
    await expect(lengthInput).toHaveValue('4')

    // 8) 切换「填充侧」为 右侧（Radix Select：点 trigger → 等 listbox → 点 option）
    await clickReady(page, drawer.locator('.script-editor-field', { hasText: '填充侧' }).getByRole('combobox'))
    await page.getByRole('listbox').getByText('右侧', { exact: true }).click()
  })

  test('配置持久化到脚本文件', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 添加 string-pad 节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.getByText('字符类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="string-pad"]'))

    const node = editor.locator('[data-testid="node"][data-node-key="string-pad"]')
    await expect(node).toBeVisible()
    await node.locator('[data-testid="title"]').dblclick({ force: true })
    const drawer = editor.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(drawer).toBeVisible({ timeout: 5000 })

    // 把「目标长度」改成 4，「填充侧」改成 右侧，「超长处理」改成 截断到长度
    await drawer.locator('.script-editor-field', { hasText: '目标长度' }).locator('input').fill('4')

    // Radix Select：点 trigger → 等 listbox → 点 option（与 new-panel-select.spec.ts 一致）
    await clickReady(page, drawer.locator('.script-editor-field', { hasText: '填充侧' }).getByRole('combobox'))
    await page.getByRole('listbox').getByText('右侧', { exact: true }).click()
    await clickReady(page, drawer.locator('.script-editor-field', { hasText: '超长处理' }).getByRole('combobox'))
    await page.getByRole('listbox').getByText('截断到长度', { exact: true }).click()

    // 保存：首次保存弹「另存为脚本」对话框
    await editor.getByRole('button', { name: '保存' }).click()
    const saveAsDialog = page.getByRole('dialog', { name: '另存为脚本' })
    await expect(saveAsDialog).toBeVisible()
    await saveAsDialog.getByRole('textbox').fill('StringPadPersistTest')
    await saveAsDialog.getByRole('button', { name: '确定' }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已保存' })).toBeVisible({ timeout: 10000 })

    // 关闭编辑器 → 重开
    await editor.locator('[title="关闭"]').first().click()
    await expect(editor).toHaveCount(0)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editorReopened = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editorReopened).toBeVisible()

    // 打开脚本列表 → 选中 StringPadPersistTest
    await clickReady(page, editorReopened.locator('[title="脚本"]'))
    await clickReady(page, editorReopened.getByRole('button', { name: 'StringPadPersistTest.js', exact: true }))

    // 节点仍在 + 重开配置抽屉断言配置已落盘
    const reloadedNode = editorReopened.locator('[data-testid="node"][data-node-key="string-pad"]')
    await expect(reloadedNode).toBeVisible({ timeout: 15000 })
    await reloadedNode.locator('[data-testid="title"]').dblclick({ force: true })
    const reloadedDrawer = editorReopened.locator('.script-editor-drawer').filter({ hasText: '节点配置' })
    await expect(reloadedDrawer).toBeVisible({ timeout: 5000 })
    await expect(reloadedDrawer.locator('.script-editor-field', { hasText: '目标长度' }).locator('input')).toHaveValue('4')
    // Radix Select trigger 显示当前选中项文本（SelectValue 渲染）
    await expect(reloadedDrawer.locator('.script-editor-field', { hasText: '填充侧' }).getByRole('combobox')).toContainText('右侧')
    await expect(reloadedDrawer.locator('.script-editor-field', { hasText: '超长处理' }).getByRole('combobox')).toContainText('截断到长度')
  })
})
