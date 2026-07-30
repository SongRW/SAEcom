import { test, expect } from './fixtures'

/**
 * transform-namefields 节点沙箱 E2E。
 *
 * 与 modbus-script-node.spec.ts 同样的策略：不驱动 Rete 画布（点击/连线极脆弱），
 * 而是直接跑「split-delimiter → transform-namefields → output-log 三个节点 codegen
 * 会生成的那段 JS」——把脚本丢进真实 vm 沙箱，端到端验证 namefields 的对象字面量
 * 生成 + 按名取值确实正确工作。
 *
 * 时序 gotcha（同 modbus 测试）：scripts.run 在脚本跑完前就 resolve，必须先订阅
 * onEnded 再 run，用 runId 精确匹配结束事件。
 */
const PANEL_ID = 'script-test-panel'

async function runScript(
  page: import('@playwright/test').Page,
  code: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  return page.evaluate(async ({ src, panelId }) => {
    const api = (window as any).api
    let resolveEnded!: (v: any) => void
    const ended = new Promise<any>((res) => {
      resolveEnded = res
    })
    const off = api.scripts.onEnded((p: any) => resolveEnded(p))
    const runRes = await api.scripts.run(src, { id: panelId })
    if (!runRes?.ok) {
      off()
      throw new Error('scripts.run 启动失败: ' + JSON.stringify(runRes))
    }
    const runId = runRes.runId
    const timer = setTimeout(() => resolveEnded({ ok: false, error: '脚本超时未结束', runId: null, logs: [] }), 15000)
    const payload = await ended
    clearTimeout(timer)
    off()
    return { ok: !!payload?.ok, error: payload?.error, logs: payload?.logs ?? [] }
  }, { src: code, panelId: PANEL_ID })
}

test.describe('字段命名节点（transform-namefields）沙箱行为', () => {
  test('拆分数组 → 按标签映射为带名对象 → 日志输出', async ({ page }) => {
    // 模拟 codegen 产物：
    //   var _recv = "23,45,101";                        (input-manual)
    //   var _out_split = _recv.split(",");              (split-delimiter)
    //   var _out_nf = { "温度": (_out_split[0]==null?null:_out_split[0]),
    //                   "湿度": (_out_split[1]==null?null:_out_split[1]),
    //                   "气压": (_out_split[2]==null?null:_out_split[2]) };  (transform-namefields)
    //   console.log("[日志] " + _out_nf);                (output-log)
    const code =
      'var _recv = "23,45,101";' +
      'var _out_split = _recv.split(",");' +
      'var _out_nf = { "温度": (_out_split[0] == null ? null : _out_split[0]), ' +
      '"湿度": (_out_split[1] == null ? null : _out_split[1]), ' +
      '"气压": (_out_split[2] == null ? null : _out_split[2]) };' +
      'console.log("[日志] " + JSON.stringify(_out_nf));'

    const res = await runScript(page, code)
    expect(res.ok, `脚本应以 ok 结束，error=${res.error}`).toBe(true)

    const line = res.logs.find((l) => l.startsWith('[日志]'))
    expect(line, `日志应含 [日志] 行，实际 logs=${JSON.stringify(res.logs)}`).toBeTruthy()
    // 对象应含三个带名字段及其值
    expect(line).toContain('"温度":"23"')
    expect(line).toContain('"湿度":"45"')
    expect(line).toContain('"气压":"101"')
  })

  test('标签多于数组项：缺失项填 null', async ({ page }) => {
    // 数组只有 2 项，但配了 3 个标签 → 第 3 个为 null
    const code =
      'var _out_split = "23,45".split(",");' +
      'var _out_nf = { "温度": (_out_split[0] == null ? null : _out_split[0]), ' +
      '"湿度": (_out_split[1] == null ? null : _out_split[1]), ' +
      '"气压": (_out_split[2] == null ? null : _out_split[2]) };' +
      'console.log("[日志] " + JSON.stringify(_out_nf));'

    const res = await runScript(page, code)
    expect(res.ok).toBe(true)
    const line = res.logs.find((l) => l.startsWith('[日志]'))
    expect(line).toContain('"温度":"23"')
    expect(line).toContain('"湿度":"45"')
    expect(line).toContain('"气压":null')
  })

  test('下游按名取值：对象字段可直接用于后续逻辑', async ({ page }) => {
    // 验证 namefields 产出的对象可被下游按名取值（string-template / 比较等场景）
    const code =
      'var _out_split = "23,45".split(",");' +
      'var _out_nf = { "温度": (_out_split[0] == null ? null : _out_split[0]), ' +
      '"湿度": (_out_split[1] == null ? null : _out_split[1]) };' +
      'console.log("temp=" + _out_nf["温度"] + ",hum=" + _out_nf.湿度);'

    const res = await runScript(page, code)
    expect(res.ok).toBe(true)
    const line = res.logs.find((l) => l.startsWith('temp='))
    expect(line).toContain('temp=23,hum=45')
  })
})
