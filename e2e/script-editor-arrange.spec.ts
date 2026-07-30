import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 脚本编辑器自动排版：
 * 加多个节点 → 点「自动排版」→ 节点仍在、id 不变、坐标有变化。
 */
test.describe('脚本编辑器自动排版', () => {
  test('画布工具栏自动排版重排节点位置', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 打开组件库：默认展开输入类，再展开转换类，添加两个节点
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    await clickReady(page, editor.locator('[data-node-key="input-serial"]'))
    await clickReady(page, editor.getByText('转换类', { exact: true }))
    await clickReady(page, editor.locator('[data-node-key="transform-hex"]'))

    const nodes = editor.locator('[data-testid="node"]')
    await expect(nodes).toHaveCount(2, { timeout: 10000 })

    const before = await nodes.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        id: el.getAttribute('data-node-id') || '',
        key: el.getAttribute('data-node-key') || '',
        x: Math.round(rect.left),
        y: Math.round(rect.top)
      }
    }))
    expect(before.every((item) => item.id)).toBe(true)

    await clickReady(page, editor.getByTestId('auto-arrange'))

    // 节点数量与 id 保持不变
    await expect(nodes).toHaveCount(2)
    const after = await nodes.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        id: el.getAttribute('data-node-id') || '',
        key: el.getAttribute('data-node-key') || '',
        x: Math.round(rect.left),
        y: Math.round(rect.top)
      }
    }))

    expect(after.map((item) => item.id).sort()).toEqual(before.map((item) => item.id).sort())
    expect(after.map((item) => item.key).sort()).toEqual(before.map((item) => item.key).sort())

    // 至少一个节点屏幕位置发生变化（ELK 重排 + fitView）
    const moved = after.some((item) => {
      const prev = before.find((entry) => entry.id === item.id)
      return !!prev && (prev.x !== item.x || prev.y !== item.y)
    })
    expect(moved).toBe(true)
  })
})
