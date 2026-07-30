import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures'
import {
  PROTO,
  buildFrame,
  packBitfield,
  startComplexProtocolServer,
  type ComplexProtocolServer
} from './helpers/complex-protocol-server'

/**
 * 超复杂脚本协议 E2E v2（加长 + 加难）：
 * 本地 TCP 协议服务端 ↔ 应用 TCP 客户端 ↔ 脚本沙箱多轮拼包/流式解包。
 *
 * 脚本正文来自 shared/samples/复杂协议v2.js（脚本页可直接打开运行的同一份）。
 * E2E 把它改写成 sendToPanel/waitPanelPacket(panelId)，不依赖「活动面板」。
 *
 * 策略同 modbus-script-node：不点 Rete，直接 scripts.run。
 */

async function runScript(
  page: import('@playwright/test').Page,
  code: string,
  panelId: string,
  timeoutMs = 45000
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  return page.evaluate(async ({ src, id, timeoutMs: t }) => {
    const api = (window as any).api
    let resolveEnded!: (v: any) => void
    let rejectEnded!: (e: any) => void
    const ended = new Promise<any>((res, rej) => {
      resolveEnded = res
      rejectEnded = rej
    })
    const off = api.scripts.onEnded((p: any) => resolveEnded(p))
    const runRes = await api.scripts.run(src, { id })
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
  }, { src: code, id: panelId, timeoutMs })
}

