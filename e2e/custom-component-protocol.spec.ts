/**
 * 复杂协议 v3 组件化脚本 E2E。
 *
 * 验证「完全依赖组件库」的端到端链路：
 * - 3 个自定义组件（时间/经纬度/AES）已注册到 componentLib
 * - 脚本经 useComponent() 调用组件完成核心处理（不自己实现算法）
 * - TCP loopback（自建服务端+客户端）多轮组包→发送→echo→拆帧→校验
 * - 100+ 字段帧 + AES 加解密 + 时间/经纬度反算
 *
 * 脚本来自 shared/samples/复杂协议v3-组件化.js。E2E 把 PORT 改成随机端口
 * 避免并行冲突，并把 ROUNDS 降到较小值保证 E2E 时限内完成。
 */
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { test, expect } from './fixtures'

/** 找一个可用 TCP 端口（避免 18930 固定端口在 CI 并行冲突）。 */
async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close()
        reject(new Error('无法获取端口'))
      }
    })
  })
}

async function runScript(
  page: import('@playwright/test').Page,
  code: string,
  timeoutMs = 60000
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  return page.evaluate(async ({ src, timeoutMs: t }) => {
    const api = (window as any).api
    let resolveEnded!: (v: any) => void
    let rejectEnded!: (e: any) => void
    const ended = new Promise<any>((res, rej) => {
      resolveEnded = res
      rejectEnded = rej
    })
    const off = api.scripts.onEnded((p: any) => resolveEnded(p))
    // v3 是 loopback，不依赖面板；ctx.id 给空串（sendTCP/listenTcp* 不依赖 ctx.id）
    const runRes = await api.scripts.run(src, { id: '' })
    if (!runRes?.ok) {
      off()
      throw new Error('scripts.run 启动失败: ' + JSON.stringify(runRes))
    }
    const runId = runRes.runId
    const timer = setTimeout(() => rejectEnded(new Error('脚本超时未结束')), t)
    const payload = await ended
    clearTimeout(timer)
    off()
    if (payload?.runId && payload.runId !== runId) {
      throw new Error(`runId 不匹配: 期望 ${runId} 实际 ${payload?.runId}`)
    }
    return { ok: !!payload?.ok, error: payload?.error, logs: payload?.logs ?? [] }
  }, { src: code, timeoutMs })
}

function buildV3Script(port: number, rounds: number): string {
  const samplePath = path.join(__dirname, '../shared/samples/复杂协议v3-组件化.js')
  const sample = fs.readFileSync(samplePath, 'utf8')
  return sample
    .replace(/var PORT = 18930;/, `var PORT = ${port};`)
    .replace(/var ROUNDS = 100;/, `var ROUNDS = ${rounds};`)
}

test.describe('复杂协议 v3 组件化脚本（TCP loopback + 100+ 字段 + 组件库）', () => {
  test('组件化组包拆包 loopback 闭环：时间/经纬度/AES 经组件库处理', async ({ page }) => {
    const port = await pickFreePort()
    // E2E 用较小轮数（10 轮）保证时限内稳定完成；逻辑正确性由单测背书
    const code = buildV3Script(port, 10)
    expect(code).toContain(`var PORT = ${port};`)
    expect(code).toContain(`var ROUNDS = 10;`)
    // 确认脚本依赖组件库（useComponent 调用）
    expect(code).toContain("useComponent('custom-time-convert'")
    expect(code).toContain("useComponent('custom-geo-convert'")
    expect(code).toContain("useComponent('custom-aes-crypto'")

    const res = await runScript(page, code, 90000)

    // 断言脚本成功完成
    expect(res.ok, `脚本失败 error=${res.error} logs=${JSON.stringify(res.logs.slice(-20))}`).toBe(true)

    // 断言压测报告输出
    const doneLog = res.logs.find((l) => l.startsWith('DONE='))
    expect(doneLog, '应有 DONE=1').toBeTruthy()
    expect(doneLog).toContain('1')

    const reportLog = res.logs.find((l) => l.includes('压测报告'))
    expect(reportLog, '应有压测报告').toBeTruthy()

    const successLog = res.logs.find((l) => l.startsWith('总轮数='))
    expect(successLog, '应有总轮数统计').toBeTruthy()
    expect(successLog).toContain('成功=10')

    // 断言组件库已注册（启动日志）
    const regLog = res.logs.find((l) => l.includes('组件库已注册'))
    expect(regLog, '应注册组件库').toBeTruthy()
  })
})
