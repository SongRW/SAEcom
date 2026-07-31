import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from './fixtures'
import { parseScriptFile } from '../src/features/script-editor/persistence'
import { generateCodeFromRete } from '../src/features/script-editor/codegen'

/**
 * 雄安林草 终端协议可视化脚本 E2E。
 *
 * 两个示例脚本（通用位置报送 / 安全监测报警终端）通过「读取文件 → 换行拆分 → 遍历循环」
 * 解析 txt 中每行一帧的报文。本测试：
 *   1. 把帧数据 txt 写到 tmpdir 已知路径
 *   2. 解析示例脚本图，把 input-file 节点的 path 重写为该 tmp 绝对路径
 *   3. codegen 生成代码后用真实 vm 沙箱跑（scripts.run + onEnded）
 *   4. 断言 10 帧全部解析输出（年/月/日/时/分/秒 6 条已合并为 1 条 yyyy-mm-dd hh:mm:ss「时间」日志），且首帧关键字段值正确
 *
 * 解码值 oracle 见 test/xiong-an-verify.test.ts。
 */

const SAMPLES = join(__dirname, '..', 'shared', 'samples')
const PANEL_ID = 'e2e-xiongan'

/** 把帧 txt 写到 tmp，返回绝对路径。 */
function writeFramesTmp(name: string, frames: string[]): string {
  const p = join(tmpdir(), name)
  writeFileSync(p, frames.join('\n') + '\n', 'utf-8')
  return p
}

/** 读示例脚本 → 重写 input-file path → codegen。返回可执行的代码字符串。 */
function buildCode(sampleFile: string, framesPath: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs')
  const content = fs.readFileSync(join(SAMPLES, sampleFile), 'utf-8')
  const parsed = parseScriptFile(content)
  if (!parsed.ok) throw new Error(`parse ${sampleFile} failed: ${parsed.reason}`)
  const g = JSON.parse(JSON.stringify(parsed.graph))
  for (const n of g.nodes) {
    if (n.key === 'input-file') n.data = { ...n.data, path: framesPath }
  }
  return generateCodeFromRete(g)
}

/** 在 renderer 侧跑脚本并等结束，返回 { ok, error?, logs }。 */
async function runScript(
  page: import('@playwright/test').Page,
  code: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  return page.evaluate(async ({ src, id }) => {
    const api = (window as any).api
    let resolveEnded!: (v: any) => void
    const ended = new Promise<any>((res) => { resolveEnded = res })
    const off = api.scripts.onEnded((p: any) => resolveEnded(p))
    const runRes = await api.scripts.run(src, { id })
    if (!runRes?.ok) { off(); throw new Error('scripts.run 启动失败: ' + JSON.stringify(runRes)) }
    const runId = runRes.runId
    const timer = setTimeout(() => resolveEnded({ ok: false, error: '脚本超时未结束', logs: [] }), 20000)
    const payload = await ended
    clearTimeout(timer)
    off()
    if (payload?.runId !== runId) throw new Error(`runId 不匹配: 期望 ${runId} 实际 ${payload?.runId}`)
    return { ok: !!payload?.ok, error: payload?.error, logs: payload?.logs ?? [] }
  }, { src: code, id: PANEL_ID })
}

// 帧数据（与 shared/samples/*.txt 一致，从协议文档提取）
const FRAMES_LOCATION = [
  '031A070802191813D8FF2D337C022F0000643A02A0',
  '031A070803192913D9002D3379022A0000663A029F',
  '031A070804190D13D9002D337902290000663A029D',
  '031A070805190F13D9002D3379022700006839029E',
  '031A070807191813D8FF2D337A023100006A39029B',
  '031A070808192913D9002D3379022B0000663A029F',
  '031A070806191813D9002D337A022D0000683A029F',
  '031A070809190C13D9002D3379022C0000643A029F',
  '031A07080A190B13D9002D337902290000643A029E',
  '031A07080B191213D9012D3377022600005B39029F',
]
const FRAMES_SAFETY = [
  '041A070603151013D9002D3379023C0000FFFFFF97',
  '041A070603220D13D9002D337902440000FFFFFFC0',
  '041A070603221013D8FF2D337902430000FFFFFF96',
  '041A070603221013D8FF2D337902430000FFFFFF96',
  '041A0706043A0F13D9002D337902400000FFFFFF99',
  '041A070605010F13D8FF2D337902420000FFFFFF97',
  '041A070605190C13D9002D337B023D0000FFFFFF94',
  '041A0706051A0C13D9002D337B023E0000FFFFFF95',
  '041A070605180C13D9002D337B023B0000FFFFFF95',
  '041A0706051B0C13D8FE2D337A0228029BFFFFFF96',
]

test.describe('雄安林草 终端协议可视化脚本', () => {
  test('通用位置报送：读文件→拆行→遍历解析 10 帧', async ({ page }) => {
    const framesPath = writeFramesTmp('xiongan-location.txt', FRAMES_LOCATION)
    const code = buildCode('通用位置报送协议-可视化.js', framesPath)

    const res = await runScript(page, code)
    expect(res.ok, res.error).toBe(true)
    expect(res.error).toBeUndefined()
    // 10 帧 × 11 行（年/月/日/时/分/秒 6 条已合并为 1 条「时间」日志）= 110 行
    expect(res.logs.length).toBe(110)
    // 时间已合并为单条 yyyy-mm-dd hh:mm:ss 日志（不再有独立的 [年]/[月]/...）
    expect(res.logs.some((l) => /^\[时间\] \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(l))).toBe(true)
    expect(res.logs.some((l) => /^\[(年|月|日|时|分|秒)\] /.test(l))).toBe(false)

    // 首帧（031A070802191813D8FF2D337C022F0000643A02A0）抽查（年=26→2026）
    const first11 = res.logs.slice(0, 11)
    expect(first11.some((l) => l.startsWith('[协议编号] 3'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[时间] 2026-'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[纬度]') && l.includes('40.07'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[信号强度] -96'))).toBe(true)

    // 末帧也解析成功（协议编号=3）
    const last11 = res.logs.slice(-11)
    expect(last11.some((l) => l.startsWith('[协议编号] 3'))).toBe(true)
  })

  test('安全监测报警终端：读文件→拆行→遍历解析 10 帧', async ({ page }) => {
    const framesPath = writeFramesTmp('xiongan-safety.txt', FRAMES_SAFETY)
    const code = buildCode('安全监测报警终端-可视化.js', framesPath)

    const res = await runScript(page, code)
    expect(res.ok, res.error).toBe(true)
    expect(res.error).toBeUndefined()
    // 10 帧 × 11 行（年/月/日/时/分/秒 6 条已合并为 1 条「时间」日志）= 110 行
    expect(res.logs.length).toBe(110)
    expect(res.logs.some((l) => /^\[时间\] \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(l))).toBe(true)
    expect(res.logs.some((l) => /^\[(年|月|日|时|分|秒)\] /.test(l))).toBe(false)

    // 首帧（041A070603151013D9002D3379023C0000FFFFFF97）抽查
    const first11 = res.logs.slice(0, 11)
    expect(first11.some((l) => l.startsWith('[协议编号] 4'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[时间] 2026-'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[海拔] 72'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[定位状态] 255'))).toBe(true)
    expect(first11.some((l) => l.startsWith('[信号强度] -105'))).toBe(true)
  })
})
