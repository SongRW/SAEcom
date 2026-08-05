import { describe, it, expect } from 'vitest'
import { emitTransform } from '../src/features/script-editor/codegen/emit/transform'
import type { EmitContext } from '../src/features/script-editor/codegen/context'
import type { NormalizedGraph } from '../src/features/script-editor/codegen/graph'

// 构造最小可用 EmitContext：上游 n0 输出 _out_n0，经 'in' 端口连入当前节点。
function mockCtx(nodeId: string, sourceId = 'n0'): EmitContext {
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

function padNode(data: Record<string, unknown> = {}) {
  return { id: 'n1', key: 'string-pad', data } as any
}

describe('emitTransform — string-pad', () => {
  it('左侧 padStart + 截断到长度（等价旧 ("0"+v).slice(-2) 技巧）', () => {
    const ctx = mockCtx('n1')
    const node = padNode({ length: 2, char: '0', side: '左侧', overflow: '截断到长度' })
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('.padStart(2, _c)')
    expect(code).toContain('.slice(-2)')
    expect(code).not.toContain('.padEnd(')
    expect(ctx.varMap.get('n1')).toBe('_out_n1')
  })

  it('右侧 padEnd + 截断到长度', () => {
    const node = padNode({ length: 3, char: '_', side: '右侧', overflow: '截断到长度' })
    const code = emitTransform(mockCtx('n1'), node, '  ')
    expect(code).toContain('.padEnd(3, _c)')
    expect(code).toContain('.slice(0, 3)')
    expect(code).not.toContain('.padStart(')
  })

  it('左侧 padStart + 保留原长（不截断）', () => {
    const node = padNode({ length: 4, char: '0', side: '左侧', overflow: '保留原长' })
    const code = emitTransform(mockCtx('n1'), node, '  ')
    expect(code).toContain('.padStart(4, _c)')
    expect(code).not.toContain('.slice(')
  })

  it('填充字符取首字符（"ab" → "a"），空串兜底空格', () => {
    const longChar = padNode({ length: 2, char: 'ab', side: '左侧', overflow: '保留原长' })
    const longCode = emitTransform(mockCtx('n1'), longChar, '  ')
    expect(longCode).toContain('"ab"')
    expect(longCode).toContain('.charAt(0)')

    const emptyChar = padNode({ length: 2, char: '', side: '左侧', overflow: '保留原长' })
    const emptyCode = emitTransform(mockCtx('n1'), emptyChar, '  ')
    // 空串经 valueAsString 兜底为 '0'，再 charAt(0) 得 '0'；空格兜底只发生在运行时
    expect(emptyCode).toContain('"0"')
  })

  it('缺少 length/char/side/overflow 走默认值（length=2, char=0, 左侧, 保留原长）', () => {
    const node = padNode({})
    const code = emitTransform(mockCtx('n1'), node, '  ')
    expect(code).toContain('.padStart(2, _c)')
    expect(code).not.toContain('.slice(')
    expect(code).toContain('"0"')
  })

  it('回归：padStart 作用于已 String 化的 _s，而非原始（可能为 Number 的）输入', () => {
    // 上游 protocol-parse-u 返回 Number，数字无 padStart；必须先 String() 再 .padStart
    const node = padNode({ length: 2, char: '0', side: '左侧', overflow: '截断到长度' })
    const code = emitTransform(mockCtx('n1'), node, '  ')
    expect(code).toContain('var _s = String(_out_n0')
    expect(code).toContain('_s.padStart(2, _c)')
    // 不能直接对原始输入调 padStart
    expect(code).not.toMatch(/[^_s]\.padStart\(/)
  })
})
