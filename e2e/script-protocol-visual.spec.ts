import { test, expect, NAV, openNavPage, clickReady } from './fixtures'
import fs from 'node:fs'
import path from 'node:path'
import { startEchoServer } from './helpers/tcp-echo'
import { generateCodeFromRete } from '../src/features/script-editor/codegen'
import { parseScriptFile } from '../src/features/script-editor/persistence'

/**
 * 复杂协议「可视化」脚本：TCP 收发闭环 E2E。
 * - 起本地 TCP echo server
 * - 把可视化图脚本写入 scripts 并打开 → 应渲染协议节点（含 input-tcp / output-tcp）
 * - 把图里的 input-tcp / output-tcp 主机端口改成 echo 端口
 * - 运行后 input-tcp 持续监听，output-tcp 把封包发出去，echo 回弹
 * - 断言：TX 日志、接收链解出的 magic/bit6/bit7 日志都出现
 *
 * Codegen 在 Node 侧（Playwright 进程）跑：渲染层无法 import TS。
 */
test.describe('脚本页协议可视化图（TCP 收发闭环）', () => {
  test('打开可视化图并运行 TCP 收发', async ({ page }) => {
    const echo = await startEchoServer()

    // 1) 写入示例脚本
    const sampleName = '复杂协议v2-可视化.js'
    const samplePath = path.join(__dirname, '../shared/samples', sampleName)
    const content = fs.readFileSync(samplePath, 'utf8')
    await page.evaluate(async ({ name, body }) => {
      await (window as any).api.scripts.write(name, body)
    }, { name: sampleName, body: content })

    // 2) 打开脚本编辑器并选中可视化脚本
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()
    await clickReady(page, editor.getByRole('button', { name: '脚本' }))
    await clickReady(page, editor.getByRole('button', { name: sampleName }))

    // 3) 画布渲染协议节点（不是纯代码面板）：循环组帧 + 奇偶判断 + 拆帧 + CRC 校验
    await expect(editor.getByTestId('script-code-panel')).toHaveCount(0)
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(56, { timeout: 15000 })
    await expect(editor.locator('[data-node-key="control-loop"]').first()).toBeVisible()
    await expect(editor.locator('[data-node-key="control-if"]').first()).toBeVisible()
    await expect(editor.locator('[data-node-key="protocol-bitfield"]').first()).toBeVisible()

    // 4) 在 Node 端 codegen（渲染层拿不到 TS 模块）
    //    把 input-tcp / output-tcp 的 host/port 改成 echo 端口
    const parsed = parseScriptFile(content)
    if (!parsed.ok) throw new Error('parse sample failed')
    const g = JSON.parse(JSON.stringify(parsed.graph)) as typeof parsed.graph
    for (const node of g.nodes) {
      if (node.key === 'input-tcp' || node.key === 'output-tcp') {
        node.data = { ...node.data, host: '127.0.0.1', port: echo.port }
      }
    }
    const codeStr = generateCodeFromRete(g)

    // 5) 跑脚本，收集实时日志（循环5轮 + 持续监听，给足时间）
    const res = await page.evaluate(async ({ src, id }: { src: string; id: string }) => {
      const api = (window as any).api
      const logs: string[] = []
      const off = api.scripts.onLog((p: any) => logs.push(String(p.line)))
      const runRes = await api.scripts.run(src, { id })
      if (!runRes?.ok) { off(); throw new Error('run failed ' + JSON.stringify(runRes)) }
      const runId = runRes.runId
      // 5轮循环×(发送+500ms间隔) + echo 回弹拆帧，留足余量
      await new Promise((r) => setTimeout(r, 8000))
      try { await api.scripts.stop(runId) } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 300))
      off()
      return { ok: true, logs }
    }, { src: codeStr, id: 'e2e-visual-tcp' })

    // 6) 断言日志：循环发送 + 奇偶判断 + 拆帧解析 + CRC 校验
    expect(res.ok, `脚本失败 logs=${JSON.stringify(res.logs)}`).toBe(true)
    const logs = res.logs
    // 帧说明
    expect(logs.some((l) => l.startsWith('[帧说明]')), `帧说明缺失: ${JSON.stringify(logs)}`).toBe(true)
    // 循环发送：5轮 [发送] 日志
    const sendLines = logs.filter((l) => l.startsWith('[发送]'))
    expect(sendLines.length, `应至少5轮发送日志: ${JSON.stringify(logs)}`).toBeGreaterThanOrEqual(5)
    // 奇偶判断：偶数→成功，奇数→失败（循环5次：序号1,3,5奇数失败；2,4偶数成功）
    const oddFail = logs.filter((l) => l.startsWith('[发送结果]') && l.includes('奇数→失败'))
    const evenOk = logs.filter((l) => l.startsWith('[发送结果]') && l.includes('偶数→成功'))
    expect(oddFail.length, `应有奇数失败日志: ${JSON.stringify(logs)}`).toBeGreaterThanOrEqual(1)
    expect(evenOk.length, `应有偶数成功日志: ${JSON.stringify(logs)}`).toBeGreaterThanOrEqual(1)
    // 拆帧：中文前缀
    expect(logs.some((l) => l.startsWith('[接收.魔数]') && l.includes('AA55')), `接收.魔数缺失: ${JSON.stringify(logs)}`).toBe(true)
    expect(logs.some((l) => l.startsWith('[接收.序列号]')), `接收.序列号缺失: ${JSON.stringify(logs)}`).toBe(true)
    expect(logs.some((l) => l.startsWith('[接收.6bit]') && l.includes('42')), `接收.6bit缺失: ${JSON.stringify(logs)}`).toBe(true)
    expect(logs.some((l) => l.startsWith('[接收.7bit]') && l.includes('127')), `接收.7bit缺失: ${JSON.stringify(logs)}`).toBe(true)
    expect(logs.some((l) => l.startsWith('[接收.ascii]') && l.includes('HELLO')), `接收.ascii缺失: ${JSON.stringify(logs)}`).toBe(true)
    expect(logs.some((l) => l.startsWith('[接收.utf8]') && l.includes('UTF8中')), `接收.utf8缺失: ${JSON.stringify(logs)}`).toBe(true)
    // CRC 校验通过
    expect(logs.some((l) => l.startsWith('[接收.CRC校验]') && l.includes('true')), `CRC校验应为true: ${JSON.stringify(logs)}`).toBe(true)

    // echo server 也确实收到了帧
    expect(echo.received.length).toBeGreaterThan(0)

    await echo.close()
  })

  test('保存后保留可视化图的全部可连接边', async ({ page }) => {
    const sampleName = '复杂协议v2-可视化.js'
    const samplePath = path.join(__dirname, '../shared/samples', sampleName)
    const content = fs.readFileSync(samplePath, 'utf8')
    await page.evaluate(async ({ name, body }) => {
      await (window as any).api.scripts.write(name, body)
    }, { name: sampleName, body: content })

    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await clickReady(page, editor.getByRole('button', { name: '脚本' }))
    await clickReady(page, editor.getByRole('button', { name: sampleName }))
    await expect(editor.locator('[data-testid="node"]')).toHaveCount(56, { timeout: 15000 })

    await clickReady(page, editor.getByRole('button', { name: '保存' }))
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已保存' })).toBeVisible({ timeout: 10000 })

    const saved = await page.evaluate(async (name) => (window as any).api.scripts.read(name), sampleName)
    const parsed = parseScriptFile(saved)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const connections = Array.isArray(parsed.graph.connections)
      ? parsed.graph.connections
      : Object.values(parsed.graph.connections || {})
    expect(connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '30', sourceOutput: 'out', target: '31', targetInput: 'hex' }),
      expect.objectContaining({ source: '31', sourceOutput: 'field_f1', target: '50', targetInput: 'in' }),
      expect.objectContaining({ source: '31', sourceOutput: 'field_f4', target: '51', targetInput: 'in' })
    ]))
  })

  test('工具栏「本地模拟」按钮启动应用内 echo 并收发闭环', async ({ page }) => {
    // 1) 打开脚本编辑器
    await openNavPage(page, NAV.pageScript)
    await clickReady(page, page.getByRole('button', { name: '打开脚本编辑器' }))
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await expect(editor).toBeVisible()

    // 2) 点工具栏「本地模拟」→ 应用内 tcpServer.start(0, echo=true)
    const simBtn = editor.getByRole('button', { name: /本地模拟/ })
    await clickReady(page, simBtn)

    // 3) 按钮应变为带端口号的激活态（如「本地模拟 :51234」）
    const activeBtn = editor.getByRole('button', { name: /本地模拟 :\d+/ })
    await expect(activeBtn).toBeVisible({ timeout: 5000 })
    const btnText = await activeBtn.textContent()
    const portMatch = btnText?.match(/:(\d+)/)
    expect(portMatch, `按钮应含端口号，实际: ${btnText}`).toBeTruthy()
    const simPort = Number(portMatch![1])

    // 4) 直接用应用内 echo 验证收发：scripts.run 跑一段 sendTCP + waitOnePacket
    const res = await page.evaluate(async ({ port }: { port: number }) => {
      const api = (window as any).api
      const code = `
        // output-tcp 走 sendTCP；input-tcp 走 listenTcpPackets 建同一条连接
        // 这里直接用沙箱 API 模拟：sendTCP 复用 listenTcpPackets 的 socket
        var got = '';
        var waitP = new Promise(function(resolve){
          listenTcpPackets('127.0.0.1', ${port})(async function(data){
            got = data;
            resolve();
          }).catch(function(){ resolve(); });
          sleep(3000).then(resolve);
        });
        await sleep(200); // 等 listener 建连
        await sendTCP('127.0.0.1', ${port}, 'A1B2C3', 'hex');
        await waitP;
        console.log('[SIMRECV] ' + textToHex(got).toUpperCase());
      `
      const logs: string[] = []
      const off = api.scripts.onLog((p: any) => logs.push(String(p.line)))
      const runRes = await api.scripts.run(code, { id: 'e2e-sim' })
      if (!runRes?.ok) { off(); throw new Error('run failed ' + JSON.stringify(runRes)) }
      await new Promise((r) => setTimeout(r, 4000))
      try { await api.scripts.stop(runRes.runId) } catch { /* ignore */ }
      off()
      return { logs }
    }, { port: simPort })

    // 5) echo 回弹：sendTCP 发的 A1B2C3 应被 echo 回来
    const recvLine = res.logs.find((l) => l.startsWith('[SIMRECV]'))
    expect(recvLine, `应收到 echo 回弹，logs=${JSON.stringify(res.logs)}`).toBeTruthy()
    expect(recvLine).toContain('A1B2C3')

    // 6) 停止本地模拟
    await clickReady(page, activeBtn)
    await expect(editor.getByRole('button', { name: '本地模拟' })).toBeVisible({ timeout: 3000 })
  })
})
