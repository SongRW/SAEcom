import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 自定义 JS 组件端到端：预植入一个合法组件 → 调色板出现 → 拖入画布。
 *
 * 覆盖组5-7 的核心契约：动态注册表 + UserNodeComponent + 自定义面板加载 + IPC 持久化。
 * Monaco 编辑器另有生产离线回归：断言本地 worker、可编辑状态与无 CDN 请求。
 */
test.describe('自定义 JS 组件', () => {
  test('预植入组件 → 调色板与画布可见', async ({ page }) => {
    // 经渲染层 window.api.customComponents.write 写入一个合法的 JS 组件描述符（透传节点）
    const descriptor = {
      key: 'custom-e2e-passthrough',
      name: 'E2E透传',
      description: '端到端测试用透传组件',
      category: 'custom',
      inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
      outputs: [{ key: 'out', socket: 'dataSocket', label: '输出' }],
      controls: [],
      sandboxApis: [],
      emit: 'return indent + "var " + helpers.outVar(node) + " = " + helpers.getInputVar(ctx, node) + ";" + String.fromCharCode(10)'
    }
    await openNavPage(page, NAV.pageScript)
    const writeResult = await page.evaluate(async (payload) => {
      const api = (window as unknown as {
        api: { customComponents: {
          write: (n: string, c: string) => Promise<{ ok: boolean }>
          list: () => Promise<string[]>
        } }
      }).api
      const res = await api.customComponents.write('custom-e2e-passthrough.json', JSON.stringify(payload, null, 2))
      const names = await api.customComponents.list()
      return { writeOk: res.ok, listed: names }
    }, descriptor)
    expect(writeResult.writeOk, '自定义组件写入应成功').toBe(true)
    expect(writeResult.listed, '列表应含刚写入的组件').toContain('custom-e2e-passthrough.json')

    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 打开「组件」侧栏 → 用搜索定位自定义组件（搜索扁平化结果，不依赖分组展开）
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    const searchInput = editor.getByLabel('搜索组件')
    await searchInput.fill('custom-e2e-passthrough')
    // 编辑器打开时 loadAndRegisterCustomComponents 已注册该组件；搜索应命中
    await expect(editor.locator('[data-node-key="custom-e2e-passthrough"]')).toBeVisible({ timeout: 15000 })

    // 点击该自定义组件 → 添加到画布
    await clickReady(page, editor.locator('[data-node-key="custom-e2e-passthrough"]'))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(1, { timeout: 10000 })
  })

  test('组件编辑器为画布壳内嵌视图（非 Dialog），Monaco 主区 + 配置 drawer 可关闭', async ({ page }) => {
    // 回归（A 层重构）：编辑器不再弹 Dialog，改为画布壳内嵌（与 ScriptCodePanel 同模式）。
    // 上下文条 + Monaco 主区 + 右侧 384px 配置 drawer（可收起）。
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 打开「自定义」侧栏面板 → 点「新建 JS 组件」→ 画布壳内嵌编辑器
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await clickReady(page, editor.getByRole('button', { name: '新建 JS 组件' }))
    const ccEditor = page.locator('[data-testid="custom-component-editor"]')
    await expect(ccEditor).toBeVisible()

    // 不再是弹窗：编辑器内嵌在画布壳里（父级是 .script-editor-canvas-shell）
    await expect(ccEditor.locator('xpath=ancestor::*[contains(@class,"script-editor-canvas-shell")]')).toHaveCount(1)
    // 不应存在弹窗 role=dialog 的新建 JS 组件容器
    await expect(page.getByRole('dialog', { name: '新建 JS 组件' })).toHaveCount(0)

    // 上下文条 + Monaco 主区 + 配置 drawer
    await expect(ccEditor.locator('.custom-component-editor__ctxbar')).toBeVisible()
    await expect(ccEditor.locator('.custom-component-editor__code')).toBeVisible()
    const drawer = ccEditor.locator('[data-testid="cc-config-drawer"]')
    await expect(drawer).toBeVisible()
    const drawerBox = await drawer.boundingBox()
    expect(drawerBox!.width, '配置 drawer 宽度应 ≈ 384px').toBeGreaterThanOrEqual(380)

    // 收起 drawer → 宽度归 0（主区自动占满）
    await clickReady(page, ccEditor.locator('[data-testid="cc-toggle-config"]'))
    await expect.poll(async () => (await drawer.boundingBox())?.width ?? 999, { timeout: 5000 }).toBeLessThan(4)
    const monacoBox = await ccEditor.locator('.custom-component-editor__code').boundingBox()
    expect(monacoBox!.width, '收起后 Monaco 主区占满').toBeGreaterThan(800)

    // 返回画布
    await clickReady(page, ccEditor.locator('[data-testid="cc-back-canvas"]'))
    await expect(page.locator('.script-editor-canvas__surface')).toBeVisible()
  })

  test('试编译结果为底部面板（非 Dialog），Monaco 固定高度', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await clickReady(page, editor.getByRole('button', { name: '新建 JS 组件' }))

    const componentEditor = page.locator('[data-testid="custom-component-editor"]')
    await componentEditor.getByPlaceholder('custom-my-component').fill('custom-preview-height')
    await componentEditor.getByPlaceholder('例如：加前缀').fill('预览高度测试')
    await clickReady(page, componentEditor.locator('[data-testid="cc-try-compile"]'))

    // 试编译结果是画布壳内底部面板，不再是弹窗
    const preview = page.locator('[data-testid="cc-preview-panel"]')
    await expect(preview).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('dialog', { name: '试编译结果（mock emit 产出）' })).toHaveCount(0)
    const previewMonaco = preview.locator('.monaco-editor')
    await expect(previewMonaco).toBeVisible({ timeout: 15000 })
    await expect.poll(async () => (await previewMonaco.boundingBox())?.height ?? 0, { timeout: 15000 })
      .toBeGreaterThan(200)
  })

  test('生产版从本地资源加载可编辑 Monaco，且不访问 CDN', async ({ page }) => {
    const externalRequests: string[] = []
    const workerUrls: string[] = []
    await page.route(/^https?:\/\//, async (route) => {
      externalRequests.push(route.request().url())
      await route.abort()
    })
    page.on('worker', (worker) => workerUrls.push(worker.url()))

    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await clickReady(page, editor.getByRole('button', { name: '新建 JS 组件' }))

    const ccEditor = page.locator('[data-testid="custom-component-editor"]')
    const monaco = ccEditor.locator('.custom-component-editor__code .monaco-editor')
    await expect(monaco).toBeVisible({ timeout: 15000 })
    const monacoBox = await monaco.boundingBox()
    expect(monacoBox, 'Monaco 编辑器应有 boundingBox').not.toBeNull()
    await expect.poll(async () => (await monaco.boundingBox())?.height ?? 0, { timeout: 15000 })
      .toBeGreaterThan(200)
    await expect(ccEditor.getByText('Loading...', { exact: true })).toHaveCount(0)

    const input = monaco.getByRole('textbox', { name: 'Editor content' })
    await expect(input).toBeEditable()
    await monaco.locator('.view-lines').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\n// LOCAL_MONACO_E2E_READY')
    await expect(monaco.locator('.view-lines')).toContainText('LOCAL_MONACO_E2E_READY')

    await expect.poll(() => workerUrls.length, { timeout: 15000 }).toBeGreaterThan(0)
    expect(workerUrls.some((url) => /^https?:/i.test(url))).toBe(false)
    expect(externalRequests).toEqual([])
  })
})

