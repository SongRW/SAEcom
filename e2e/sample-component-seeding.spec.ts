/**
 * 内置示例组件 seeding E2E：app 启动后 3 个示例自定义组件应自动出现在
 * userData/script-components/ 且在脚本编辑器调色板可见。
 *
 * 覆盖修复：「组件看不到 / 画布看不到」根因是 shared/samples/components/*.json
 * 此前从未被 seed 到 userData，导致 customComponents.list() 空 → nodeRegistry 无自定义组件 →
 * 调色板与组件面板都看不到。
 */
import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

test.describe('内置示例组件 seeding', () => {
  test('启动后示例组件自动 seed 到 userData 且调色板可见', async ({ page }) => {
    // 1. 启动后（隔离 userData）经 IPC 确认 3 个示例组件已被 seed
    const seeded = await page.evaluate(async () => {
      const api = (window as unknown as {
        api: { customComponents: { list: () => Promise<string[]> } }
      }).api
      return api.customComponents.list()
    })

    // 3 个示例组件应自动出现（seeding 在 app whenReady 触发）
    expect(seeded, `应含 3 个示例组件，实际: ${JSON.stringify(seeded)}`).toContain('custom-time-convert.json')
    expect(seeded).toContain('custom-geo-convert.json')
    expect(seeded).toContain('custom-aes-crypto.json')

    // 2. 打开脚本编辑器 → 调色板（自定义分组）应出现这些组件
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    const searchInput = editor.getByLabel('搜索组件')

    // 搜索每个示例组件，确认调色板可见（nodeRegistry 已加载它们）
    for (const key of ['custom-time-convert', 'custom-geo-convert', 'custom-aes-crypto']) {
      await searchInput.fill(key)
      await expect(
        editor.locator(`[data-node-key="${key}"]`),
        `${key} 应在调色板可见（经 seeding + loadAndRegisterCustomComponents 注册）`
      ).toBeVisible({ timeout: 15000 })
    }
  })
})
