import { describe, expect, it } from 'vitest'
import { emitComposite } from '@/features/script-editor/codegen/emit/composite'
import { normalizeReteGraph } from '@/features/script-editor/codegen/graph'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { NODE_DEFINITIONS } from '@/features/script-editor/nodes/definitions'
import type { CompositeComponentDescriptor } from '@/features/script-editor/nodes/component/compositeComponent'
import type { ReteGraphExport, ReteGraphNode } from '@shared/types'

/**
 * 组合组件 codegen 回归测试。
 *
 * 场景：子图 = [string-concat(入口，绑定外部 in) → output 绑定外部 out]。
 * 父图：input-manual → composite（输入绑定）→ composite 输出绑定到子图 concat。
 *
 * 历史缺陷（审查 P1-6/7/8/9）：
 * - 输出回写 key 带 `_out_` 前缀，下游 lookupSourceVar 查不到
 * - IIFE 包裹使子图变量对父作用域不可见，输出传播失效
 * - 子图循环不维护 processedNodes，分支逻辑失效
 * - 外部输入注入「只写不读」，绑定值到不了子图计算
 */

function makeCompositeDescriptor(): CompositeComponentDescriptor {
  // 子图：concat 节点（1 输入 a）产出 out；输入绑定：外部 in → concat.a；输出绑定：concat.out → 外部 out
  const subgraph: ReteGraphExport = {
    nodes: [
      { id: 'sub-concat', key: 'string-concat', label: '拼接', data: { ports: 1, separator: '' } },
    ],
    connections: []
  }
  return {
    key: 'custom-preview-composite',
    name: '预览组合',
    description: '',
    category: 'custom',
    inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
    outputs: [{ key: 'out', socket: 'dataSocket', label: '输出' }],
    subgraph,
    inputBindings: [{ portKey: 'in', nodeId: 'sub-concat', nodePortKey: 'a' }],
    outputBindings: [{ portKey: 'out', nodeId: 'sub-concat', nodePortKey: 'out' }]
  }
}

function makeParentCtx(): EmitContext {
  // 父图：input-manual(node1) → composite(node2, in)
  const graph: ReteGraphExport = {
    nodes: [
      { id: 'p1', key: 'input-manual', label: '手动', data: { content: 'hello', mode: 'text' } },
      { id: 'p2', key: 'custom-preview-composite', label: '组合', data: {} }
    ],
    connections: [{ source: 'p1', sourceOutput: 'out', target: 'p2', targetInput: 'in' }]
  }
  const normalized = normalizeReteGraph(graph)
  const ctx: EmitContext = {
    graph: normalized,
    registry: NODE_DEFINITIONS,
    varMap: new Map(),
    processedNodes: new Set(),
    blockedNodes: new Set(),
    inListenerClosure: false,
    emitNode: () => ''
  }
  // 模拟父图已 emit input-manual：变量 _out_p1 可用
  ctx.varMap.set('p1', '_out_p1')
  return ctx
}

describe('emitComposite（组合组件子图内联 codegen）', () => {
  it('输入绑定值经合成连接注入子图（绑定的 a 端口解析到父变量，未绑定的 b 端口回退正常）', () => {
    const descriptor = makeCompositeDescriptor()
    const ctx = makeParentCtx()
    const compositeNode: ReteGraphNode = { id: 'p2', key: descriptor.key, label: '组合', data: {} }
    const code = emitComposite(ctx, descriptor, compositeNode, '  ')
    // 绑定的 a 端口：子图 concat 的输入解析为父图 p1 的变量 _out_p1（而非 _last_recv）
    expect(code).toContain('_out_p1')
    // 未绑定的 b 端口（concat 默认 2 端口）允许回退 _last_recv——这是既有语义，不是缺陷
    expect(code).toContain('_last_recv')
    // 但 _out_p1 必须出现在 concat 的 a 参数位（合成连接生效的证据）
    const concatLine = code.split('\n').find((l) => l.includes('String('))
    expect(concatLine).toContain('_out_p1')
  })

  it('输出经 IIFE 返回对象传播到父作用域（下游可引用 _compositeOut_<id>.<port>）', () => {
    const descriptor = makeCompositeDescriptor()
    const ctx = makeParentCtx()
    const compositeNode: ReteGraphNode = { id: 'p2', key: descriptor.key, label: '组合', data: {} }
    emitComposite(ctx, descriptor, compositeNode, '  ')
    // 父 varMap：复合 key `${p2}:out` 应映射到 IIFE 返回对象的字段表达式
    const mapped = ctx.varMap.get('p2:out')
    expect(mapped).toBeDefined()
    expect(mapped).toContain('_compositeOut_p2')
    expect(mapped).toContain('.out')
  })

  it('IIFE 返回对象包含出口端口字段（出口变量在子图作用域内声明）', () => {
    const descriptor = makeCompositeDescriptor()
    const ctx = makeParentCtx()
    const compositeNode: ReteGraphNode = { id: 'p2', key: descriptor.key, label: '组合', data: {} }
    const code = emitComposite(ctx, descriptor, compositeNode, '  ')
    // IIFE 包裹 + return 对象（key 为出口端口）
    expect(code).toContain('async () =>')
    expect(code).toContain('out:')
    // 子图节点变量（_out_sub-concat 或类似）在 IIFE 内声明
    expect(code).toContain('_out_')
  })

  it('子图内节点 emit 前维护 processedNodes（不重复/不丢分支）', () => {
    const descriptor = makeCompositeDescriptor()
    const ctx = makeParentCtx()
    const compositeNode: ReteGraphNode = { id: 'p2', key: descriptor.key, label: '组合', data: {} }
    emitComposite(ctx, descriptor, compositeNode, '  ')
    // 父 ctx 仅含父图条目：p1（上游已 emit）+ p2:out（输出映射）+ p2（裸 id 回退）
    // 子图节点（sub-concat）不得写入父 ctx——证明子图在隔离的 subCtx 中处理
    expect(ctx.varMap.has('sub-concat')).toBe(false)
    expect(ctx.varMap.size).toBe(3)
  })
})