test.describe('组合组件（C 层：子画布编辑器）', () => {
  test('组合模式添加节点 + 绑定端口 + 保存 → 调色板出现组合组件', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await clickReady(page, editor.getByRole('button', { name: '新建 JS 组件' }))

    const ccEditor = page.locator('[data-testid="custom-component-editor"]')
    // key / 名称（组合组件 key 必须合法）
    await ccEditor.getByPlaceholder('custom-my-component').fill('custom-e2e-composite')
    await ccEditor.getByPlaceholder('例如：加前缀').fill('E2E组合')

    // 切到组合连线模式（复用 GraphCanvas）
    await clickReady(page, ccEditor.locator('[data-testid="cc-mode-compose"]'))
    await expect(ccEditor.locator('[data-testid="cc-compose-pane"]')).toBeVisible()

    // 右键子画布 → 打开组件树 → 搜索并添加节点（复用主画布组件库）
    const subCanvas = ccEditor.locator('[data-testid="cc-compose-pane"] .script-editor-canvas__surface')
    await subCanvas.click({ button: 'right' })
    await clickReady(page, page.getByRole('menuitem', { name: '打开组件树' }))
    // 侧栏出现，搜索转换类节点
    const subSearch = ccEditor.locator('[data-testid="cc-compose-pane"]').getByLabel('搜索组件')
    await subSearch.fill('HEX转换')
    await clickReady(page, ccEditor.locator('[data-testid="cc-compose-pane"] [data-node-key="transform-hex"]'))
    await page.waitForTimeout(400)
    // 子图出现节点（GraphCanvas 渲染 [data-testid="node"]）
    await expect(ccEditor.locator('[data-testid="cc-compose-pane"] [data-testid="node"]')).toHaveCount(1, { timeout: 10000 })

    // 端口绑定在右侧 drawer 下拉（节点 id 由 GraphCanvas 生成，取第一个节点的绑定下拉）
    const firstNodeId = await ccEditor.locator('[data-testid="cc-compose-pane"] [data-testid="node"]').first().getAttribute('data-node-id')
    // 输入绑定：选外部 in（转换类节点有输入端口）
    await ccEditor.locator(`[data-testid="composite-in-${firstNodeId}"]`).click()
    await page.getByRole('option', { name: /外部 in/ }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    // 输出绑定：选外部 out
    await ccEditor.locator(`[data-testid="composite-out-${firstNodeId}"]`).click()
    await page.getByRole('option', { name: /外部 out/ }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)

    // 试编译（组合模式）：底部面板出现 IIFE 代码
    await clickReady(page, ccEditor.locator('[data-testid="cc-try-compile"]'))
    const compositePreview = page.locator('[data-testid="cc-preview-panel"]')
    await expect(compositePreview).toBeVisible({ timeout: 15000 })
    await expect(compositePreview.locator('.monaco-editor .view-lines')).toContainText('async () =>')

    // 保存 → 返回画布 + toast
    await clickReady(page, ccEditor.locator('[data-testid="cc-save"]'))
    await expect(page.locator('.script-editor-canvas__surface')).toBeVisible({ timeout: 10000 })

    // 调色板出现组合组件（加载注册链：write → loadAndRegisterCustomComponents）
    await clickReady(page, editor.getByRole('button', { name: '组件' }))
    const searchInput = editor.getByLabel('搜索组件')
    await searchInput.fill('custom-e2e-composite')
    await expect(editor.locator('[data-node-key="custom-e2e-composite"]')).toBeVisible({ timeout: 15000 })

    // 清理：删除测试组件（避免污染后续测试）
    await clickReady(page, editor.getByRole('button', { name: '自定义' }))
    await page.evaluate(async () => {
      const api = (window as any).api
      await api.customComponents.delete('custom-e2e-composite.json')
    })
  })
})
