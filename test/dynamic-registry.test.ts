import { describe, it, expect, beforeEach } from 'vitest'
import { NodeRegistry } from '@/features/script-editor/nodes/component/dynamicRegistry'
import { UserNodeComponent } from '@/features/script-editor/nodes/component/userComponent'
import type { UserComponentDescriptor } from '@/features/script-editor/nodes/component/userComponent'
import {
  AbstractNodeComponent
} from '@/features/script-editor/nodes/component/AbstractNodeComponent'
import type { EmitContext } from '@/features/script-editor/codegen/context'

// 极简内置节点（测试用）
class FakeBuiltIn extends AbstractNodeComponent {
  readonly key = 'input-serial'
  readonly category = 'input' as const
  readonly name = '内置串口'
  ports() { return { inputs: [], outputs: [{ key: 'out', socket: 'dataSocket' as const }] } }
  controls() { return [] }
  sandboxApis() { return ['listenSerialPackets'] }
  emit(_ctx: EmitContext, _node: any, indent: string): string { return `${indent}// builtin\n` }
}

function makeUserDescriptor(overrides: Partial<UserComponentDescriptor> = {}): UserComponentDescriptor {
  return {
    key: 'custom-my-filter',
    name: '我的过滤器',
    inputs: [{ key: 'in', socket: 'dataSocket' }],
    outputs: [{ key: 'out', socket: 'dataSocket' }],
    controls: [],
    sandboxApis: [],
    emit: "return indent + 'var ' + helpers.outVar(node) + ' = ' + helpers.getInputVar(ctx, node) + ';\\n'",
    ...overrides
  }
}

describe('NodeRegistry 动态注册表', () => {
  let registry: NodeRegistry
  beforeEach(() => {
    registry = new NodeRegistry()
  })

  it('registerBuiltIn 灌入内置节点，之后只读', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    expect(registry.get('input-serial')).toBeDefined()
    expect(registry.all()).toHaveLength(1)
    // 重复灌入抛错
    expect(() => registry.registerBuiltIn([new FakeBuiltIn()])).toThrow()
  })

  it('registerUser 注册用户组件，合并查找', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    const user = new UserNodeComponent(makeUserDescriptor())
    registry.registerUser(user)
    expect(registry.get('input-serial')?.key).toBe('input-serial')
    expect(registry.get('custom-my-filter')?.key).toBe('custom-my-filter')
    expect(registry.all()).toHaveLength(2)
    expect(Object.keys(registry.definitions())).toHaveLength(2)
  })

  it('用户组件可覆盖同名内置 key（记 override，all 不重复）', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    const override = new UserNodeComponent(makeUserDescriptor({ key: 'input-serial', name: '覆盖串口' }))
    registry.registerUser(override)
    // 合并查找返回用户版
    expect(registry.get('input-serial')?.name).toBe('覆盖串口')
    expect(registry.all()).toHaveLength(1) // 不重复
    expect(registry.overriddenBuiltIn()).toContain('input-serial')
  })

  it('reloadUser 整批替换用户节点', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    registry.registerUser(new UserNodeComponent(makeUserDescriptor({ key: 'custom-a' })))
    registry.reloadUser([
      new UserNodeComponent(makeUserDescriptor({ key: 'custom-b' })),
      new UserNodeComponent(makeUserDescriptor({ key: 'custom-c' }))
    ])
    expect(registry.get('custom-a')).toBeUndefined()
    expect(registry.get('custom-b')).toBeDefined()
    expect(registry.get('custom-c')).toBeDefined()
  })

  it('unregisterUser 注销单个用户节点（不影响内置）', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    registry.registerUser(new UserNodeComponent(makeUserDescriptor()))
    expect(registry.get('custom-my-filter')).toBeDefined()
    registry.unregisterUser('custom-my-filter')
    expect(registry.get('custom-my-filter')).toBeUndefined()
    expect(registry.get('input-serial')).toBeDefined()
  })

  it('mcpTools 含用户组件的 MCP 描述', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    registry.registerUser(new UserNodeComponent(makeUserDescriptor({ description: '我的' })))
    const tools = registry.mcpTools()
    expect(tools).toHaveLength(2)
    const userTool = tools.find((t) => t.name === 'custom-my-filter')
    expect(userTool).toBeDefined()
    expect(userTool!.description).toBe('我的')
  })

  it('isUser 区分内置/用户', () => {
    registry.registerBuiltIn([new FakeBuiltIn()])
    registry.registerUser(new UserNodeComponent(makeUserDescriptor()))
    expect(registry.isUser('input-serial')).toBe(false)
    expect(registry.isUser('custom-my-filter')).toBe(true)
  })
})
