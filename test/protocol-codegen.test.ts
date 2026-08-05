import { describe, expect, it } from 'vitest'
import { generateCodeFromRete } from '../src/features/script-editor/codegen'
import { NODE_DEFINITIONS } from '../src/features/script-editor/nodes/definitions'
import type { ReteGraphExport } from '../shared/types'

function graph(nodes: ReteGraphExport['nodes'], connections: ReteGraphExport['connections'] = []): ReteGraphExport {
  return { nodes, connections }
}

describe('protocol node codegen', () => {
  it('registers protocol category nodes (no test-specialized nodes)', () => {
    expect(NODE_DEFINITIONS['protocol-const']?.category).toBe('protocol')
    expect(NODE_DEFINITIONS['protocol-bitfield']?.category).toBe('protocol')
    expect(NODE_DEFINITIONS['protocol-crc']?.name).toBe('协议CRC')
    expect(NODE_DEFINITIONS['protocol-len-prefix']?.name).toBe('长度前缀')
    // 已删除的测试特化节点不应再注册
    expect(NODE_DEFINITIONS['protocol-bitpack']).toBeUndefined()
    expect(NODE_DEFINITIONS['protocol-bit-unpack']).toBeUndefined()
    expect(NODE_DEFINITIONS['protocol-dual-seal']).toBeUndefined()
  })

  it('emits bitfield pack (binary concat of configured field widths)', () => {
    // 用户配置位段表 6+2+1+7（与复杂协议v2 等价，但完全由用户配置驱动，非焊死）
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'protocol-const', data: { mode: 'decimal', content: '42', width: 1 } },
      { id: '2', key: 'protocol-const', data: { mode: 'decimal', content: '3', width: 1 } },
      { id: '3', key: 'protocol-const', data: { mode: 'decimal', content: '0', width: 1 } },
      { id: '4', key: 'protocol-const', data: { mode: 'decimal', content: '127', width: 1 } },
      { id: '5', key: 'protocol-bitfield', data: {
        mode: '打包',
        fields: [
          { id: 'f1', name: '6bit', bits: 6 },
          { id: 'f2', name: '2bit', bits: 2 },
          { id: 'f3', name: '1bit', bits: 1 },
          { id: 'f4', name: '7bit', bits: 7 }
        ]
      } },
      { id: '6', key: 'output-log', data: { prefix: 'PACK' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '5', targetInput: 'field_f1' },
      { source: '2', sourceOutput: 'out', target: '5', targetInput: 'field_f2' },
      { source: '3', sourceOutput: 'out', target: '5', targetInput: 'field_f3' },
      { source: '4', sourceOutput: 'out', target: '5', targetInput: 'field_f4' },
      { source: '5', sourceOutput: 'out', target: '6', targetInput: 'in' }
    ]))

    // 打包：每段二进制 pad 到指定位宽，拼接后转 hex
    expect(code).toContain('convertBase')
    expect(code).toContain(', 6)')   // f1 pad 6
    expect(code).toContain(', 2)')   // f2 pad 2
    expect(code).toContain(', 1)')   // f3 pad 1
    expect(code).toContain(', 7)')   // f4 pad 7
    expect(code).toContain(', 4)')   // totalHexChars = ceil(16/8)*2 = 4
    expect(code).toContain('console.log("[PACK] "')
  })

  it('emits bitfield unpack as multi-output (per-field vars + composite varMap keys)', () => {
    // 解包模式：1 个 HEX 输入 → 多个 field 输出，下游按 sourceOutput 取不同值
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'AA55' } },
      { id: '2', key: 'protocol-bitfield', data: {
        mode: '解包',
        fields: [
          { id: 'f1', name: '6bit', bits: 6 },
          { id: 'f2', name: '7bit', bits: 7 }
        ]
      } },
      { id: '3', key: 'output-log', data: { prefix: 'F1' } },
      { id: '4', key: 'output-log', data: { prefix: 'F2' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'hex' },
      // 关键：两个下游连到同一节点的不同输出端口（field_f1 / field_f2）
      { source: '2', sourceOutput: 'field_f1', target: '3', targetInput: 'in' },
      { source: '2', sourceOutput: 'field_f2', target: '4', targetInput: 'in' }
    ]))

    // 解包产出多个变量：_out_2_f1 和 _out_2_f2
    expect(code).toContain('var _out_2_f1 =')
    expect(code).toContain('var _out_2_f2 =')
    // 两个下游各自引用对应变量（验证复合 key 解析生效）
    const f1LogLine = code.split('\n').find((l) => l.includes('"[F1] "') && l.includes('_out_2'))
    const f2LogLine = code.split('\n').find((l) => l.includes('"[F2] "') && l.includes('_out_2'))
    expect(f1LogLine, 'F1 日志应引用 _out_2_f1').toContain('_out_2_f1')
    expect(f2LogLine, 'F2 日志应引用 _out_2_f2').toContain('_out_2_f2')
    expect(f1LogLine).not.toContain('_out_2_f2')
    expect(f2LogLine).not.toContain('_out_2_f1')
  })

  it('dual crc chain replaces dual-seal (crc16 little-endian append → crc8 append)', () => {
    // 复杂协议v2 的双校验封包，现在用两个通用 protocol-crc 串联表达
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'protocol-const', data: { mode: 'hex', content: 'AA55' } },
      { id: '2', key: 'protocol-crc', data: { algorithm: 'CRC16', endian: '小端', append: '是' } },
      { id: '3', key: 'protocol-crc', data: { algorithm: 'CRC8', append: '是' } },
      { id: '4', key: 'output-log', data: { prefix: 'FRAME' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'body' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'body' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))

    expect(code).toContain('crc16')
    expect(code).toContain('crc8')
    expect(code).toContain('console.log("[FRAME] "')
    // 不应出现已删除的 dual-seal 痕迹
    expect(code).not.toContain('dual')
  })

  it('emits length-prefix and text encoding consts', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'protocol-const', data: { mode: 'text', content: '串口', encoding: 'gbk' } },
      { id: '2', key: 'protocol-len-prefix', data: { width: 'u16' } },
      { id: '3', key: 'output-log', data: { prefix: 'LP' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'body' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'in' }
    ]))

    expect(code).toContain('convertEncoding')
    expect(code).toContain("'gbk'")
    expect(code).toContain('textToHex')
  })

  it('protocol-slice uses config when no input connected', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'AABBCCDD' } },
      { id: '2', key: 'protocol-slice', data: { start: 1, length: 2 } },
      { id: '3', key: 'output-log', data: { prefix: 'S' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '2', targetInput: 'hex' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'in' }
    ]))
    // 无连线：start/length 用配置常量
    expect(code).toContain('parseInt(1)')
    expect(code).toContain('parseInt(2)')
  })

  it('protocol-slice uses upstream input when length port connected (dynamic parse)', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'input-manual', data: { content: 'AABBCCDDEEFF' } },
      { id: '2', key: 'protocol-const', data: { mode: 'decimal', content: '2', width: 1 } },
      { id: '3', key: 'protocol-slice', data: { start: 1, length: 0 } },
      { id: '4', key: 'output-log', data: { prefix: 'DYN' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'hex' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'length' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))
    // length 端口有连线 → 用上游变量 _out_2，不再用 length 配置 0
    expect(code).toContain('parseInt(_out_2)')
    // length 配置 0 不应出现（被输入覆盖）；start 仍用配置 1
    expect(code).toContain('parseInt(1)')
    // _l 行不应是 parseInt(0)
    const lLine = code.split('\n').find((l) => l.includes('var _l ='))
    expect(lLine).toContain('_out_2')
  })

  it('protocol-concat dynamically joins N hex inputs by data.ports', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'protocol-const', data: { mode: 'hex', content: 'AA' } },
      { id: '2', key: 'protocol-const', data: { mode: 'hex', content: 'BB' } },
      { id: '3', key: 'protocol-const', data: { mode: 'hex', content: 'CC' } },
      { id: '4', key: 'protocol-concat', data: { ports: 3 } },
      { id: '5', key: 'output-log', data: { prefix: 'C' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '4', targetInput: 'a' },
      { source: '2', sourceOutput: 'out', target: '4', targetInput: 'b' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'c' },
      { source: '4', sourceOutput: 'out', target: '5', targetInput: 'in' }
    ]))

    expect(code).toContain('String(_out_1||\'\') + String(_out_2||\'\') + String(_out_3||\'\')')
    expect(code).toContain('.toUpperCase()')
  })

  it('protocol-concat defaults to 2 ports when data.ports is absent', () => {
    const code = generateCodeFromRete(graph([
      { id: '1', key: 'protocol-const', data: { mode: 'hex', content: 'AA' } },
      { id: '2', key: 'protocol-const', data: { mode: 'hex', content: 'BB' } },
      { id: '3', key: 'protocol-concat', data: {} },
      { id: '4', key: 'output-log', data: { prefix: 'C' } }
    ], [
      { source: '1', sourceOutput: 'out', target: '3', targetInput: 'a' },
      { source: '2', sourceOutput: 'out', target: '3', targetInput: 'b' },
      { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
    ]))

    // 2 端口 → 只有 a + b 两段拼接（concat 节点自身输出变量是 _out_3）
    const concatLine = code.split('\n').find((l) => l.includes('var _out_3 ='))
    expect(concatLine).toContain('String(_out_1||\'\') + String(_out_2||\'\')')
    // 不应有第三段输入（_out_4 等上游变量被引用）
    expect(concatLine).not.toContain('||\'\') + String(_out_4')
  })
})
