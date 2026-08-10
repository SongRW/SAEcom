/**
 * 横向复杂 DSL→graph 单测：多消息泳道、嵌套变长结构（TLV/repeat/optional）、
 * 前后依赖（长度驱动动态截取、CRC 重算比对）、循环序号接线、横向布局。
 */
import { describe, it, expect } from 'vitest'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import { importGraphState } from '@/features/script-editor/rete/graphState'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import type { ProtocolDsl, MessageSpec } from '@shared/protocol-dsl'

/** 横向复杂 DSL：REQ（含 TLV/repeat/optional/bitfield）+ ACK（含 optional），多消息泳道 */
const horizontalDsl: ProtocolDsl = {
  name: '横向协议',
  messages: [
    {
      msgType: 'REQ', typeId: 1,
      fields: [
        { kind: 'bitfield', name: '控制字', fields: [{ name: '优先级', bits: 4 }, { name: '重试', bits: 4 }] },
        { kind: 'uint', name: '命令码', width: 2, value: 0x10 },
        { kind: 'tlv', name: '参数区', entries: [
          { type: 0x10, value: 'AABBCC', mode: 'hex' },
          { type: 0x11, value: 'HELLO', mode: 'text' }
        ] },
        { kind: 'repeat-block', name: '通道表', count: 2, blockFields: [
          { kind: 'uint', name: '通道号', width: 1, value: 1 },
          { kind: 'uint', name: '通道值', width: 2, value: 100 }
        ] },
        { kind: 'optional', name: '扩展', flagBit: 0, field: { kind: 'uint', name: '扩展', width: 4, value: 0x10203040 } },
        { kind: 'length-prefix', name: 'len', width: 'u16' },
        { kind: 'crc', name: 'crc16', algorithm: 'CRC16', append: true }
      ]
    },
    {
      msgType: 'ACK', typeId: 2,
      fields: [
        { kind: 'uint', name: '命令回显', width: 2, value: 0x10 },
        { kind: 'uint', name: '状态', width: 1, value: 0 },
        { kind: 'optional', name: '错误码', flagBit: 1, field: { kind: 'uint', name: '错误码', width: 2, value: 0 } },
        { kind: 'length-prefix', name: 'len', width: 'u16' },
        { kind: 'crc', name: 'crc16', algorithm: 'CRC16', append: true }
      ]
    }
  ],
  transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
  loop: { count: 50 },
  verifyOnRecv: true
}

type AnyNode = { id: string; key: string; label?: string; data?: Record<string, unknown>; position?: { x: number; y: number } }
type AnyConn = { source: string; sourceOutput: string; target: string; targetInput: string }

function buildGraph(dsl: ProtocolDsl) {
  const graph = dslToGraph(dsl) as { nodes: AnyNode[]; connections: AnyConn[] }
  return {
    graph,
    nodes: graph.nodes as AnyNode[],
    conns: graph.connections as AnyConn[]
  }
}

