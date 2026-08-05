import { describe, it, expect } from 'vitest'
import { emitTransform } from '../src/features/script-editor/codegen/emit/transform'
import type { EmitContext } from '../src/features/script-editor/codegen/context'
import type { NormalizedGraph } from '../src/features/script-editor/codegen/graph'

// 构造最小 EmitContext：按字母端口名（a, b, ...）连入上游。
function mockCtx(nodeId: string, ports: Array<[string, string]>): EmitContext {
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
  const conns = ports.map(([portKey, srcId]) => {
    ctx.varMap.set(srcId, `_out_${srcId}`)
    return { source: srcId, sourceOutput: 'out', target: nodeId, targetInput: portKey }
  })
  ctx.graph.incomingByNode.set(nodeId, conns)
  return ctx
}

function exprNode(data: Record<string, unknown> = {}) {
  return { id: 'e1', key: 'script-expr', data } as any
}

describe('emitTransform — script-expr', () => {
  it('字母端口绑定为同名局部变量，表达式作为返回值', () => {
    const ctx = mockCtx('e1', [['a', 'n0'], ['b', 'n1']])
    const node = exprNode({ ports: 2, expr: 'a + b' })
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('var a = _out_n0;')
    expect(code).toContain('var b = _out_n1;')
    expect(code).toContain('return (a + b);')
    expect(ctx.varMap.get('e1')).toBe('_out_e1')
  })

  it('6 输入：时间换算表达式（new Date + Date.UTC）', () => {
    const ctx = mockCtx('e1', [['a', 'y0'], ['b', 'm0'], ['c', 'd0'], ['d', 'h0'], ['e', 'mi0'], ['f', 's0']])
    const node = exprNode({
      ports: 6,
      expr: '(new Date(Date.UTC(a, b-1, c, d, e, f) + 8*3600*1000)).getDate()'
    })
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('var a = _out_y0;')
    expect(code).toContain('var f = _out_s0;')
    expect(code).toContain('return ((new Date(Date.UTC(a, b-1, c, d, e, f) + 8*3600*1000)).getDate());')
  })

  it('未连线的端口兜底为 null', () => {
    const ctx = mockCtx('e1', [['a', 'n0']])  // 只连 a
    const node = exprNode({ ports: 2, expr: 'a * 2' })
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('var a = _out_n0;')
    expect(code).toContain('var b = null;')
  })

  it('缺省表达式走默认 (a + b)', () => {
    const ctx = mockCtx('e1', [['a', 'n0'], ['b', 'n1']])
    const node = exprNode({ ports: 2 })  // 无 expr
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('return ((a + b));')
  })

  it('ports 缺省走 MIN_CONCAT_PORTS(2)', () => {
    const ctx = mockCtx('e1', [['a', 'n0'], ['b', 'n1']])
    const node = exprNode({ expr: 'a - b' })  // 无 ports
    const code = emitTransform(ctx, node, '  ')
    expect(code).toContain('var a = _out_n0;')
    expect(code).toContain('var b = _out_n1;')
    expect(code).not.toContain('var c =')  // 只有 2 个
  })

  // —— 实跑验证表达式语义正确（Date 联动进位）——
  function evalExpr(code: string, vars: Record<string, number>): any {
    const prelude = Object.entries(vars).map(([k, v]) => `var _out_${k} = ${v};`).join('\n')
    // eslint-disable-next-line no-new-func
    return new Function(`${prelude}\n${code}\nreturn _out_e1;`)()
  }

  it('实跑：UTC+8 跨日取 day（1/1 20:00 UTC → 1/2）', () => {
    const ctx = mockCtx('e1', [['a', 'y0'], ['b', 'm0'], ['c', 'd0'], ['d', 'h0'], ['e', 'mi0'], ['f', 's0']])
    const node = exprNode({
      ports: 6,
      expr: '(new Date(Date.UTC(a, b-1, c, d, e, f) + 8*3600*1000)).getDate()'
    })
    const code = emitTransform(ctx, node, '  ')
    const day = evalExpr(code, { y0: 2026, m0: 1, d0: 1, h0: 20, mi0: 0, s0: 0 })
    expect(day).toBe(2)
  })

  it('实跑：UTC+8 取 hour（10:00 UTC → 18:00）', () => {
    const ctx = mockCtx('e1', [['a', 'y0'], ['b', 'm0'], ['c', 'd0'], ['d', 'h0'], ['e', 'mi0'], ['f', 's0']])
    const node = exprNode({
      ports: 6,
      expr: '(new Date(Date.UTC(a, b-1, c, d, e, f) + 8*3600*1000)).getUTCHours()'
    })
    const code = emitTransform(ctx, node, '  ')
    const hour = evalExpr(code, { y0: 2026, m0: 1, d0: 1, h0: 10, mi0: 0, s0: 0 })
    expect(hour).toBe(18)
  })
})