/** 从 shared/samples 加载示例，并改写为显式 panelId（E2E 不依赖活动面板）。 */
function buildComplexScriptV2(panelId: string): string {
  const samplePath = path.join(__dirname, '../shared/samples/复杂协议v2.js')
  const sample = fs.readFileSync(samplePath, 'utf8')
  return sample
    .replace(
      /var PANEL = null;/,
      `var PANEL = ${JSON.stringify(panelId)};`
    )
    .replace(/await send\(/g, 'await sendToPanel(PANEL, ')
    .replace(/await waitOnePacket\(/g, 'await waitPanelPacket(PANEL, ')
}

test.describe('复杂协议脚本 v2（TCP 加长加难）', () => {
  let server: ComplexProtocolServer
  let panelId: string

  test.beforeEach(async ({ page }) => {
    server = await startComplexProtocolServer()
    panelId = `tcp://127.0.0.1:${server.port}`

    const openRes = await page.evaluate(async ({ host, port }) => {
      return (window as any).api.tcp.open(host, port, {
        timeoutMs: 3000,
        autoReconnect: false
      })
    }, { host: '127.0.0.1', port: server.port })

    expect(openRes?.ok, `tcp.open 失败: ${JSON.stringify(openRes)}`).toBe(true)
    expect(openRes?.id).toBe(panelId)
  })

  test.afterEach(async ({ page }) => {
    try {
      await page.evaluate(async (id) => {
        try { await (window as any).api.tcp.close(id) } catch { /* ignore */ }
      }, panelId)
    } catch { /* page 可能已关 */ }
    await server.close()
  })

  test('多场景：完整旗标 / 半包 / 五轮压力 / 坏 CRC + 流式拆帧', async ({ page }) => {
    const code = buildComplexScriptV2(panelId)
    expect(code).toContain('sendToPanel')
    expect(code).toContain(panelId)

    const res = await runScript(page, code, panelId, 60000)

    expect(res.ok, `脚本失败 error=${res.error} logs=${JSON.stringify(res.logs.slice(-30))}`).toBe(true)

    const log = (prefix: string) => res.logs.find((l) => l.startsWith(prefix))

    // 场景 A
    expect(log('A.ack.swHex=')).toBe('A.ack.swHex=00')
    expect(log('A.ack.swBin=')).toBe('A.ack.swBin=00')
    expect(log('A.ack.dec=')).toBe('A.ack.dec=43982')
    expect(log('A.ack.fixed=')).toBe(`A.ack.fixed=${PROTO.RESP_FIXED_HEX}`)
    expect(log('A.ack.ascii=')).toBe(`A.ack.ascii=${PROTO.RESP_ASCII}`)
    expect(log('A.ack.gbk=')).toBe(`A.ack.gbk=${PROTO.RESP_GBK}`)
    expect(log('A.ack.utf8=')).toBe(`A.ack.utf8=${PROTO.RESP_UTF8}`)
    expect(log('A.ack.bit6=')).toBe('A.ack.bit6=42')
    expect(log('A.ack.bit7=')).toBe('A.ack.bit7=127')
    expect(log('A.ack.float=')).toBe('A.ack.float=40400000') // 1.5*2=3.0
    expect(log('A.ack.tlvCount=')).toBe('A.ack.tlvCount=3')
    expect(log('A.ack.trailer=')).toBe('A.ack.trailer=0F1E2D3C')
    expect(log('A.events=')).toMatch(/^A\.events=[2-9]/)
    expect(log('A.OK=')).toBe('A.OK=1')

    // 服务端侧交叉：至少场景 A + B + 5 轮 = 7 个合法 REQ
    expect(server.requests.length).toBeGreaterThanOrEqual(7)
    const reqA = server.requests.find((r) => r.seq === 1)
    expect(reqA).toBeTruthy()
    expect(reqA!.bit6).toBe(42)
    expect(reqA!.bitfield).toBe(packBitfield(42, 3, 0, 127))
    expect(reqA!.swHex).toBe(0x01)
    expect(reqA!.decU16).toBe(43981)
    expect(reqA!.int32Be).toBe(-123456)
    expect(reqA!.int32Le).toBe(-123456)
    expect(reqA!.floatBe).toBeCloseTo(1.5, 5)
    expect(reqA!.ascii).toBe('HELLO-STREAM-LONG')
    expect(reqA!.gbkText).toBe('串口助手协议测试')
    expect(reqA!.utf8Text).toBe('UTF8中文αβγ')
    expect(reqA!.tlvs.length).toBe(3)
    expect(reqA!.trailerHex).toBe('0A0B0C0D0E0F')

    // 场景 B 半包
    expect(log('B.OK=')).toBe('B.OK=1')
    expect(log('B.ack.seq=')).toContain('seq=2')
    const fragWrites = server.writtenChunks.filter((c) => c.length > 0)
    expect(fragWrites.length).toBeGreaterThanOrEqual(2)

    // 场景 C 压力
    expect(log('C.okRounds=')).toBe('C.okRounds=5')
    expect(log('C.OK=')).toBe('C.OK=1')
    for (let seq = 10; seq <= 14; seq++) {
      expect(server.requests.some((r) => r.seq === seq)).toBe(true)
    }

    // 场景 D
    expect(log('D.OK=')).toBe('D.OK=1')
    expect(log('D.NACK=') || log('D.dropOrIgnore=')).toBeTruthy()

    // 工具
    expect(log('stable.base=')).toBe('stable.base=AB7F')
    expect(log('stable.swap=')).toBe('stable.swap=CDAB3412')
    expect(log('stable.chunk=')).toBe('stable.chunk=AA,BB,CC,DD')
    expect(log('stable.crc16=')).toBe('stable.crc16=4B37')
    expect(log('stable.gbkRound=')).toBe('stable.gbkRound=中文测试')
    expect(log('stable.latin1Round=')).toBe('stable.latin1Round=应答UTF8')
    expect(log('DONE=')).toBe('DONE=1')
  })

  test('服务端 v2 黄金样本：位域 / GBK / 双 CRC / 粘包拆帧', async () => {
    const frame = buildFrame({
      seq: 1,
      flags: PROTO.FLAG_TLV | PROTO.FLAG_FLOAT | PROTO.FLAG_TRAILER,
      bit6: 42,
      bit2: 3,
      bit1: 0,
      bit7: 127,
      swHex: 0x01,
      swBin: 1,
      decU16: 43981,
      int32: -123456,
      floatBe: 1.5,
      fixedHex: 'DEADBEEF',
      ascii: 'HELLO-STREAM-LONG',
      gbkText: '串口助手协议测试',
      utf8Text: 'UTF8中文αβγ',
      tlvs: [
        { type: 1, value: 'meta-A', encoding: 'utf8' },
        { type: 2, value: 'CAFE', encoding: 'hex' }
      ],
      trailerHex: '0A0B0C0D0E0F'
    })
    expect(frame.readUInt16BE(0)).toBe(0xaa55)
    expect(frame.readUInt8(2)).toBe(0x02)
    expect(frame.readUInt16BE(7)).toBe(0xab7f)
    expect(frame.toString('hex').toUpperCase()).toContain('B4AEBFDAD6FA')
  })

  test('示例脚本可被脚本页 parseScriptFile 以 legacy 代码加载', async () => {
    const { parseScriptFile } = await import('../src/features/script-editor/persistence')
    const sample = fs.readFileSync(path.join(__dirname, '../shared/samples/复杂协议v2.js'), 'utf8')
    const parsed = parseScriptFile(sample)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.reason).toBe('missing-markers')
    expect(parsed.code).toContain('DONE=1')
    expect(parsed.code).toContain('waitOnePacket')
    expect(parsed.code).toContain('await send(')
  })
})
