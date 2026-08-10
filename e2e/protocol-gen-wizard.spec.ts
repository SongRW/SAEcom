/**
 * 协议生成向导（pi agent 式会话）E2E。
 *
 * 覆盖用户可见行为（AGENTS.md 硬性要求）：
 * - 工具栏「AI 生成协议」入口打开向导
 * - 向导占满画布壳（protocolGenOpen 最高优先级分支）
 * - 输入协议描述 → 看到流式字段卡片 + 工具日志
 * - 往返验证通过 → verified 徽标 + 应用按钮可用
 * - 应用 → 画布出现节点 + 关闭向导
 * - 模板路径（确定性，不依赖启发式歧义分叉）
 *
 * 选模板路径做主路径：确定性最高，不受启发式分叉影响。
 */
import { test, expect, NAV, openNavPage, clickReady, fillPromptAndSubmit } from './fixtures'

test.describe('协议生成向导', () => {
  test('选模板 → 验证 → 应用到画布', async ({ page }) => {
    // 1) 切「脚本」页 → 打开编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 2) 点击工具栏「AI 生成协议」按钮
    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))

    // 3) 向导占满画布壳（最高优先级分支）
    const wizard = editor.getByTestId('protocol-gen-wizard')
    await expect(wizard).toBeVisible()
    // 上下文条可见
    await expect(editor.getByTestId('protocol-gen-ctxbar')).toBeVisible()
    // 输入区可见（idle 阶段）
    await expect(editor.getByTestId('pg-input-section')).toBeVisible()

    // 4) 选「简单定长协议」模板（确定性路径，不触发歧义分叉）
    await clickReady(page, editor.getByTestId('pg-template-simple'))

    // 5) 提交开始解析
    await clickReady(page, editor.getByTestId('pg-submit'))

    // 6) 流式叙述区出现产物卡（artifact_ready）
    await expect(editor.getByTestId('artifact-ready')).toBeVisible({ timeout: 10000 })

    // 7) 往返验证通过 → verified 徽标 + ready 操作条出现（显著引导，非仅 ctxbar 按钮）
    await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 15000 })
    const readyBar = editor.getByTestId('pg-ready-bar')
    await expect(readyBar).toBeVisible({ timeout: 5000 })

    // 8) 点 ready 条的「应用到画布」→ 灌画布
    await clickReady(page, editor.getByTestId('pg-ready-apply'))

    // 9) 向导关闭 + 画布出现节点（SIMPLE_PROTOCOL_DSL 含 magic/deviceId/payload/crc → 多个节点）
    await expect(wizard).not.toBeVisible({ timeout: 5000 })
    // 等 Rete 同步完成（节点是异步 sync 到 DOM 的，且向导关闭后 GraphCanvas 重新挂载）
    await expect(async () => {
      const count = await editor.locator('[data-testid="node"]').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 15000 })

    // 10) 节点必须在画布视口内可见（不是在屏外看不见）。
    // 断言：每个节点 DOM 的 boundingBox 与画布视口有交集（fitView 后应全部入框）。
    await page.waitForTimeout(800) // 等 fitView 双 rAF + transform 落地
    await expect(async () => {
      const canvasBox = await editor.locator('.script-editor-canvas').boundingBox()
      const nodes = editor.locator('[data-testid="node"]')
      const nodeCount = await nodes.count()
      expect(nodeCount).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < Math.min(nodeCount, 3); i++) {
        const nodeBox = await nodes.nth(i).boundingBox()
        // 节点 boundingBox 存在且与画布有交集（允许部分出界，但不能完全在屏外）
        expect(nodeBox, `节点 ${i} 无 boundingBox`).not.toBeNull()
        if (!canvasBox || !nodeBox) continue
        const overlaps = nodeBox.x < canvasBox.x + canvasBox.width
          && nodeBox.x + nodeBox.width > canvasBox.x
          && nodeBox.y < canvasBox.y + canvasBox.height
          && nodeBox.y + nodeBox.height > canvasBox.y
        expect(overlaps, `节点 ${i} 在画布视口外（nodeBox=${JSON.stringify(nodeBox)}, canvasBox=${JSON.stringify(canvasBox)}）`).toBe(true)
      }
    }).toPass({ timeout: 10000 })
  })

  test('应用后落盘持久化：关闭重开仍能看到节点', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 新建一个脚本作为应用目标（向导需要 activeScriptName 才能自动保存）
    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    const createDialog = page.getByRole('dialog', { name: '新建脚本' })
    await createDialog.waitFor()
    await fillPromptAndSubmit(page, createDialog, 'ProtoGenPersist')
    await page.waitForTimeout(500)

    // 打开向导 → 选模板 → 验证 → 应用
    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    await clickReady(page, editor.getByTestId('pg-template-simple'))
    await clickReady(page, editor.getByTestId('pg-submit'))
    await expect(editor.getByTestId('artifact-ready')).toBeVisible({ timeout: 10000 })
    await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 15000 })
    await clickReady(page, editor.getByTestId('pg-ready-apply'))

    // 应用后节点出现（有 activeScriptName 时自动保存到磁盘）
    await expect(async () => {
      const count = await editor.locator('[data-testid="node"]').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 15000 })

    // 关闭脚本编辑器
    await clickReady(page, editor.getByRole('button', { name: '关闭' }))
    await expect(editor).not.toBeVisible({ timeout: 5000 })

    // 重新打开脚本编辑器 → 从脚本列表选中刚保存的脚本 → 节点应仍在（从磁盘读回）
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor2 = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor2.waitFor()
    // 打开脚本列表，选中刚保存的脚本（重开后画布为空，需主动加载）
    await clickReady(page, editor2.getByRole('button', { name: '脚本页' }))
    const scriptList = editor2.locator('.script-editor-list__items')
    await clickReady(page, scriptList.getByRole('button', { name: 'ProtoGenPersist.js', exact: true }))
    await page.waitForTimeout(1500)

    // 节点持久化：从磁盘读回后仍能看到
    await expect(async () => {
      const count = await editor2.locator('[data-testid="node"]').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 15000 })
  })

  test('已有节点脚本上再次应用：节点被整体替换（防「应用后不显示需重开」回归）', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 建脚本 + 第一次应用（画布获得节点）
    await clickReady(page, editor.getByRole('button', { name: '新建' }))
    const createDialog = page.getByRole('dialog', { name: '新建脚本' })
    await createDialog.waitFor()
    await fillPromptAndSubmit(page, createDialog, 'ProtoGenApplyTwice')
    await page.waitForTimeout(500)

    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    await clickReady(page, editor.getByTestId('pg-template-simple'))
    await clickReady(page, editor.getByTestId('pg-submit'))
    await expect(editor.getByTestId('artifact-ready')).toBeVisible({ timeout: 10000 })
    await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 15000 })
    await clickReady(page, editor.getByTestId('pg-ready-apply'))
    await expect(async () => {
      const count = await editor.locator('[data-testid="node"]').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 15000 })
    const firstCount = await editor.locator('[data-testid="node"]').count()

    // 第二次应用：此时画布已有节点（向导重开 → GraphCanvas 卸载 → 应用 → 重挂 + 灌图）
    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    await clickReady(page, editor.getByTestId('pg-template-simple'))
    await clickReady(page, editor.getByTestId('pg-submit'))
    await expect(editor.getByTestId('artifact-ready')).toBeVisible({ timeout: 10000 })
    await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 15000 })
    await clickReady(page, editor.getByTestId('pg-ready-apply'))
    await expect(async () => {
      const count = await editor.locator('[data-testid="node"]').count()
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBe(firstCount)
    }).toPass({ timeout: 15000 })
  })

  test('返回画布按钮关闭向导', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    const wizard = editor.getByTestId('protocol-gen-wizard')
    await expect(wizard).toBeVisible()

    // 点「返回画布」
    await clickReady(page, editor.getByTestId('pg-back-canvas'))
    await expect(wizard).not.toBeVisible({ timeout: 5000 })
  })

  test('导入文档：本地 txt → agent:parseDocument → 描述框填充', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    const wizard = editor.getByTestId('protocol-gen-wizard')
    await expect(wizard).toBeVisible()

    // 临时文档：真实磁盘 txt（Electron 下 file.getPath 拿真实路径 → 主进程解析）
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const docDir = mkdtempSync(join(tmpdir(), 'saecom-e2e-doc-'))
    const docPath = join(docDir, '协议描述.txt')
    writeFileSync(docPath, '协议名：E2EDocProto\n帧头 AA55，字段：cmd(2字节hex)、seq(1字节uint)', 'utf8')
    try {
      await editor.getByTestId('pg-file-input').setInputFiles(docPath)
      // 描述框被填充（含协议名行）
      await expect(editor.getByTestId('pg-doc-input')).toHaveValue(/E2EDocProto/, { timeout: 10000 })
      await expect(editor.getByTestId('pg-doc-input')).toHaveValue(/AA55/)
    } finally {
      rmSync(docDir, { recursive: true, force: true })
    }
  })

  test('协议名 ASCII 纠正：中文名 → 错误徽标 + 建议 → 应用', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 走模板 → ready（名 SimpleProtocol，ASCII 徽标）
    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    await clickReady(page, editor.getByTestId('pg-template-simple'))
    await clickReady(page, editor.getByTestId('pg-submit'))
    await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 15000 })

    const nameInput = editor.getByTestId('pg-name-input')
    await expect(nameInput).toBeVisible()
    await expect(nameInput).toHaveValue('SimpleProtocol')

    // 改成中文名 → 错误徽标 + 建议按钮
    await nameInput.fill('设备信息')
    await nameInput.press('Enter')
    await expect(editor.getByTestId('pg-name-suggest')).toBeVisible({ timeout: 5000 })
    await expect(editor.getByText('名称需为 ASCII')).toBeVisible()

    // 采用建议 → 名变回 ASCII 且可应用
    await clickReady(page, editor.getByTestId('pg-name-suggest'))
    await expect(nameInput).toHaveValue('SIMPLE-PROTOCOL')
    await clickReady(page, editor.getByTestId('pg-ready-apply'))
    await expect(async () => {
      const count = await editor.locator('[data-testid="node"]').count()
      expect(count).toBeGreaterThanOrEqual(2)
    }).toPass({ timeout: 15000 })
  })

  test('写入知识库按钮：点击后叙述区出现反馈（不崩溃）', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    await clickReady(page, editor.getByTestId('pg-template-simple'))
    await clickReady(page, editor.getByTestId('pg-submit'))
    await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 15000 })

    // 点击写入知识库（构建产物无本地 CLI → 优雅降级错误；有 CLI → 真实写入）。
    // 两种结局都必须出现在叙述流里，且向导不崩溃、按钮恢复可用。
    const stream = editor.getByTestId('protocol-gen-stream')
    const before = await stream.textContent()
    await clickReady(page, editor.getByTestId('pg-write-knowledge'))
    await expect(async () => {
      const after = await stream.textContent()
      expect(after !== before).toBe(true)
      expect(after).toMatch(/知识库/)
    }).toPass({ timeout: 15000 })
    await expect(editor.getByTestId('pg-write-knowledge')).toBeEnabled({ timeout: 5000 })
  })

  test('定义组件：向导内嵌组件编辑器打开/返回', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
    const wizard = editor.getByTestId('protocol-gen-wizard')
    await expect(wizard).toBeVisible()

    // 打开内嵌组件编辑器（替换向导会话视图）
    await clickReady(page, editor.getByTestId('pg-define-component'))
    await expect(editor.getByTestId('custom-component-editor')).toBeVisible({ timeout: 5000 })
    await expect(wizard).not.toBeVisible()

    // 返回 → 回到向导
    await clickReady(page, editor.getByTestId('cc-back-canvas'))
    await expect(wizard).toBeVisible({ timeout: 5000 })
    await expect(editor.getByTestId('custom-component-editor')).not.toBeVisible()
  })

  test('设置功能区页 AI 与 Agent + 深度模式：配置 provider → 模型流式解析 → 应用', async ({ page }) => {
    // 本地 mock OpenAI 兼容端点（SSE 流式，逐 chunk 延迟制造流式窗口）
    const { createServer } = await import('node:http')
    const dslChunks = [
      '{"name":"MockSimple"',
      ',"fields":[',
      '{"kind":"const","name":"magic","value":"AA55","mode":"hex"},',
      '{"kind":"uint","name":"deviceId","width":1}',
      ']',
      ',"transport":{"mode":"tcp-loopback","port":9301}',
      ',"loop":{"count":1}}'
    ]
    const server = createServer((req, res) => {
      // GET /v1/models：探查模型列表
      if (req.method === 'GET' && req.url?.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ object: 'list', data: [
          { id: 'mock-pro-max', object: 'model' },
          { id: 'mock-pro-lite', object: 'model' },
          { id: 'mock-pro-mini', object: 'model' }
        ] }))
        return
      }
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        capturedBodies.push(body)
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const writeDelta = (delta: string) => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`)
        }
        if (body.includes('回复 ok')) {
          writeDelta('ok')
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }
        let i = 0
        const send = (): void => {
          if (i >= dslChunks.length) {
            res.write('data: [DONE]\n\n')
            res.end()
            return
          }
          writeDelta(dslChunks[i++])
          setTimeout(send, 150)
        }
        send()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as { port: number }).port
    const capturedBodies: string[] = []

    try {
      await openNavPage(page, NAV.pageScript)

      // 1) 侧边栏功能区「设置」→ 设置页完整覆盖工作区（zcode 式整页）→ AI 与 Agent 分区
      await clickReady(page, page.getByRole('button', { name: '设置' }))
      const settingsPage = page.getByTestId('settings-page')
      await expect(settingsPage).toBeVisible()
      // 整页覆盖断言：设置页高度占视口绝大部分（串口工作区/底部面板被隐藏）
      await expect(async () => {
        const box = await settingsPage.boundingBox()
        const vh = await page.evaluate(() => window.innerHeight)
        expect(box, 'settings-page 无 boundingBox').not.toBeNull()
        if (box) expect(box.height).toBeGreaterThan(vh * 0.7)
      }).toPass({ timeout: 5000 })
      await clickReady(page, settingsPage.getByTestId('settings-nav-agent'))
      await clickReady(page, settingsPage.getByTestId('llm-add'))
      await settingsPage.getByTestId('llm-name').fill('mock-relay')
      await settingsPage.getByTestId('llm-base-url').fill(`http://127.0.0.1:${port}/v1`)
      await settingsPage.getByTestId('llm-key').fill('sk-e2e-test-12345678901234567890')
      // 自动探查模型（GET /models）→ shadcn Select 下拉选择
      await clickReady(page, settingsPage.getByTestId('llm-probe'))
      const modelSelect = settingsPage.getByTestId('llm-model-select')
      await expect(modelSelect).toBeVisible({ timeout: 10000 })
      await clickReady(page, modelSelect)
      await clickReady(page, page.getByRole('option', { name: 'mock-pro-max' }))
      await expect(settingsPage.getByTestId('llm-model')).toHaveValue('mock-pro-max')
      // 思考强度 = 高，上下文 = 128K（对齐 CC Switch 字段）
      await clickReady(page, settingsPage.getByTestId('llm-effort'))
      await clickReady(page, page.getByRole('option', { name: '高' }))
      await settingsPage.getByTestId('llm-context').fill('128')
      await clickReady(page, settingsPage.getByTestId('llm-test'))
      await expect(settingsPage.locator('.agent-settings__test.is-ok')).toBeVisible({ timeout: 10000 })
      await clickReady(page, settingsPage.getByTestId('llm-save'))
      // 列表出现 provider 且自动成为当前（唯一启用项）
      await expect(settingsPage.getByTestId('llm-provider-current')).toBeVisible({ timeout: 5000 })
      await expect(settingsPage.getByTestId('llm-provider-item')).toContainText('mock-relay')

      // 2) 切回「脚本」功能区 → 打开脚本编辑器 → 向导 → 深度模式 → 提交 → 模型流式解析产物
      await clickReady(page, page.getByRole('button', { name: '脚本' }))
      await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
      const editor = page.getByRole('dialog', { name: '脚本编辑器' })
      await editor.waitFor()
      await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))
      await clickReady(page, editor.getByTestId('pg-thinking-level'))
      await editor.getByTestId('pg-doc-input').fill('帧头 AA55，deviceId 一字节，循环发送')
      await clickReady(page, editor.getByTestId('pg-submit'))
      await expect(editor.getByTestId('pg-llm-streaming')).toBeVisible({ timeout: 5000 })
      await expect(editor.getByText(/模型解析出协议「MockSimple」/)).toBeVisible({ timeout: 20000 })
      await expect(editor.getByTestId('pg-verified-badge')).toBeVisible({ timeout: 20000 })
      // 思考强度生效：深度模式 chat 请求体带 reasoning_effort
      const chatBody = JSON.parse(capturedBodies[capturedBodies.length - 1])
      expect(chatBody.reasoning_effort).toBe('high')

      // 3) 应用 → 画布出现节点
      await clickReady(page, editor.getByTestId('pg-ready-apply'))
      await expect(async () => {
        const count = await editor.locator('[data-testid="node"]').count()
        expect(count).toBeGreaterThanOrEqual(2)
      }).toPass({ timeout: 15000 })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  test('介入输入框存在（steering/followup/abort）', async ({ page }) => {
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await clickReady(page, editor.getByTestId('toolbar-protocol-gen'))

    // 介入输入区可见（idle 阶段 disabled）
    const steering = editor.getByTestId('steering-input')
    await expect(steering).toBeVisible()
    await expect(editor.getByTestId('steer-btn')).toBeDisabled()
    await expect(editor.getByTestId('abort-btn')).toBeDisabled()
  })
})
