import { describe, it, expect } from 'vitest'
import { emitTransform } from '../src/features/script-editor/codegen/emit/transform'
import type { EmitContext } from '../src/features/script-editor/codegen/context'
import type { NormalizedGraph } from '../src/features/script-editor/codegen/graph'

// 构造最小可用的 EmitContext：上游节点 n0 的输出变量为 _out_n0，
// 通过 'in' 端口连到当前节点，getInputVar(ctx, node) 因此解析为 _out_n0。
function mockCtxWithArrayInput(nodeId: string, sourceId = 'n0'): EmitContext {
  const ctx: EmitContext = {
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
  ctx.graph.incomingByNode.set(nodeId, [
    { source: sourceId, sourceOutput: 'out', target: nodeId, targetInput: 'in' }
  ])
  ctx.varMap.set(sourceId, '_out_n0')
  return ctx
}

function namefieldsNode(keys: Array<{ id: string; name: string }>) {
  return { id: 'n1', key: 'transform-namefields', data: { keys } } as any
}

describe('emitTransform — transform-namefields', () => {
  it('标签数 = 数组长度：按位置映射为带名对象', () => {
    const node = namefieldsNode([
      { id: 'k1', name: '温度' },
      { id: 'k2', name: '湿度' },
      { id: 'k3', name: '气压' }
    ])
    const ctx = mockCtxWithArrayInput('n1')
    const code = emitTransform(ctx, node, '  ')
    // 形如 { "温度": (_out_n0[0] == null ? null : _out_n0[0]), ... }
    expect(code).toContain('"温度": (_out_n0[0] == null ? null : _out_n0[0])')
    expect(code).toContain('"湿度": (_out_n0[1] == null ? null : _out_n0[1])')
    expect(code).toContain('"气压": (_out_n0[2] == null ? null : _out_n0[2])')
    expect(ctx.varMap.get('n1')).toBe('_out_n1')
  })

  it('标签少于数组项：多余数组项丢弃，不出现更高下标', () => {
    const node = namefieldsNode([{ id: 'k1', name: '温度' }])
    const ctx = mockCtxWithArrayInput('n1')
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('"温度": (_out_n0[0]')
    expect(code).not.toContain('_out_n0[1]')
  })

  it('标签多于数组项：缺失项仍生成 null 兜底表达式', () => {
    const node = namefieldsNode([
      { id: 'k1', name: '温度' },
      { id: 'k2', name: '湿度' },
      { id: 'k3', name: '气压' }
    ])
    const ctx = mockCtxWithArrayInput('n1')
    const code = emitTransform(ctx, node, '  ')
    // 即使数组没有 [2]，codegen 仍生成下标 2 的访问（运行时 _out_n0[2] 为 undefined → null）
    expect(code).toContain('"气压": (_out_n0[2] == null ? null : _out_n0[2])')
  })

  it('标签含空名：跳过（与 transform-object 行为一致）', () => {
    const node = namefieldsNode([
      { id: 'k1', name: '温度' },
      { id: 'k2', name: '   ' },
      { id: 'k3', name: '气压' }
    ])
    const ctx = mockCtxWithArrayInput('n1')
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('"温度":')
    expect(code).toContain('"气压":')
    // 空名的 k2 不应出现键名；但下标仍按位置递进（气压取 [2]）
    expect(code).not.toMatch(/":\s*\(_out_n0\[1\]/)
  })

  it('无标签：输出空对象 {}', () => {
    const node = namefieldsNode([])
    const ctx = mockCtxWithArrayInput('n1')
    const code = emitTransform(ctx, node, '  ')
    expect(code).toMatch(/var _out_n1 = \{\};/)
  })

  it('无 keys 数据（undefined）：输出空对象 {}', () => {
    const node = { id: 'n1', key: 'transform-namefields', data: {} } as any
    const ctx = mockCtxWithArrayInput('n1')
    const code = emitTransform(ctx, node, '  ')
    expect(code).toMatch(/var _out_n1 = \{\};/)
  })
})
