/**
 * P0-b：dslToGraph graph 完整性自检测试。
 *
 * 锁定 validateGraph 的行为：
 * - 正常 dslToGraph 产出（v3/v2）无 error
 * - 人造断链（terminal 无 incoming、loop 无 outgoing、dangling connection）报 error
 *
 * 这是转换器 bug 的检测闸门。下次 entryOffset 累加错或连线漏时，此测试暴露问题。
 */
import { describe, expect, it, vi } from 'vitest'
import { validateGraph } from '@/features/script-editor/dsl/validateGraph'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import type { ProtocolDsl } from '@shared/protocol-dsl'

describe('validateGraph graph 完整性自检', () => {
  it('正常 v3 graph：无 error', () => {
    const dsl: ProtocolDsl = {
      name: '测试',
      messages: [
        { msgType: 'REQ', typeId: 1, fields: [{ kind: 'uint', name: 'v', width: 1, value: 1 }, { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }] }
      ],
      transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
      loop: { count: 10 },
      receiveLog: 'console'
    }
    const graph = dslToGraph(dsl)
    const result = validateGraph(graph, { silent: true })
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('多消息 v3 graph：无 error（4 消息同构）', () => {
    const dsl: ProtocolDsl = {
      name: 'v3',
      messages: [
        { msgType: 'REQ', typeId: 1, fields: [{ kind: 'uint', name: 'v', width: 1, value: 1 }, { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }] },
        { msgType: 'ACK', typeId: 2, fields: [{ kind: 'uint', name: 'v', width: 1, value: 2 }, { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }] }
      ],
      transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
      loop: { count: 5 },
      receiveLog: 'file',
      receiveLogPath: 'script-logs/v3.log'
    }
    const graph = dslToGraph(dsl)
    const result = validateGraph(graph, { silent: true })
    expect(result.errors).toEqual([])
  })

  it('终端节点无 incoming：报 error', () => {
    const result = validateGraph({
      nodes: [{ id: '1', key: 'output-tcp', data: { host: '127.0.0.1', port: 8080, mode: 'hex' } }],
      connections: []
    }, { silent: true })
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.kind === 'terminal-no-incoming')).toBe(true)
  })

  it('control-loop 无 outgoing：报 error', () => {
    const result = validateGraph({
      nodes: [
        { id: '1', key: 'control-loop', data: { count: 10, type: '次数循环' } },
        { id: '2', key: 'output-log', data: { prefix: 'x', level: 'info' } }
      ],
      connections: []
    }, { silent: true })
    expect(result.errors.some((e) => e.kind === 'loop-no-outgoing')).toBe(true)
  })

  it('dangling connection（引用不存在节点）：报 error', () => {
    const result = validateGraph({
      nodes: [{ id: '1', key: 'input-manual', data: { content: 'x', mode: 'text' } }],
      connections: [{ source: '999', sourceOutput: 'out', target: '1', targetInput: 'in' }]
    }, { silent: true })
    expect(result.errors.some((e) => e.kind === 'dangling-connection' && e.message.includes('source=999'))).toBe(true)
  })

  it('throwOnError：校验失败时抛错（测试锁定用）', () => {
    expect(() => validateGraph({
      nodes: [{ id: '1', key: 'output-tcp', data: {} }],
      connections: []
    }, { throwOnError: true, silent: true })).toThrow(/graph 完整性校验失败/)
  })

  it('console.warn：非 silent 模式报告 error（开发可见）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    validateGraph({
      nodes: [{ id: '1', key: 'output-tcp', data: {} }],
      connections: []
    })
    const graphWarns = warn.mock.calls.filter((c) => String(c[0]).includes('graph 完整性校验失败'))
    expect(graphWarns.length).toBeGreaterThanOrEqual(1)
    warn.mockRestore()
  })
})
