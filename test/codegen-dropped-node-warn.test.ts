/**
 * P0-a：codegen 静默丢节点告警测试。
 *
 * 锁定 warnOnDroppedNodes 的行为：
 * - 终端副作用节点（output-tcp/output-log/output-file）被 blocked 时 console.warn
 * - 正常 emit 时不告警
 *
 * 这是「sendTCP=0 类静默失败」的检测闸门。下次改 codegen 边界导致组包链断裂时，
 * 此测试应提醒开发者（告警触发），而非等用户跑脚本发现乱码。
 */
import { describe, expect, it, vi } from 'vitest'
import { generateCodeFromRete } from '@/features/script-editor/codegen'

describe('codegen 静默丢节点告警', () => {
  it('正常 graph（output-tcp 在闭包内 emit）：不告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    generateCodeFromRete({
      nodes: [
        { id: '1', key: 'input-tcp', data: { host: '127.0.0.1', port: 8080, configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 } } },
        { id: '2', key: 'output-tcp', data: { host: '127.0.0.1', port: 8080, mode: 'hex' } }
      ],
      connections: [{ source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }]
    } as never)
    const droppedWarns = warn.mock.calls.filter((c) => String(c[0]).includes('终端副作用节点被丢弃'))
    expect(droppedWarns).toHaveLength(0)
    warn.mockRestore()
  })

  it('output-tcp 被 blocked（join 依赖闭包外 one-shot root）：告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // input-panel 是 continuousRoot（闭包内），input-manual 是 one-shot root（闭包外）
    // string-concat join 两者 → output-tcp 依赖 join → join 的 input-manual 来源闭包内不可见 → blocked
    generateCodeFromRete({
      nodes: [
        { id: '1', key: 'input-panel', data: { configRef: { kind: 'panel', panelId: 'p1' } } },
        { id: '2', key: 'input-manual', data: { content: 'extra', mode: 'text' } },
        { id: '3', key: 'string-concat', data: { separator: '|', ports: 2 } },
        { id: '4', key: 'output-tcp', data: { host: '127.0.0.1', port: 8080, mode: 'hex' } }
      ],
      connections: [
        { source: '1', sourceOutput: 'out', target: '3', targetInput: 'a' },
        { source: '2', sourceOutput: 'out', target: '3', targetInput: 'b' },
        { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
      ]
    } as never)
    const droppedWarns = warn.mock.calls.filter((c) => String(c[0]).includes('终端副作用节点被丢弃'))
    expect(droppedWarns.length).toBeGreaterThanOrEqual(1)
    // 告警含节点 key 和 id
    expect(String(droppedWarns[0][0])).toContain('output-tcp')
    expect(String(droppedWarns[0][0])).toContain('4')
    warn.mockRestore()
  })

  it('output-log 被 blocked：告警（终端节点含 output-log/output-file）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    generateCodeFromRete({
      nodes: [
        { id: '1', key: 'input-panel', data: { configRef: { kind: 'panel', panelId: 'p1' } } },
        { id: '2', key: 'input-manual', data: { content: 'x', mode: 'text' } },
        { id: '3', key: 'string-concat', data: { separator: '|', ports: 2 } },
        { id: '4', key: 'output-log', data: { prefix: 'J', level: 'info' } }
      ],
      connections: [
        { source: '1', sourceOutput: 'out', target: '3', targetInput: 'a' },
        { source: '2', sourceOutput: 'out', target: '3', targetInput: 'b' },
        { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
      ]
    } as never)
    const droppedWarns = warn.mock.calls.filter((c) => String(c[0]).includes('终端副作用节点被丢弃'))
    expect(droppedWarns.length).toBeGreaterThanOrEqual(1)
    expect(String(droppedWarns[0][0])).toContain('output-log')
    warn.mockRestore()
  })
})
