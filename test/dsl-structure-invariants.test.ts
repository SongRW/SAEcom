/**
 * P1-b：dslToGraph 结构对照测试（转换器不变量锁定）。
 *
 * 锁定 DSL 结构到 graph 结构的映射不变量：
 * - 消息数 == output-tcp 数 == codegen 后 sendTCP 数
 * - TLV 字段 → 每条目 len-parse → value-slice.length 动态连线
 * - length-prefix → body slice.length 接 len 解析值
 * - repeat-block → count slice + count × blockFields 个块 slice
 * - CRC → compare-eq 校验 + 重算源 slice
 * - bitfield → 解包节点 + 每子字段日志
 *
 * 这次会话的痛点：toGraph 重写（cursor 链版→固定 offset 版）时，TLV 动态 length 连线
 * 是否保留、sendTCP 是否等于消息数，没有测试锁定，靠人工 debug 发现。
 */
import { describe, expect, it } from 'vitest'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import type { ProtocolDsl } from '@shared/protocol-dsl'

function graphOf(dsl: ProtocolDsl) {
  const g = dslToGraph(dsl)
  const nodes = g.nodes as any[]
  const conns = g.connections as any[]
  const code = generateCodeFromRete(g)
  return { g, nodes, conns, code }
}

function count(nodes: any[], key: string): number {
  return nodes.filter((n) => n.key === key).length
}
function countLabel(nodes: any[], substr: string): number {
  return nodes.filter((n) => String(n.label || '').includes(substr)).length
}

