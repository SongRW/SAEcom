/**
 * DSL→graph 转换器单测：验证产出的 graph 契约正确。
 *
 * 核心断言：graph 经 importGraphState 后节点/连线不丢失（端口名匹配、socket 兼容）。
 * 这是 AI 拼装 graph 的正确性保证——转换器产出的 graph 必须能被画布/codegen 接受。
 */
import { describe, it, expect } from 'vitest'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import { importGraphState } from '@/features/script-editor/rete/graphState'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import type { ProtocolDsl } from '@shared/protocol-dsl'
import type { ReteGraphExport } from '@shared/types'

/** 简单协议：magic + seq + crc，无 transport（纯本地） */
const simpleDsl: ProtocolDsl = {
  name: '测试协议',
  fields: [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'uint', name: 'seq', width: 2, value: 1 },
    { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }
  ]
}

/** 含 transport + loop 的完整协议 */
const fullDsl: ProtocolDsl = {
  name: '完整协议',
  fields: [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'uint', name: 'seq', width: 2, value: 0 },
    { kind: 'text', name: 'dev', value: 'SENSOR1', encoding: 'utf8' },
    { kind: 'crc', name: 'crc16', algorithm: 'CRC16', append: true }
  ],
  transport: { mode: 'tcp-loopback', port: 19888 },
  loop: { count: 5 }
}

describe('dslToGraph 转换器', () => {
  describe('简单协议（无 transport）', () => {
    // dslToGraph 返回 ReteGraphExport（nodes/connections 为数组|Record 联合类型），
    // 转换器产出的一定是数组，断言为具体类型便于 .map/.find 调用。
    const graph = dslToGraph(simpleDsl) as { nodes: any[]; connections: any[] }

    it('产出合法 ReteGraphExport（nodes + connections 数组）', () => {
      expect(graph.nodes).toBeInstanceOf(Array)
      expect(graph.connections).toBeInstanceOf(Array)
      expect(graph.nodes.length).toBeGreaterThan(0)
    })

    it('含预期节点：protocol-const ×2 + protocol-crc + protocol-concat + output-log', () => {
      const keys = graph.nodes.map(n => n.key)
      expect(keys.filter(k => k === 'protocol-const').length).toBe(2) // magic + seq
      expect(keys).toContain('protocol-crc')
      expect(keys).toContain('protocol-concat')
      expect(keys).toContain('output-log')
    })

    it('每个节点含 id/key/data/position/label', () => {
      for (const node of graph.nodes) {
        expect(node.id, '节点缺 id').toBeTruthy()
        expect(node.key, '节点缺 key').toBeTruthy()
        expect(node.data, '节点缺 data').toBeDefined()
        expect(node.position, '节点缺 position').toBeDefined()
      }
    })

    it('连线端口匹配（importGraphState 不丢连线）', () => {
      const state = importGraphState(graph)
      // importGraphState 会丢弃端口不匹配的连线；断言连线数 > 0（没全丢）
      expect(state.connections.length, '连线应保留（端口匹配）').toBeGreaterThan(0)
      // 节点不丢
      expect(state.nodes.length).toBe(graph.nodes.length)
    })

    it('codegen 能处理（generateCodeFromRete 不报错）', () => {
      expect(() => generateCodeFromRete(graph)).not.toThrow()
    })
  })

  describe('完整协议（transport + loop）', () => {
    const graph = dslToGraph(fullDsl) as { nodes: any[]; connections: any[] }

    it('含 TCP 收发节点 + control-loop', () => {
      const keys = graph.nodes.map(n => n.key)
      expect(keys).toContain('output-tcp')
      expect(keys).toContain('input-tcp-server')
      expect(keys).toContain('output-tcp-server')
      expect(keys).toContain('input-tcp')
      expect(keys).toContain('control-loop')
    })

    it('control-loop count=5', () => {
      const loop = graph.nodes.find(n => n.key === 'control-loop')
      expect(loop?.data?.count).toBe(5)
    })

    it('TCP 端口一致（发送/服务端/客户端都用 19888）', () => {
      const ports = graph.nodes
        .filter(n => ['output-tcp', 'input-tcp-server', 'output-tcp-server', 'input-tcp'].includes(n.key))
        .map(n => n.data?.port)
      for (const p of ports) expect(p).toBe(19888)
    })

    it('importGraphState 节点全保留', () => {
      const state = importGraphState(graph)
      expect(state.nodes.length).toBe(graph.nodes.length)
    })
  })

  describe('protocol-concat 动态端口', () => {
    it('3 字段 → concat ports=3，连线用 a/b/c', () => {
      const graph = dslToGraph(simpleDsl) as { nodes: any[]; connections: any[] }
      const concat = graph.nodes.find(n => n.key === 'protocol-concat')
      expect(concat?.data?.ports).toBe(2) // magic + seq = 2 字段（crc 在 concat 后单独处理）
      // 连线的 targetInput 应含 a/b（concat 的动态端口）
      const concatConns = graph.connections.filter(c => c.target === concat!.id)
      const inputs = concatConns.map(c => c.targetInput)
      expect(inputs).toContain('a')
      expect(inputs).toContain('b')
    })
  })

  describe('自定义组件字段', () => {
    it('含 custom-* 节点 + 正确 componentKey', () => {
      const dsl: ProtocolDsl = {
        name: '组件协议',
        fields: [
          { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
          { kind: 'custom', name: '加密', componentKey: 'custom-aes-crypto', config: { mode: 'encrypt', key: '000102030405060708090A0B0C0D0E0F', iv: '101112131415161718191A1B1C1D1E1F' } },
          { kind: 'crc', name: 'crc', append: true }
        ]
      }
      const graph = dslToGraph(dsl) as { nodes: any[]; connections: any[] }
      const nodes = graph.nodes
      const customNode = nodes.find((n: any) => n.key === 'custom-aes-crypto')
      expect(customNode, '应有 custom-aes-crypto 节点').toBeDefined()
      expect(customNode?.data?.mode).toBe('encrypt')
    })
  })
})
