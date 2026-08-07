/**
 * 自定义组件编辑器覆盖层回归：
 * 打开自定义组件编辑器后，再打开/切换脚本时，组件编辑器覆盖层应自动关闭，
 * 不残留在脚本画布之上（customEditorOpen 优先级最高，会盖住脚本内容）。
 */
import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

test.describe('自定义组件编辑器覆盖层（切脚本时自动关闭）', () => {
  test('打开组件编辑器 → 切换脚本 → 覆盖层消失，脚本画布可见', async ({ page }) => {
    // 预置两个脚本供切换
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.scripts.write('E2E脚本A.js', '// script A\nconsole.log("A")')
      await api.scripts.write('E2E脚本B.js', '// script B\nconsole.log("B")')
    })

    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await page.waitForTimeout(2000)

    // 1. 打开自定义面板 + 点开一个组件编辑器（触发 customEditorOpen=true）
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await page.waitForTimeout(1500)
    const firstComponent = editor.locator('.script-editor-custom-panel__item').first()
    await firstComponent.waitFor({ timeout: 10000 })
    await firstComponent.click()
    await page.waitForTimeout(2000)
    // 确认组件编辑器覆盖层出现
    await expect(editor.locator('[data-testid="custom-component-editor"]')).toBeVisible()

    // 2. 切换到脚本列表，打开另一个脚本
    await clickReady(page, editor.getByRole('button', { name: '脚本' }))
    await page.waitForTimeout(1500)
    await clickReady(page, editor.getByRole('button', { name: 'E2E脚本B.js' }).first())
    await page.waitForTimeout(2000)

    // 3. 组件编辑器覆盖层应已关闭（customEditorOpen 重置为 false）
    await expect(
      editor.locator('[data-testid="custom-component-editor"]'),
      '切换脚本后自定义组件编辑器覆盖层应关闭'
    ).toHaveCount(0)

    // 4. 脚本内容应可见（代码视图或画布，而非组件编辑器）
    // legacy 纯代码脚本 → ScriptCodePanel（data-testid=script-code-panel）可见
    const codePanelVisible = await editor.locator('[data-testid="script-code-panel"]').first().isVisible().catch(() => false)
    const canvasVisible = await editor.locator('[data-testid="graph-canvas"]').first().isVisible().catch(() => false)
    expect(codePanelVisible || canvasVisible, '脚本画布/代码视图应可见（非被组件编辑器覆盖）').toBe(true)
  })
})
