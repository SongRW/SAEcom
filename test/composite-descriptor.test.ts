import { describe, expect, it } from 'vitest'
import {
  validateCompositeDescriptor
} from '@/features/script-editor/nodes/component/validate'
import {
  CompositeNodeComponent
} from '@/features/script-editor/nodes/component/compositeComponent'
import type { CompositeComponentDescriptor } from '@/features/script-editor/nodes/component/compositeComponent'

function makeComposite(overrides: Partial<CompositeComponentDescriptor> = {}): CompositeComponentDescriptor {
  return {
    key: 'custom-combo',
    name: '组合',
    description: '',
    category: 'custom',
    inputs: [{ key: 'in', socket: 'dataSocket' }],
    outputs: [{ key: 'out', socket: 'dataSocket' }],
    subgraph: {
      nodes: [
        { id: 'n1', key: 'string-concat', label: '拼接', data: { ports: 1 } }
      ],
      connections: []
    },
    inputBindings: [{ portKey: 'in', nodeId: 'n1', nodePortKey: 'a' }],
    outputBindings: [{ portKey: 'out', nodeId: 'n1', nodePortKey: 'out' }],
    ...overrides
  }
}

describe('validateCompositeDescriptor（组合组件校验）', () => {
  it('合法描述符通过（key/name/ports/subgraph/bindings）', () => {
    const r = validateCompositeDescriptor(makeComposite())
    expect(r.ok).toBe(true)
    expect(r.descriptor?.key).toBe('custom-combo')
  })

  it('无 emit 也合法（组合组件逻辑在子图内，emit 字段不存在）', () => {
    const d = makeComposite()
    expect('emit' in d).toBe(false)
    const r = validateCompositeDescriptor(d)
    expect(r.ok).toBe(true)
  })

  it('key 非法/冲突拒绝', () => {
    expect(validateCompositeDescriptor(makeComposite({ key: 'bad key!' })).ok).toBe(false)
    expect(validateCompositeDescriptor(makeComposite(), ['custom-combo']).ok).toBe(false)
  })

  it('subgraph.nodes 空拒绝', () => {
    const r = validateCompositeDescriptor(makeComposite({
      subgraph: { nodes: [], connections: [] }
    }))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.field === 'subgraph')).toBe(true)
  })

  it('bindings 引用不存在的子图节点拒绝', () => {
    const r = validateCompositeDescriptor(makeComposite({
      inputBindings: [{ portKey: 'in', nodeId: 'ghost', nodePortKey: 'a' }]
    }))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.field?.includes('inputBindings'))).toBe(true)
  })

  it('端口校验复用（非法端口形状拒绝）', () => {
    const d = makeComposite() as unknown as Record<string, unknown>
    const r = validateCompositeDescriptor({ ...d, inputs: 'not-array' })
    expect(r.ok).toBe(false)
  })
})

describe('CompositeNodeComponent 构造（C 层接线）', () => {
  it('构造后暴露 ports 且 emit 委托 emitComposite', () => {
    const comp = new CompositeNodeComponent(makeComposite())
    const ports = comp.ports()
    expect(ports.inputs[0].key).toBe('in')
    expect(ports.outputs[0].key).toBe('out')
    // 组合组件 emit 委托子图内联（构造真实 ctx：resolveCompositeInputVar 需要 graph.incomingByNode）
    const graph = {
      nodes: [{ id: 'p1', key: 'input-manual', label: '', data: {} }],
      connections: [],
      nodeMap: new Map(),
      incomingByNode: new Map(),
      outgoingByNode: new Map()
    }
    const ctx = {
      graph,
      registry: {},
      varMap: new Map(),
      processedNodes: new Set(),
      blockedNodes: new Set(),
      inListenerClosure: false,
      emitNode: () => ''
    }
    const code = comp.emit(ctx as never, { id: 'x', key: 'custom-combo', data: {} } as never, '  ')
    expect(typeof code).toBe('string')
    // IIFE 包裹子图内联
    expect(code).toContain('async () =>')
  })

  it('controls 对外为空（配置在子图内部节点上）', () => {
    const comp = new CompositeNodeComponent(makeComposite())
    expect(comp.controls()).toEqual([])
  })
})