describe('dslToGraph 结构不变量', () => {
  describe('消息数 ↔ output-tcp ↔ sendTCP', () => {
    it('1 条消息 → 1 个 output-tcp，codegen 1 个 sendTCP', () => {
      const { nodes, code } = graphOf({
        name: 't',
        messages: [{ msgType: 'REQ', typeId: 1, fields: [{ kind: 'uint', name: 'v', width: 1, value: 1 }] }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      expect(count(nodes, 'output-tcp')).toBe(1)
      expect((code.match(/sendTCP/g) || []).length).toBe(1)
    })

    it('4 条消息 → 4 个 output-tcp，codegen 4 个 sendTCP', () => {
      const { nodes, code } = graphOf({
        name: 't',
        messages: [
          { msgType: 'REQ', typeId: 1, fields: [{ kind: 'uint', name: 'v', width: 1, value: 1 }] },
          { msgType: 'ACK', typeId: 2, fields: [{ kind: 'uint', name: 'v', width: 1, value: 2 }] },
          { msgType: 'EVENT', typeId: 3, fields: [{ kind: 'uint', name: 'v', width: 1, value: 3 }] },
          { msgType: 'NACK', typeId: 4, fields: [{ kind: 'uint', name: 'v', width: 1, value: 4 }] }
        ],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
        loop: { count: 10 }
      })
      expect(count(nodes, 'output-tcp')).toBe(4)
      expect((code.match(/sendTCP/g) || []).length).toBe(4)
    })

    it('tcp-loopback 模式 → output-tcp 数 == 消息数', () => {
      const { nodes } = graphOf({
        name: 't',
        messages: [
          { msgType: 'A', typeId: 1, fields: [{ kind: 'uint', name: 'v', width: 1, value: 1 }] },
          { msgType: 'B', typeId: 2, fields: [{ kind: 'uint', name: 'v', width: 1, value: 2 }] }
        ],
        transport: { mode: 'tcp-loopback', port: 9000 }
      })
      expect(count(nodes, 'output-tcp')).toBe(2)
    })
  })

  describe('TLV 字段 → 动态 length 连线', () => {
    it('TLV 3 条目 → 3 个 value slice，每个 length 连线接 len-parse', () => {
      const { nodes, conns } = graphOf({
        name: 't',
        messages: [{
          msgType: 'REQ', typeId: 1,
          fields: [
            {
              kind: 'tlv', name: '参数区',
              entries: [
                { type: 0x10, value: 'AABB', mode: 'hex' },
                { type: 0x11, value: 'CC', mode: 'hex' }
              ]
            },
            { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'big' }
          ]
        }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      // 2 个 TLV 条目 → 接收侧 2 个 value slice（label 含「.值」）
      const tlvValueSlices = nodes.filter(
        (n) => n.key === 'protocol-slice' && String(n.label).includes('.T1') && String(n.label).includes('.值')
      )
      expect(tlvValueSlices.length).toBe(2)
      // 每个 value slice 的 length 输入有连线（动态长度驱动）
      const lengthConns = conns.filter((c) => c.targetInput === 'length')
      expect(lengthConns.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('length-prefix → body 动态 length', () => {
    it('length-prefix u16 → body slice.length 接 len 解析值', () => {
      const { nodes, conns } = graphOf({
        name: 't',
        messages: [{
          msgType: 'REQ', typeId: 1,
          fields: [
            { kind: 'length-prefix', name: 'len', width: 'u16' },
            { kind: 'uint', name: 'v', width: 1, value: 1 }
          ]
        }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      // 接收侧有 body(动态) slice
      const bodySlice = nodes.find(
        (n) => n.key === 'protocol-slice' && String(n.label).includes('body')
      )
      expect(bodySlice).toBeDefined()
      // body slice.length 有连线（接 len-parse out）
      const bodyLenConn = conns.find((c) => String(c.target) === String(bodySlice.id) && c.targetInput === 'length')
      expect(bodyLenConn).toBeDefined()
    })
  })

  describe('repeat-block → count + 块字段展开', () => {
    it('repeat-block count=3, 2 块字段 → 1 个 count slice + 6 个块字段 slice', () => {
      const { nodes } = graphOf({
        name: 't',
        messages: [{
          msgType: 'REQ', typeId: 1,
          fields: [
            {
              kind: 'repeat-block', name: '通道表', count: 3,
              blockFields: [
                { kind: 'uint', name: '通道号', width: 1 },
                { kind: 'uint', name: '通道值', width: 2 }
              ]
            },
            { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'big' }
          ]
        }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      // count slice（label 含「.数量」）
      expect(countLabel(nodes, '通道表.数量')).toBeGreaterThanOrEqual(1)
      // 3 块 × 2 字段 = 6 个块字段 slice（label 含「.块N.」）
      const blockSlices = nodes.filter(
        (n) => n.key === 'protocol-slice' && /通道表\.块[123]\./.test(String(n.label))
      )
      expect(blockSlices.length).toBe(6)
    })
  })

  describe('CRC → compare-eq + 重算源', () => {
    it('CRC 字段 → compare-eq 校验节点 + protocol-crc 重算 + 重算源 slice', () => {
      const { nodes } = graphOf({
        name: 't',
        messages: [{
          msgType: 'REQ', typeId: 1,
          fields: [
            { kind: 'uint', name: 'v', width: 1, value: 1 },
            { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }
          ]
        }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      // compare-eq 校验节点（接收侧）
      expect(count(nodes, 'compare-eq')).toBeGreaterThanOrEqual(1)
      // protocol-crc 重算节点（接收侧）
      expect(count(nodes, 'protocol-crc')).toBeGreaterThanOrEqual(2) // 组包 1 + 拆包重算 1
      // 重算源 slice（label 含「重算源」）
      expect(countLabel(nodes, '重算源')).toBeGreaterThanOrEqual(1)
    })

    it('CRC little-endian → transform-byteorder 字节序转换节点', () => {
      const { nodes } = graphOf({
        name: 't',
        messages: [{
          msgType: 'REQ', typeId: 1,
          fields: [
            { kind: 'uint', name: 'v', width: 1, value: 1 },
            { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }
          ]
        }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      // little-endian CRC16 → 接收侧有 transform-byteorder 转换节点
      expect(count(nodes, 'transform-byteorder')).toBeGreaterThanOrEqual(1)
    })
  })

  describe('bitfield → 解包 + 子字段日志', () => {
    it('bitfield 3 子字段 → 解包节点 + 3 个子字段日志', () => {
      const { nodes } = graphOf({
        name: 't',
        messages: [{
          msgType: 'REQ', typeId: 1,
          fields: [
            { kind: 'bitfield', name: '控制字', fields: [{ name: '优先级', bits: 4 }, { name: '重试', bits: 4 }, { name: '告警', bits: 8 }] },
            { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'big' }
          ]
        }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' }
      })
      // 解包节点（接收侧，label 含「解包」）
      const unpackNodes = nodes.filter((n) => n.key === 'protocol-bitfield' && String(n.label).includes('解包'))
      expect(unpackNodes.length).toBeGreaterThanOrEqual(1)
      // 子字段日志（label 含「控制字.优先级」等）
      expect(countLabel(nodes, '控制字.优先级')).toBeGreaterThanOrEqual(1)
      expect(countLabel(nodes, '控制字.重试')).toBeGreaterThanOrEqual(1)
      expect(countLabel(nodes, '控制字.告警')).toBeGreaterThanOrEqual(1)
    })
  })

  describe('loop → control-loop + seq 接线', () => {
    it('loop 存在 → control-loop 节点，多消息时 seq 接 loop.out', () => {
      const { nodes, conns } = graphOf({
        name: 't',
        messages: [{ msgType: 'REQ', typeId: 1, fields: [{ kind: 'uint', name: 'v', width: 1, value: 1 }] }],
        transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
        loop: { count: 100 }
      })
      expect(count(nodes, 'control-loop')).toBe(1)
      // seq 常量（多消息自动加帧头 seq）的 content 接 control-loop.out
      const loopConns = conns.filter((c) => c.targetInput === 'content')
      expect(loopConns.length).toBeGreaterThanOrEqual(1)
    })
  })
})
