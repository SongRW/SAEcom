import { describe, it, expect } from 'vitest'
import { emitModbus } from '../src/features/script-editor/codegen/emit/modbus'
import type { EmitContext } from '../src/features/script-editor/codegen/context'
import type { NormalizedGraph } from '../src/features/script-editor/codegen/graph'

// 构造最小可用的 EmitContext。incomingByNode 为扁平的 Map<string, ReteGraphConnection[]>，
// 由 incomingForInput 按 targetInput 过滤（与 graph.ts 的真实结构一致）。
function mockCtx(): EmitContext {
  return {
    graph: {
      nodes: [],
      nodeMap: new Map(),
      connections: [],
      incomingByNode: new Map(),
      outgoingByNode: new Map()
    } as unknown as NormalizedGraph,
    registry: {},
    varMap: new Map(),
    processedNodes: new Set(),
    blockedNodes: new Set(),
    inListenerClosure: false,
    emitNode: () => ''
  }
}

describe('emitModbus', () => {
  it('modbus-read 产出 await modbusRead(...) 调用并注册输出变量', () => {
    const node = {
      id: 'n1',
      key: 'modbus-read',
      data: { panel: 'panel-1', functionCode: '3', slaveId: 2, startAddress: 0, quantity: 4 }
    } as any
    const ctx = mockCtx()
    const code = emitModbus(ctx, node, '')
    expect(code).toContain('await modbusRead("panel-1", 3, 2, 0, 4)')
    expect(code).toMatch(/var _out_n1/)
    expect(ctx.varMap.get('n1')).toBe('_out_n1')
  })

  it('modbus-write 无上游连接时用 config.values 解析为数组', () => {
    const node = {
      id: 'n2',
      key: 'modbus-write',
      data: { panel: 'panel-1', functionCode: '6', slaveId: 1, startAddress: 5, values: '42, 99' }
    } as any
    const ctx = mockCtx()
    const code = emitModbus(ctx, node, '')
    expect(code).toContain('await modbusWrite("panel-1", 6, 1, 5, [42,99])')
    expect(code).toMatch(/var _out_n2/)
  })

  it('modbus-write 有上游连接时用上游变量', () => {
    const node = {
      id: 'n3',
      key: 'modbus-write',
      data: { panel: 'panel-1', functionCode: '16', slaveId: 1, startAddress: 0 }
    } as any
    const ctx = mockCtx()
    // 模拟上游连接：incomingByNode 是扁平数组，incomingForInput 会按 targetInput='in' 过滤
    ctx.graph.incomingByNode.set('n3', [
      { source: 'n0', sourceOutput: 'out', target: 'n3', targetInput: 'in' }
    ])
    ctx.varMap.set('n0', '_out_n0')
    const code = emitModbus(ctx, node, '')
    expect(code).toContain('_out_n0')
    expect(code).toContain('await modbusWrite("panel-1", 16, 1, 0, _out_n0)')
  })
})
