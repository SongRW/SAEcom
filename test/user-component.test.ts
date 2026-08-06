import { describe, it, expect } from 'vitest'
import { UserNodeComponent } from '@/features/script-editor/nodes/component/userComponent'
import type { UserComponentDescriptor } from '@/features/script-editor/nodes/component/userComponent'
import { validateUserDescriptor } from '@/features/script-editor/nodes/component/validate'
import { unknownSandboxApis } from '@/features/script-editor/nodes/component/sandboxCatalog'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { normalizeReteGraph } from '@/features/script-editor/codegen/graph'

function makeDescriptor(overrides: Partial<UserComponentDescriptor> = {}): UserComponentDescriptor {
  return {
    key: 'custom-add-prefix',
    name: '加前缀',
    description: '给输入加前缀',
    inputs: [{ key: 'in', socket: 'dataSocket', label: '输入' }],
    outputs: [{ key: 'out', socket: 'dataSocket', label: '输出' }],
    controls: [{ key: 'prefix', type: 'text', label: '前缀', default: 'PRE:' }],
    sandboxApis: [],
    emit: "return indent + 'var ' + helpers.outVar(node) + ' = ' + helpers.jsString(helpers.data(node).prefix || '') + ' + ' + helpers.getInputVar(ctx, node) + ';\\n'",
    ...overrides
  }
}

function makeCtx(): EmitContext {
  const graph = normalizeReteGraph({ nodes: [], connections: [] })
  const ctx: EmitContext = {
    graph,
    registry: {},
    varMap: new Map(),
    processedNodes: new Set(),
    blockedNodes: new Set(),
    inListenerClosure: false,
    emitNode: () => ''
  }
  return ctx
}

describe('UserNodeComponent', () => {
  it('toNodeDef 投影端口/控件/分类', () => {
    const comp = new UserNodeComponent(makeDescriptor())
    const def = comp.toNodeDef()
    expect(def.key).toBe('custom-add-prefix')
    expect(def.category).toBe('custom')
    expect(def.inputs).toHaveLength(1)
    expect(def.outputs).toHaveLength(1)
    expect(def.controls).toHaveLength(1)
  })

  it('toMcpTool 产出 MCP 描述（与内置同路径）', () => {
    const comp = new UserNodeComponent(makeDescriptor())
    const tool = comp.toMcpTool()
    expect(tool.name).toBe('custom-add-prefix')
    expect(tool.description).toBe('给输入加前缀')
    expect(tool.annotations?.category).toBe('custom')
    expect(tool.annotations?.nodeKey).toBe('custom-add-prefix')
  })

  it('emit 编译并产出正确代码（注入 helpers）', () => {
    const comp = new UserNodeComponent(makeDescriptor())
    const ctx = makeCtx()
    const node = { id: 'n1', key: 'custom-add-prefix', data: { prefix: 'HX:' } }
    const code = comp.emit(ctx, node as any, '  ')
    expect(code).toContain('_out_n1')
    expect(code).toContain('"HX:"')
    // helpers.getInputVar 在 emit 时求值为 _last_recv（无连接时的 fallback）
    expect(code).toContain('_last_recv')
  })

  it('emit 编译失败时产出占位注释，不抛异常', () => {
    const comp = new UserNodeComponent(makeDescriptor({ emit: '))) invalid syntax (((' }))
    const ctx = makeCtx()
    const code = comp.emit(ctx, { id: 'n1', key: 'custom-add-prefix' } as any, '  ')
    expect(code).toContain('编译失败')
  })

  it('sandboxApis 声明未知 API 时 validate 报错', () => {
    const r = validateUserDescriptor({
      ...makeDescriptor(),
      sandboxApis: ['sendToSerial', 'thisApiDoesNotExist']
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /未知 sandbox API.*thisApiDoesNotExist/.test(e.message))).toBe(true)
  })

  it('validate 拒绝非法 key（无 custom- 前缀）', () => {
    const r = validateUserDescriptor({ ...makeDescriptor(), key: 'BadKey' })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.field === 'key')).toBe(true)
  })

  it('validate 拒绝与内置/已存在冲突的 key', () => {
    const r = validateUserDescriptor(
      { ...makeDescriptor(), key: 'custom-add-prefix' },
      ['custom-add-prefix']
    )
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /已存在/.test(e.message))).toBe(true)
  })

  it('validate 拒绝重复的端口/控件 key', () => {
    const r = validateUserDescriptor({
      ...makeDescriptor(),
      inputs: [
        { key: 'in', socket: 'dataSocket' },
        { key: 'in', socket: 'dataSocket' }
      ]
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /端口 key 'in' 重复/.test(e.message))).toBe(true)
  })

  it('validate 接受合法描述符', () => {
    const r = validateUserDescriptor(makeDescriptor())
    expect(r.ok).toBe(true)
    expect(r.descriptor).toBeDefined()
    expect(r.descriptor!.key).toBe('custom-add-prefix')
  })

  it('validate control select 必须有非空 options', () => {
    const r = validateUserDescriptor({
      ...makeDescriptor(),
      controls: [{ key: 'mode', type: 'select', label: '模式' }] // 缺 options
    })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /select 类型 control 必须提供非空 options/.test(e.message))).toBe(true)
  })
})

describe('unknownSandboxApis（白名单校验基础）', () => {
  it('已知 API 返回空', () => {
    expect(unknownSandboxApis(['send', 'sendToSerial', 'sleep'])).toEqual([])
  })
  it('未知 API 被列出', () => {
    expect(unknownSandboxApis(['send', 'nonexistent'])).toEqual(['nonexistent'])
  })
})
