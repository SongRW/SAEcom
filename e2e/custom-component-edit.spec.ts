/**
 * 自定义组件编辑 E2E：
 * - 「自定义」面板列出示例组件，名字正确（用 descriptor.name，非 .json 文件名）
 * - 点开 JS 组件（custom-time-convert）→ 编辑器渲染、不崩溃
 * - 点开 composite 组件 → 编辑器不崩溃（回归：此前 form.sandboxApis.join 空白崩溃）
 */
import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

async function openCustomPanel(page: import('@playwright/test').Page) {
  await openNavPage(page, NAV.pageScript)
  await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
  const editor = page.getByRole('dialog', { name: '脚本编辑器' })
  await editor.waitFor()
  await page.waitForTimeout(2500)
  await clickReady(page, editor.getByRole('button', { name: '自定义' }))
  await page.waitForTimeout(2000)
  return editor
}

test.describe('自定义组件编辑（JS + composite 不崩溃）', () => {
  test('自定义面板名字正确（用 descriptor.name 非 .json）', async ({ page }) => {
    const editor = await openCustomPanel(page)
    // 3 个示例组件名字应是中文名（descriptor.name），非 custom-xxx.json
    await expect(editor.locator('.script-editor-custom-panel__item').filter({ hasText: '转时间' })).toBeVisible()
    await expect(editor.locator('.script-editor-custom-panel__item').filter({ hasText: '转经纬度' })).toBeVisible()
    await expect(editor.locator('.script-editor-custom-panel__item').filter({ hasText: 'AES 加密' })).toBeVisible()
  })

  test('点开 JS 组件（custom-time-convert）不崩溃', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    const editor = await openCustomPanel(page)
    await editor.locator('.script-editor-custom-panel__item').filter({ hasText: '转时间' }).first().click()
    await page.waitForTimeout(2500)

    expect(await editor.isVisible(), '点开 JS 组件后编辑器应可见').toBe(true)
    await expect(editor.locator('[data-testid="cc-config-drawer"]')).toBeVisible()
    expect(errors, `不应有 pageerror: ${errors.join('; ')}`).toHaveLength(0)
  })

  test('点开 composite 组件不崩溃（回归 form.sandboxApis.join 空白）', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    // 预植入一个 composite（无 emit/sandboxApis，触发回归路径）
    await page.evaluate(async () => {
      const composite = {
        key: 'custom-e2e-composite',
        name: 'E2E组合',
        inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
        outputs: [{ key: 'out', socket: 'dataSocket', label: '输出' }],
        subgraph: { nodes: [{ id: 'n1', key: 'transform-encoding', data: { from: 'utf8', to: 'gbk' } }], connections: [] },
        inputBindings: [{ portKey: 'in', nodeId: 'n1', nodePortKey: 'in' }],
        outputBindings: [{ portKey: 'out', nodeId: 'n1', nodePortKey: 'out' }]
      }
      await (window as any).api.customComponents.write('custom-e2e-composite.json', JSON.stringify(composite, null, 2))
    })

    const editor = await openCustomPanel(page)
    await editor.locator('.script-editor-custom-panel__item').filter({ hasText: 'E2E组合' }).first().click()
    await page.waitForTimeout(2500)

    expect(await editor.isVisible(), '点开 composite 后编辑器应可见（不空白）').toBe(true)
    expect(errors, `不应有 pageerror: ${errors.join('; ')}`).toHaveLength(0)
  })
})
