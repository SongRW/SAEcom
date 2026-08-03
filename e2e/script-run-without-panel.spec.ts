import { test, expect, NAV, openNavPage, clickReady } from './fixtures'

/**
 * 回归：未建立面板时，脚本编辑器里的脚本（不依赖面板的纯代码脚本）必须能直接运行，
 * 不再被前置拦截弹出「请先选择一个面板（在工作区点击面板）」。
 *
 * 背景：runScript() 此前无条件要求 currentPanelId 非空，导致刚装软件、尚未建面板的
 * 用户即便只想跑一个纯 console.log / TCP / sleep 脚本也会被一刀切拦死。修复后面板
 * 变为可选，仅当脚本实际用到隐式 send()/waitOnePacket()/listenCurrentPackets()
 *（默认作用在当前面板）时才会在运行期给清晰错误。
 */
test.describe('无面板运行脚本', () => {
  test('未建面板时纯代码脚本可直接运行，不弹拦截 toast', async ({ page }) => {
    const sampleName = 'E2E无面板运行.js'
    // 纯代码脚本：仅用 console.log + sleep，完全不依赖面板（无 send/waitOnePacket 等
    // 隐式面板 API）。此前会被 runScript() 的「无面板即拦截」前置门挡下。
    const sampleCode = [
      '// e2e: 不依赖面板的纯代码脚本',
      'console.log("NO_PANEL_RUN_OK");',
      'await sleep(300);',
      'console.log("NO_PANEL_RUN_DONE");'
    ].join('\n')

    // 1) 通过 IPC 写入脚本
    await page.evaluate(async ({ name, content }) => {
      const api = (window as any).api
      await api.scripts.write(name, content)
    }, { name: sampleName, content: sampleCode })

    // 2) 打开脚本编辑器（全新 userData，尚未建立任何面板）
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 选中刚写入的纯代码脚本
    await clickReady(page, editor.getByRole('button', { name: '脚本' }))
    await clickReady(page, editor.getByRole('button', { name: sampleName }))

    // 3) 展开输出 dock 以便读取运行日志
    await clickReady(page, editor.getByRole('button', { name: '输出' }))
    const body = editor.getByTestId('script-output-body')
    await expect(body).toBeVisible()

    // 4) 点「运行」（用 title 精确定位工具栏运行按钮，避免与侧栏/列表里同名文本歧义）
    await clickReady(page, editor.locator('button[title="运行"]'))

    // 5) 断言：脚本启动并跑完。这些只有在 runScript() 未被前置拦截、真正执行到
    //    clearOutput()/run()/onEnded 时才会出现：
    //    - [开始运行...]：host 在调用 run() 前直接 append（不过滤 runId）
    //    - [完成]：来自 scripts.onEnded（不过滤 runId）
    //    不断言 console.log 的日志行：超短脚本的 scripts:log 可能因 runningScriptIdRef
    //    尚未更新而被 onLog 过滤（既有行为，与本次拦截修复无关）。
    await expect(body).toContainText('[开始运行...]', { timeout: 10000 })
    await expect(body).toContainText('[完成]', { timeout: 10000 })

    // 6) 回归核心：旧的拦截 toast 不应出现
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: '请先选择一个面板' })
    ).toHaveCount(0)
  })
})
