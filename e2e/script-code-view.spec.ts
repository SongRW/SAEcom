import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 纯代码脚本在脚本页必须能「渲染」出来（不再是空白画布）。
 * 流程：写入无流程图标记的 .js → 打开脚本列表 → 选中 → 断言源码面板可见。
 */
test.describe('脚本页纯代码视图', () => {
  test('打开无流程图标记的脚本显示源码面板', async ({ page }) => {
    const sampleName = 'E2E纯代码视图.js'
    const sampleCode = [
      '// e2e pure code sample',
      'console.log("PURE_CODE_VIEW_OK");',
      'console.log("DONE=1");'
    ].join('\n')

    // 1) 通过 IPC 写入 userData/scripts（与 seedSampleScripts 同目录）
    await page.evaluate(async ({ name, content }) => {
      const api = (window as any).api
      await api.scripts.write(name, content)
    }, { name: sampleName, content: sampleCode })

    // 2) 打开脚本编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 3) 脚本列表 → 选中刚写入的纯代码脚本
    await clickReady(page, editor.getByRole('button', { name: '脚本' }))
    await clickReady(page, editor.getByRole('button', { name: sampleName }))

    // 4) 源码面板应渲染，并含源码正文
    const codePanel = editor.getByTestId('script-code-panel')
    await expect(codePanel).toBeVisible({ timeout: 10000 })
    await expect(codePanel.getByText('纯代码', { exact: true })).toBeVisible()
    const codeEditor = editor.getByTestId('script-code-editor')
    await expect(codeEditor).toBeVisible()
    await expect(codeEditor).toHaveValue(/PURE_CODE_VIEW_OK/)
    await expect(codeEditor).toHaveValue(/DONE=1/)
  })

  test('纯代码脚本可切换到画布并切回源码', async ({ page }) => {
    const sampleName = 'E2E切换画布.js'
    const sampleCode = [
      '// e2e pure code sample for view switch',
      'console.log("VIEW_SWITCH_OK");'
    ].join('\n')

    await page.evaluate(async ({ name, content }) => {
      const api = (window as any).api
      await api.scripts.write(name, content)
    }, { name: sampleName, content: sampleCode })

    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    await clickReady(page, editor.getByRole('button', { name: '脚本' }))
    await clickReady(page, editor.getByRole('button', { name: sampleName }))

    const codePanel = editor.getByTestId('script-code-panel')
    await expect(codePanel).toBeVisible({ timeout: 10000 })

    // 源码面板「显示画布」→ 切到画布视图（空画布）
    await clickReady(page, editor.getByTestId('show-canvas-view'))
    const canvasShell = editor.locator('.script-editor-canvas-shell')
    await expect(canvasShell).toBeVisible({ timeout: 10000 })
    // 此时源码面板应隐藏
    await expect(editor.getByTestId('script-code-panel')).toHaveCount(0)
    // 画布工具栏出现「查看源码」入口（hasLegacyCode）
    await expect(editor.getByTestId('show-code-view')).toBeVisible()

    // 回切源码
    await clickReady(page, editor.getByTestId('show-code-view'))
    await expect(editor.getByTestId('script-code-panel')).toBeVisible({ timeout: 10000 })
    const codeEditor = editor.getByTestId('script-code-editor')
    await expect(codeEditor).toHaveValue(/VIEW_SWITCH_OK/)
  })
})
