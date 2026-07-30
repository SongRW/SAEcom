import { test, expect, NAV, openNavPage, clickReady } from './fixtures'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 脚本列表右键菜单 + 工具栏重命名/导出 E2E。
 * 覆盖：右键重命名、重名边界、右键删除、工具栏重命名、导出（mock 原生保存对话框）。
 */
test.describe('脚本列表操作', () => {
  test('右键重命名脚本', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 新建一个脚本
    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    const createDialog = page.getByRole('dialog', { name: '新建脚本' })
    await createDialog.waitFor()
    await createDialog.getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())

    // 打开脚本列表面板
    await clickReady(page, editor.getByRole('button', { name: '脚本页' }))

    const list = editor.locator('.script-editor-list__items')
    const firstItem = list.locator('button').first()
    const oldName = (await firstItem.textContent())?.trim() || ''

    // 右键 → 重命名
    await firstItem.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '重命名' }).click()

    const renameDialog = page.getByRole('dialog', { name: '重命名脚本' })
    await renameDialog.waitFor()
    const input = renameDialog.getByRole('textbox')
    // 预填应已去掉 .js 后缀
    await expect(input).toHaveValue(oldName.replace(/\.js$/i, ''))

    // 输入新名
    await input.fill('RenamedE2E')
    await renameDialog.getByRole('button', { name: '确定' }).click()

    // 列表出现新名、旧名消失
    await expect(list.locator('button', { hasText: 'RenamedE2E.js' })).toBeVisible({ timeout: 10000 })
    await expect(list.locator('button', { hasText: oldName })).toHaveCount(0)
  })

  test('重命名冲突时报错且不覆盖', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 新建 A、B 两个脚本（用默认名 Script_1.js、Script_2.js）
    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())
    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())

    await clickReady(page, editor.getByRole('button', { name: '脚本页' }))
    const list = editor.locator('.script-editor-list__items')

    // 右键 Script_1 → 重命名为 Script_2
    await list.locator('button', { hasText: 'Script_1.js' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: '重命名' }).click()
    const renameDialog = page.getByRole('dialog', { name: '重命名脚本' })
    await renameDialog.waitFor()
    await renameDialog.getByRole('textbox').fill('Script_2')
    await renameDialog.getByRole('button', { name: '确定' }).click()

    // 错误 toast 出现
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已存在' })).toBeVisible({ timeout: 10000 })
    // Script_1 仍在列表
    await expect(list.locator('button', { hasText: 'Script_1.js' })).toHaveCount(1)
  })

  test('右键删除脚本', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())

    await clickReady(page, editor.getByRole('button', { name: '脚本页' }))
    const list = editor.locator('.script-editor-list__items')
    const firstItem = list.locator('button').first()
    const name = (await firstItem.textContent())?.trim() || ''

    await firstItem.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '删除' }).click()

    // 删除确认走 AlertDialog（Radix 渲染为 role="alertdialog"，区别于 PromptDialog 的 role="dialog"）
    const deleteDialog = page.getByRole('alertdialog', { name: '删除脚本' })
    await deleteDialog.waitFor()
    await deleteDialog.getByRole('button', { name: '删除' }).click()

    await expect(list.locator('button', { hasText: name })).toHaveCount(0, { timeout: 10000 })
  })

  test('工具栏重命名活动脚本', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())

    // 工具栏重命名按钮
    await editor.getByRole('button', { name: '重命名' }).click()
    const renameDialog = page.getByRole('dialog', { name: '重命名脚本' })
    await renameDialog.waitFor()
    await renameDialog.getByRole('textbox').fill('ToolbarRenamed')
    await renameDialog.getByRole('button', { name: '确定' }).click()

    // 工具栏标题区显示新名
    await expect(editor.locator('.script-editor-current')).toHaveText(/ToolbarRenamed\.js/, { timeout: 10000 })
  })

  test('右键导出脚本到文件', async ({ page, electronApp }) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'saecom-export-'))
    const exportPath = join(tempDir, 'exported.js')

    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())

    // mock 原生保存对话框，避免 OS 模态阻塞测试
    await electronApp.evaluate(async ({ dialog }, path) => {
      (dialog as unknown as { showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }> }).showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, exportPath)

    await clickReady(page, editor.getByRole('button', { name: '脚本页' }))
    const list = editor.locator('.script-editor-list__items')
    await list.locator('button').first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: '导出' }).click()

    // 成功 toast + 文件被写入
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已导出' })).toBeVisible({ timeout: 10000 })
    expect(existsSync(exportPath)).toBeTruthy()
    const content = readFileSync(exportPath, 'utf-8')
    // 导出的应是含流程图标记块的原始 .js 文件（标记为 VS_FLOW_START/VS_FLOW_END，见 persistence.ts）
    expect(content).toContain('VS_FLOW_START')
  })
})
