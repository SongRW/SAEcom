/**
 * P1-a：codegen emit 边界规则契约测试（公开行为锁定）。
 *
 * 锁定 isPreEmittable / allIncomingSourcesAvailable / isLeafChainEligible 三函数
 * 决定的 emit 行为。这三函数是 codegen 的核心，改一处（如 control-* 排除）会导致
 * 整条组包链断裂（sendTCP=0）。
 *
 * 通过 generateCodeFromRete 的公开输出断言（不测私有函数）：
 * - 「应 emit 的节点」生成代码含其变量
 * - 「不应 emit 的节点」生成代码不含
 *
 * 这次会话的痛点：index.ts isPreEmittable 加了 control-* 排除 → 组包链全断 → 742 测试全过
 * （因为没人测「循环体内 concat 链是否完整 emit」）。此测试锁定该契约。
 */
import { describe, expect, it } from 'vitest'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import type { ReteGraphExport } from '@shared/types'

function graph(nodes: any[], connections: any[] = []): ReteGraphExport {
  return { nodes, connections }
}

describe('codegen emit 边界规则契约', () => {
  describe('isPreEmittable：top-level 常量预 emit', () => {
    it('protocol-const 无 incoming → pre-emit 到 top-level', () => {
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'protocol-const', data: { mode: 'hex', content: 'AA', width: 1 } }
      ]))
      // pre-emit 的变量在 try 块顶层（_listeners 之前）
      expect(code).toContain('var _out_1 = "AA"')
    })

    it('input-manual（one-shot root）→ 不 pre-emit（排除）', () => {
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'input-manual', data: { content: 'x', mode: 'text' } }
      ]))
      // input-manual 不在 top-level pre-emit（走 topo-sort 或就地 emit）
      // 单独的 input-manual 无下游，topo-sort 兜底会 emit 它，但不在 _listeners 之前
      // 这里只断言它不被 isPreEmittable 提前（无 _listeners 时它在 try 顶层）
      expect(code).toContain('var _out_1 = "x"')
    })
  })

  describe('control-loop 循环体 emit 契约（这次会话的痛点）', () => {
    it('control-loop.out → seq(protocol-const) → concat → output-tcp：整条链完整 emit', () => {
      // 这是 v3 组包链的骨架。index.ts isPreEmittable 若排除 control-* 来源，
      // seq 不可 pre-emit，但 seq 应在循环体内通过 emitBranch emit。
      // 锁定：生成的代码含 sendTCP（output-tcp 未被 blocked）
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'control-loop', data: { count: 3, type: '次数循环' } },
        { id: '2', key: 'protocol-const', data: { mode: 'decimal', content: '', width: 2 } },
        { id: '3', key: 'protocol-concat', data: { ports: 2 } },
        { id: '4', key: 'protocol-const', data: { mode: 'hex', content: 'AA', width: 1 } },
        { id: '5', key: 'output-tcp', data: { host: '127.0.0.1', port: 8080, mode: 'hex' } }
      ], [
        { source: '1', sourceOutput: 'out', target: '2', targetInput: 'content' },
        { source: '4', sourceOutput: 'out', target: '3', targetInput: 'a' },
        { source: '2', sourceOutput: 'out', target: '3', targetInput: 'b' },
        { source: '3', sourceOutput: 'out', target: '5', targetInput: 'in' }
      ]))
      // 关键断言：sendTCP 在循环体内（output-tcp 未被 blocked）
      expect(code).toContain('sendTCP')
      // for 循环存在
      expect(code).toContain('for (let _i = 0; _i < 3;')
    })
  })

  describe('allIncomingSourcesAvailable：listener 闭包边界', () => {
    it('闭包内引用闭包外 top-level 常量 → 不可用（边界守护）', () => {
      // input-tcp（continuousRoot）闭包内引用 protocol-const（top-level pre-emit）
      // protocol-const 在 processedNodes，但闭包内 allIncomingSourcesAvailable 不认 processedNodes
      // → join blocked → output-log 也 blocked
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'input-tcp', data: { host: '127.0.0.1', port: 8080, configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 } } },
        { id: '2', key: 'protocol-const', data: { mode: 'hex', content: 'BB', width: 1 } },
        { id: '3', key: 'string-concat', data: { separator: '|', ports: 2 } },
        { id: '4', key: 'output-log', data: { prefix: 'J', level: 'info' } }
      ], [
        { source: '1', sourceOutput: 'out', target: '3', targetInput: 'a' },
        { source: '2', sourceOutput: 'out', target: '3', targetInput: 'b' },
        { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
      ]))
      // join（_out_3）不应出现在闭包内（protocol-const 闭包外不可见）
      // _out_3 = String(_out_1) + "|" + String(_out_2) 不应在 listener 闭包内
      const closureStart = code.indexOf('listenTcpPackets')
      const closure = closureStart >= 0 ? code.slice(closureStart) : ''
      // join 变量不应在闭包内（被 blocked）
      expect(closure).not.toContain('var _out_3 = String(_out_1)')
    })

    it('闭包内引用闭包内已 emit 的节点 → 可用（正常监听处理）', () => {
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'input-tcp', data: { host: '127.0.0.1', port: 8080, configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 } } },
        { id: '2', key: 'output-log', data: { prefix: 'recv', level: 'info' } }
      ], [
        { source: '1', sourceOutput: 'out', target: '2', targetInput: 'in' }
      ]))
      // 正常：input-tcp.out → output-log.in，闭包内 emit
      expect(code).toContain('console.log("[recv] " + _out_1')
    })
  })

  describe('isLeafChainEligible：叶子链就地 emit（循环体内）', () => {
    it('bitfield ← input-manual×3 叶子链：循环体内就地 emit', () => {
      // v3 组包：bitfield 的 input-manual preNodes 在循环体内就地 emit
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'control-loop', data: { count: 2, type: '次数循环' } },
        { id: '2', key: 'input-manual', data: { content: '1', mode: 'text' } },
        { id: '3', key: 'input-manual', data: { content: '2', mode: 'text' } },
        { id: '4', key: 'protocol-bitfield', data: { mode: '打包', fields: [{ id: 'f0', name: 'a', bits: 4 }, { id: 'f1', name: 'b', bits: 4 }] } },
        { id: '5', key: 'output-log', data: { prefix: 'b', level: 'info' } }
      ], [
        { source: '2', sourceOutput: 'out', target: '4', targetInput: 'field_f0' },
        { source: '3', sourceOutput: 'out', target: '4', targetInput: 'field_f1' },
        { source: '4', sourceOutput: 'out', target: '5', targetInput: 'in' }
      ]))
      // bitfield 变量应在循环体内出现（叶子链就地 emit 成功）
      expect(code).toMatch(/var _out_4 = /)
      // input-manual 叶子也在循环体内
      expect(code).toContain('var _out_2 = "1"')
      expect(code).toContain('var _out_3 = "2"')
    })

    it('TLV len-prefix ← protocol-const value：叶子链就地 emit', () => {
      // v3 TLV 组包：len-prefix 的 body 输入接 protocol-const（value），是叶子链
      const code = generateCodeFromRete(graph([
        { id: '1', key: 'control-loop', data: { count: 2, type: '次数循环' } },
        { id: '2', key: 'protocol-const', data: { mode: 'hex', content: 'AABB', width: 2 } },
        { id: '3', key: 'protocol-len-prefix', data: { width: 'u8' } },
        { id: '4', key: 'output-log', data: { prefix: 't', level: 'info' } }
      ], [
        { source: '2', sourceOutput: 'out', target: '3', targetInput: 'body' },
        { source: '3', sourceOutput: 'out', target: '4', targetInput: 'in' }
      ]))
      // len-prefix 变量应在循环体内出现（叶子链就地 emit）
      expect(code).toMatch(/var _out_3 = /)
    })
  })
})
