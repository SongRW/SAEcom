/**
 * 适配器模式单测：验证 NodeAdapter 注册/覆盖/扩展机制。
 *
 * 适配器模式让 DSL→graph 转换器支持不同节点系统：
 * - 默认注册 SAEcom 内置适配器（protocol-* + custom-*）
 * - 插件可注册自定义适配器覆盖默认（如 const → plugin-my-const）
 * - 插件可注册新 kind 扩展 DSL（如 mqtt-publish）
 */
import { describe, it, expect } from 'vitest'
import { AdapterRegistry } from '@/features/script-editor/dsl/adapters'
import { registerDefaultAdapters, createDefaultRegistry } from '@/features/script-editor/dsl/saecomAdapters'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import type { ProtocolDsl } from '@shared/protocol-dsl'

describe('适配器注册表（AdapterRegistry）', () => {
  it('默认适配器覆盖全部 7 种 kind', () => {
    const reg = createDefaultRegistry()
    const kinds = reg.registeredKinds()
    expect(kinds).toContain('const')
    expect(kinds).toContain('uint')
    expect(kinds).toContain('text')
    expect(kinds).toContain('bitfield')
    expect(kinds).toContain('crc')
    expect(kinds).toContain('length-prefix')
    expect(kinds).toContain('custom')
  })

  it('resolve 返回已注册的适配器', () => {
    const reg = createDefaultRegistry()
    expect(reg.resolve({ kind: 'const', name: 'x', value: 'AA' } as any)).not.toBeNull()
  })

  it('resolve 未注册的 kind 返回 null', () => {
    const reg = new AdapterRegistry()
    expect(reg.resolve({ kind: 'mqtt-publish', name: 'x' } as any)).toBeNull()
  })

  it('register 覆盖已有适配器（后注册胜出）', () => {
    const reg = createDefaultRegistry()
    // 覆盖 const：改为产出 my-custom-const 节点
    reg.register('const', () => ({
      key: 'my-custom-const',
      data: { value: 'OVERRIDDEN' },
      label: '自定义常量',
      outputPort: 'out'
    }))
    const spec = reg.resolve({ kind: 'const', name: 'x', value: 'AA' } as any)?.({ kind: 'const', name: 'x', value: 'AA' } as any, { namePrefix: 't', fieldIndex: 0 }) as any
    expect(spec.key).toBe('my-custom-const')
    expect(spec.data.value).toBe('OVERRIDDEN')
  })

  it('register 新 kind 扩展 DSL', () => {
    const reg = createDefaultRegistry()
    // 注册一个新的 mqtt-publish kind
    reg.register('mqtt-publish', (field: any) => ({
      key: 'output-mqtt',
      data: { topic: field.topic ?? 'default/topic', payload: field.payload ?? '' },
      label: 'MQTT发布',
      outputPort: 'out'
    }))
    expect(reg.registeredKinds()).toContain('mqtt-publish')
    const spec = reg.resolve({ kind: 'mqtt-publish', name: 'x', topic: 'sensor/temp' } as any)?.({ kind: 'mqtt-publish', name: 'x', topic: 'sensor/temp' } as any, { namePrefix: 't', fieldIndex: 0 }) as any
    expect(spec.key).toBe('output-mqtt')
    expect(spec.data.topic).toBe('sensor/temp')
  })
})

describe('dslToGraph 使用自定义适配器', () => {
  it('传入自定义 registry → 产出含覆盖节点的 graph', () => {
    const reg = createDefaultRegistry()
    // 覆盖 const：改为 numeric-base 节点（模拟"某项目无 protocol-const，用 numeric-base 替代"）
    reg.register('const', (field: any, ctx) => ({
      key: 'numeric-base',
      data: { from: '十六进制', to: '十六进制' },
      label: `${ctx.namePrefix}.${field.name}`,
      outputPort: 'out'
    }))

    const dsl: ProtocolDsl = {
      name: '适配器测试',
      fields: [
        { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
        { kind: 'crc', name: 'crc', append: true }
      ]
    }
    const graph = dslToGraph(dsl, reg) as { nodes: any[]; connections: any[] }
    const keys = graph.nodes.map(n => n.key)
    // const 应映射到 numeric-base（覆盖后），而非默认的 protocol-const
    expect(keys).toContain('numeric-base')
    expect(keys).not.toContain('protocol-const')
  })

  it('不传 registry → 用默认 SAEcom 适配器（protocol-* 节点）', () => {
    const dsl: ProtocolDsl = {
      name: '默认测试',
      fields: [{ kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' }]
    }
    const graph = dslToGraph(dsl) as { nodes: any[]; connections: any[] }
    const keys = graph.nodes.map(n => n.key)
    expect(keys).toContain('protocol-const')
  })
})
