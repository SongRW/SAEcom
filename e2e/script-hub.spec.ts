import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 回归：主页脚本功能区（ScriptHub）。
 *
 * 背景：此前 activeTab === 'script' 时主页仅一个居中的图标 + 「打开脚本编辑器」按钮，
 * 大量空白、功能区未被利用。组7 加入自定义组件/搜索后，脚本能力显著增长，主页应作为
 * 启动台 / 概览页：统计卡片 + 脚本列表 + 组件库列表 + 主操作入口。
 */
test.describe('主页脚本功能区 (ScriptHub)', () => {
  test('脚本页顶部工具条单排四控件 + 双栏列表，主按钮可打开编辑器', async ({ page }) => {
    // 预置一个脚本，让脚本列表非空（验证列表渲染 + IPC 拉取链路）
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.scripts.write('E2E主页脚本.js', [
        '// e2e: 主页脚本列表展示用',
        'console.log("HUB_OK");'
      ].join('\n'))
    })

    await openNavPage(page, NAV.pageScript)
    const hub = page.locator('.script-hub')
    await expect(hub).toBeVisible()

    // 顶部工具条：2 个统计 chip + 2 个按钮（打开脚本编辑器 / 创建自定义组件）
    const toolbar = hub.locator('.script-hub__toolbar')
    await expect(toolbar).toBeVisible()
    await expect(toolbar.locator('.script-hub__chip')).toHaveCount(2)
    await expect(toolbar.getByRole('button', { name: '打开脚本编辑器' })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: '创建自定义组件' })).toBeVisible()
    // 说明文字已移除：副标题与底部 hint 不应出现
    await expect(hub.locator('.script-hub__subtitle')).toHaveCount(0)
    await expect(hub.locator('.script-hub__footer')).toHaveCount(0)

    // 工具条四个控件垂直居中处于同一行（最高项的 top 与其余项 top 接近）
    const chips = toolbar.locator('.script-hub__chip')
    const btns = toolbar.getByRole('button')
    const chip0Box = await chips.nth(0).boundingBox()
    const openBtnBox = await btns.filter({ hasText: '打开脚本编辑器' }).boundingBox()
    const createBtnBox = await btns.filter({ hasText: '创建自定义组件' }).boundingBox()
    expect(chip0Box, '工具条首项应有 boundingBox').not.toBeNull()
    expect(openBtnBox, '打开按钮应有 boundingBox').not.toBeNull()
    expect(createBtnBox, '创建按钮应有 boundingBox').not.toBeNull()
    // 同一行的判据：四项垂直中心差距不超过各自高度的一半
    const rowTolerance = Math.max(chip0Box!.height, openBtnBox!.height) / 2
    expect(Math.abs((chip0Box!.y + chip0Box!.height / 2) - (openBtnBox!.y + openBtnBox!.height / 2)))
      .toBeLessThanOrEqual(rowTolerance)
    expect(Math.abs((chip0Box!.y + chip0Box!.height / 2) - (createBtnBox!.y + createBtnBox!.height / 2)))
      .toBeLessThanOrEqual(rowTolerance)

    // 双栏列表保留
    await expect(hub.locator('.script-hub__panel')).toHaveCount(2)
    await expect(hub.getByText('E2E主页脚本.js')).toBeVisible()

    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    await expect(page.getByRole('dialog', { name: '脚本编辑器' })).toBeVisible()
  })

  test('点击脚本列表项会打开并载入对应脚本', async ({ page }) => {
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.scripts.write('E2E列表项打开.js', '// e2e list selection\nconsole.log("SCRIPT_HUB_SELECTED")')
    })

    await openNavPage(page, NAV.pageScript)
    const hub = page.locator('.script-hub')
    await expect(hub).toBeVisible()

    await clickReady(page, hub.getByRole('button', { name: 'E2E列表项打开.js' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()
    await expect(editor.locator('.script-editor-current')).toHaveText('E2E列表项打开.js')
  })

  test('点击组件列表项会打开自定义组件管理面板', async ({ page }) => {
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.customComponents.write('custom-e2e-hub.json', JSON.stringify({
        key: 'custom-e2e-hub',
        name: 'E2E主页组件',
        description: '主页组件库入口测试',
        category: 'custom',
        inputs: [],
        outputs: [],
        controls: [],
        sandboxApis: [],
        emit: 'return ""'
      }))
    })

    await openNavPage(page, NAV.pageScript)
    const hub = page.locator('.script-hub')
    await expect(hub).toBeVisible()
    await clickReady(page, hub.getByRole('button', { name: 'custom-e2e-hub.json' }))

    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()
    await expect(editor.getByLabel('自定义组件列表')).toBeVisible()
  })
})

  test('编辑器增删组件后主页统计刷新（refreshKey 驱动）', async ({ page }) => {
    // 清空已有测试组件，确保初始为 0
    await page.evaluate(async () => {
      const api = (window as any).api
      const names = await api.customComponents.list()
      for (const n of names) await api.customComponents.delete(n)
    })

    await openNavPage(page, NAV.pageScript)
    const hub = page.locator('.script-hub')
    await expect(hub).toBeVisible()
    // 初始组件数 = 0（chip 显示「内置 + 0」）
    const componentsChip = hub.locator('.script-hub__chip').nth(1).locator('.script-hub__chip-value')
    await expect.poll(async () => await componentsChip.textContent(), { timeout: 10000 }).toContain('+ 0')

    // 打开编辑器，写一个组件
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.customComponents.write('custom-hub-refresh.json', JSON.stringify({
        key: 'custom-hub-refresh',
        name: '刷新测试',
        category: 'custom',
        inputs: [{ key: 'in', socket: 'dataSocket' }],
        outputs: [{ key: 'out', socket: 'dataSocket' }],
        controls: [],
        sandboxApis: [],
        emit: "return indent + 'var ' + helpers.outVar(node) + ' = ' + helpers.getInputVar(ctx, node) + ';\n'"
      }))
    })

    // 关闭编辑器 → 主页刷新，组件数 = 1
    await clickReady(page, page.getByRole('button', { name: '关闭' }))
    await expect.poll(async () => await componentsChip.textContent(), { timeout: 10000 }).toContain('+ 1')

    // 清理
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.customComponents.delete('custom-hub-refresh.json')
    })
  })