describe('dslToGraph 横向复杂', () => {
  it('多消息：每条消息一条泳道（REQ/ACK 均含发送节点 + 帧头）', () => {
    const { nodes } = buildGraph(horizontalDsl)
    // 每个消息泳道独立：REQ 发送 + ACK 发送
    const sends = nodes.filter(n => n.key === 'output-tcp')
    expect(sends).toHaveLength(2)
    // 帧头自动加入：magic/version/msgType/seq 各消息一份
    const magicConsts = nodes.filter(n => n.key === 'protocol-const' && n.label?.includes('magic'))
    expect(magicConsts.length).toBeGreaterThanOrEqual(2)
  })

  it('嵌套结构：TLV（type+len+value 依赖）、repeat-block、optional 掩码检查', () => {
    const { nodes, conns } = buildGraph(horizontalDsl)
    // TLV：len-prefix 数量 = 2 条目 + 消息级 len
    const lenPrefixes = nodes.filter(n => n.key === 'protocol-len-prefix')
    expect(lenPrefixes.length).toBeGreaterThanOrEqual(3)
    // 动态长度依赖：value slice 的 length 输入来自 len 解析（前后依赖）
    const dynamicLen = conns.filter(c => c.targetInput === 'length' && c.sourceOutput === 'out')
    expect(dynamicLen.length).toBeGreaterThanOrEqual(3) // TLV×2 + body 动态截取
    // repeat-block：count const（组包侧）+ 接收侧 count 拆解（slice/parse）
    const countConsts = nodes.filter(n => n.key === 'protocol-const' && n.label?.includes('数量'))
    expect(countConsts.length).toBeGreaterThanOrEqual(1) // REQ 通道表组包
    const countSlices = nodes.filter(n => n.key === 'protocol-slice' && n.label?.includes('数量'))
    expect(countSlices.length).toBeGreaterThanOrEqual(1) // 接收侧拆数量
    // 块字段按 count 展开：块字段 slice ≥ count × blockFields
    const blockSlices = nodes.filter(n => n.key === 'protocol-slice' && n.label?.includes('.块'))
    expect(blockSlices.length).toBeGreaterThanOrEqual(2 * 2)
    // optional：numeric-calc 掩码 + compare-neq 存在性检查
    expect(nodes.some(n => n.key === 'numeric-calc')).toBe(true)
    expect(nodes.some(n => n.key === 'compare-neq')).toBe(true)
  })

  it('CRC 校验链：拆帧尾 + 重算 + compare-eq（反算）', () => {
    const { nodes, conns } = buildGraph(horizontalDsl)
    const crcCalcs = nodes.filter(n => n.key === 'protocol-crc' && n.label?.includes('重算'))
    expect(crcCalcs.length).toBeGreaterThanOrEqual(1)
    const cmpEq = nodes.filter(n => n.key === 'compare-eq')
    expect(cmpEq.length).toBeGreaterThanOrEqual(1)
    // 校验日志：compare 结果 → 日志
    const crcCheckLogs = nodes.filter(n => n.key === 'output-log' && n.label?.includes('校验'))
    expect(crcCheckLogs.length).toBeGreaterThanOrEqual(1)
    void conns
  })

  it('接收侧按 msgType 识别拆包（parse-u + 日志）', () => {
    const { nodes } = buildGraph(horizontalDsl)
    const msgTypeLogs = nodes.filter(n => n.key === 'output-log' && n.label?.includes('msgType'))
    expect(msgTypeLogs.length).toBeGreaterThanOrEqual(1)
  })

  it('循环序号接线：loop.out → 泳道 seq 常量 content', () => {
    const { conns, nodes } = buildGraph(horizontalDsl)
    const loop = nodes.find(n => n.key === 'control-loop')
    expect(loop).toBeDefined()
    const loopOutConns = conns.filter(c => c.source === loop!.id && c.sourceOutput === 'out')
    // 至少一条泳道接 loop.out（seq content 或循环体）
    expect(loopOutConns.length).toBeGreaterThanOrEqual(1)
    expect(loopOutConns.some(c => c.targetInput === 'content')).toBe(true)
  })

  it('横向布局：x 跨度明显大于泳道行数（不再是纵向大链）', () => {
    const { nodes } = buildGraph(horizontalDsl)
    const xs = nodes.map(n => n.position?.x ?? 0)
    const ys = nodes.map(n => n.position?.y ?? 0)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    // 横向多列（每泳道 ~12 列 × 300px）+ 泳道上下展开
    expect(maxX).toBeGreaterThan(1500)
    expect(maxY).toBeGreaterThan(800)
    // 图形宽高比不再极端纵向：宽/高 应大于 0.5
    expect(maxX / Math.max(maxY, 1)).toBeGreaterThan(0.5)
  })

  it('graph 契约 + codegen：importGraphState 只丢 custom、代码可生成', () => {
    const { graph, nodes } = buildGraph(horizontalDsl)
    const customCount = nodes.filter(n => n.key.startsWith('custom-')).length
    const imported = importGraphState(graph)
    expect(nodes.length - imported.nodes.length).toBeLessThanOrEqual(customCount)
    expect(() => generateCodeFromRete(graph)).not.toThrow()
    const code = generateCodeFromRete(graph)
    expect(code).toContain('sendTCP')
    expect(code).toContain('crc16')
    expect(code).toContain('listenTcpPackets')
    // 循环体：for 循环包含发送
    expect(code).toMatch(/for \(let _i = 0; _i < 50; _i\+\+\) \{[\s\S]*sendTCP/)
  })

  it('交互流 DSL 结构：send→wait→分支 由 converter 容忍（无 interactions 时不生成）', () => {
    // 当前节点系统下 control-wait 无输入端口，无法在图中表达时序；
    // 断言 converter 对含 interactions 的 DSL 仍产出合法 graph（不抛错）
    const dslWithInteraction: ProtocolDsl = {
      name: '交互协议',
      messages: [
        {
          msgType: 'REQ', typeId: 1,
          fields: [{ kind: 'uint', name: '命令码', width: 2, value: 0x10 }, { kind: 'crc', name: 'crc16', append: true }]
        }
      ],
      interactions: [{ send: 'REQ', expectAck: 'ACK', onAck: 'retry', retryCount: 2, timeout: 3000 }],
      transport: { mode: 'tcp-client', port: 39189 }
    }
    const { nodes } = buildGraph(dslWithInteraction)
    expect(nodes.length).toBeGreaterThan(0)
    expect(() => generateCodeFromRete(dslToGraph(dslWithInteraction) as any)).not.toThrow()
  })

  describe('receiveLog 压测防刷屏', () => {
    it("默认 console：字段明细 output-log，无 output-file", () => {
      const { nodes } = buildGraph(horizontalDsl) // 默认 receiveLog 未设置
      expect(nodes.some(n => n.key === 'output-log')).toBe(true)
      expect(nodes.some(n => n.key === 'output-file')).toBe(false)
    })

    it("file 模式：字段明细 + msgType 摘要 output-file（追加、指定路径），控制台仅节流进度日志", () => {
      const dsl: ProtocolDsl = { ...horizontalDsl, receiveLog: 'file', receiveLogPath: 'script-logs/横向.log', progressEvery: 10 }
      const { nodes } = buildGraph(dsl)
      const fileLogs = nodes.filter(n => n.key === 'output-file')
      expect(fileLogs.length).toBeGreaterThan(10)
      for (const n of fileLogs) {
        expect(n.data?.path).toBe('script-logs/横向.log')
        expect(n.data?.mode).toBe('追加')
      }
      const consoleLogs = nodes.filter(n => n.key === 'output-log')
      // 仅 1 个节流进度日志（控制台静默，字段/msgType 全进文件）
      expect(consoleLogs.length).toBe(1)
      expect(consoleLogs[0]?.label).toContain('进度')
    })

    it("off 模式：无任何日志节点", () => {
      const dsl: ProtocolDsl = { ...horizontalDsl, receiveLog: 'off' }
      const { nodes } = buildGraph(dsl)
      expect(nodes.some(n => n.key === 'output-log')).toBe(false)
      expect(nodes.some(n => n.key === 'output-file')).toBe(false)
    })

    it("file 模式 codegen：writeFile 调用充分、console.log 仅进度节流 + 错误兜底", () => {
      const dsl: ProtocolDsl = { ...horizontalDsl, receiveLog: 'file', receiveLogPath: 'script-logs/横向.log', progressEvery: 10 }
      const graph = dslToGraph(dsl) as any
      const code = generateCodeFromRete(graph)
      expect((code.match(/writeFile\(/g) || []).length).toBeGreaterThan(5)
      // 控制台仅 2 处：进度节流日志（if 分支内）+ 框架 catch 错误兜底
      const consoleLogLines = code.match(/console\.log/g) || []
      expect(consoleLogLines.length).toBeLessThanOrEqual(2)
      expect(code).toContain('进度·每10帧')
    })

    it("file 模式回归：string-template 用 value1 端口，importGraphState 不丢线、模板引用解析值", () => {
      const dsl: ProtocolDsl = { ...horizontalDsl, receiveLog: 'file', receiveLogPath: 'script-logs/横向.log' }
      const graph = dslToGraph(dsl) as any
      // 1) 连线必须连 value1 端口（string-template 静态端口，非字母序 a）
      const templateConns = (graph.connections as any[]).filter(c => {
        const target = (graph.nodes as any[]).find(n => n.id === c.target)
        return target?.key === 'string-template'
      })
      expect(templateConns.length).toBeGreaterThan(5)
      for (const c of templateConns) expect(c.targetInput).toBe('value1')
      // 2) importGraphState 后连线不丢（端口真实存在）
      const imported = importGraphState(graph)
      expect(imported.connections.length).toBeGreaterThan(5)
      // 3) codegen 模板内插值引用真实变量（_out_*），而非空 _last_recv
      //    模板格式：`${new Date().toLocaleString("zh-CN",{hour12:false})}.${...} [横向协议.字段] ${_out_N}\n`
      const code = generateCodeFromRete(imported)
      const tplMatches = code.match(/`\$\{new Date\(\)\.toLocaleString\("zh-CN",\{hour12:false\}\)\}.*\[横向协议\.[^\]]+\] \$\{_out_\d+\}/g) || []
      expect(tplMatches.length).toBeGreaterThan(5)
    })

    it("tcp-client 端口联动：端口常量节点只改一处，codegen 内联同一端口", () => {
      const dsl: ProtocolDsl = { ...horizontalDsl, receiveLog: 'file' }
      const graph = dslToGraph(dsl) as any
      const nodes = graph.nodes as any[]
      // 1) 端口常量节点存在
      const portConst = nodes.find(n => n.key === 'input-manual' && String(n.label).includes('端口(改这里)'))
      expect(portConst).toBeDefined()
      expect(String(portConst.data.content)).toBe('39189')
      // 2) 所有 output-tcp/input-tcp 的 port 输入都连到端口常量
      const tcpNodes = nodes.filter(n => n.key === 'output-tcp' || n.key === 'input-tcp')
      expect(tcpNodes.length).toBeGreaterThanOrEqual(3)
      for (const n of tcpNodes) {
        const portConns = (graph.connections as any[]).filter(c => c.target === n.id && c.targetInput === 'port')
        expect(portConns.length, `${n.label} 应连端口常量`).toBe(1)
        expect(portConns[0].source).toBe(portConst.id)
      }
      // 3) 节点 data 不再写死 port（由连线驱动）
      for (const n of tcpNodes) expect(n.data.port).toBeUndefined()
      // 4) codegen：sendTCP/listenTcpPackets 内联 39189
      const code = generateCodeFromRete(graph)
      expect(code).toContain('sendTCP("127.0.0.1", 39189,')
      expect(code).toContain('listenTcpPackets("127.0.0.1", 39189)')
      // 5) importGraphState 保留端口连线（port 输入端口真实存在）
      const imported = importGraphState(graph)
      const keptPortConns = imported.connections.filter(c => c.targetInput === 'port')
      expect(keptPortConns.length).toBe(tcpNodes.length)
    })
  })
})
