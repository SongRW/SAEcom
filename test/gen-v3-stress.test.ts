/**
 * v3 可视化压测脚本生成器。
 *
 * 构造一个「横向复杂」ProtocolDsl：4 种消息类型（REQ/ACK/EVENT/NACK）每条泳道，
 * 共享同一帧结构（msgType 区分类型，值随类型变化），每泳道包含嵌套变长结构
 * （TLV/repeat-block/optional）、位域、多编码、长度前缀、CRC、自定义组件字段；
 * 经 dslToGraph 转成 ~200 节点的 ReteGraphExport，再用 buildScriptFile 包装成
 * 可视化脚本文件（VS_FLOW_START...VS_FLOW_END 格式）。
 *
 * 接收侧按 messages[0] 共享布局拆包（反算镜像）：长度前缀驱动 body 动态截取、
 * CRC 重算比对、msgType 识别——所有消息类型同构，回环解析正确。
 *
 * 运行：npx vitest run test/gen-v3-stress.test.ts --reporter=verbose
 *
 * 参数（改下方 OPTIONS）：targetNodes 控制目标节点数。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildScriptFile } from '@/features/script-editor/persistence'
import { importGraphState } from '@/features/script-editor/rete/graphState'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import { runPipeline } from '@/features/script-editor/dsl/pipeline'
import { splitFrame, type FieldLayoutItem } from '@shared/protocol-tools'
import { generateProtocolDoc } from '@/features/script-editor/dsl/generateDoc'
import type { ProtocolDsl, MessageSpec, ProtocolField } from '@shared/protocol-dsl'

const OPTIONS = {
  targetNodes: 200,
  outputPath: path.resolve(__dirname, '../shared/samples/复杂协议v3-可视化.js')
}

/** 共享帧结构：位域 + 多编码 + TLV + repeat + optional + 传感器 + 自定义组件 + 长度前缀 + CRC */
function frameFields(typeId: number): ProtocolField[] {
  const k = typeId * 0x100 // 值随类型变化（保持同构，回环解析正确）
  return [
    { kind: 'bitfield', name: '控制字', fields: [
      { name: '优先级', bits: 4 },
      { name: '重试', bits: 4 },
      { name: '告警', bits: 8 }
    ] },
    { kind: 'uint', name: '命令码', width: 2, value: 0x10 + typeId },
    { kind: 'uint', name: '目标ID', width: 2, value: typeId },
    { kind: 'text', name: '设备名', value: `STATION-${String.fromCharCode(64 + typeId)}`, encoding: 'utf8' },
    { kind: 'tlv', name: '参数区', entries: [
      { type: 0x10, value: 'AABBCC', mode: 'hex' },
      { type: 0x11, value: 'HELLO', mode: 'text' },
      { type: 0x12, value: '0102030405', mode: 'hex' }
    ] },
    { kind: 'repeat-block', name: '通道表', count: 3, blockFields: [
      { kind: 'uint', name: '通道号', width: 1, value: 1 },
      { kind: 'uint', name: '通道值', width: 2, value: 100 + typeId }
    ] },
    { kind: 'uint', name: '传感器1', width: 2, value: k + 1 },
    { kind: 'uint', name: '传感器2', width: 2, value: k + 2 },
    { kind: 'uint', name: '传感器3', width: 2, value: k + 3 },
    { kind: 'optional', name: '扩展时间', flagBit: 0, field: { kind: 'uint', name: '扩展时间', width: 4, value: k + 0x10203040 } },
    { kind: 'custom', name: '载荷加密', componentKey: 'custom-aes-crypto', config: { mode: 'encrypt', key: '000102030405060708090A0B0C0D0E0F', iv: '101112131415161718191A1B1C1D1E1F' } },
    { kind: 'length-prefix', name: 'len', width: 'u16' },
    { kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true }
  ]
}

/** 4 种消息类型：共享结构，msgType/值区分（同构 → 回环拆包正确） */
function buildMessages(): MessageSpec[] {
  return [
    { msgType: 'REQ', typeId: 1, fields: frameFields(1) },
    { msgType: 'ACK', typeId: 2, fields: frameFields(2) },
    { msgType: 'EVENT', typeId: 3, fields: frameFields(3) },
    { msgType: 'NACK', typeId: 4, fields: frameFields(4) }
  ]
}

/** 构造横向复杂 DSL：4 消息类型 × 嵌套结构，目标产出 ~200 节点。
 *  循环 1000 次压测；receiveLog='file'：字段明细写文件，
 *  控制台仅每 100 帧一行进度摘要（防刷屏）。
 *  端口：tcp-client 连本地 TCP 服务器面板（echo 环回），端口由用户在画布上
 *  修改 output-tcp/input-tcp 节点的 port 控件（与面板端口一致）。 */
function buildLargeDsl(): ProtocolDsl {
  return {
    name: '复杂协议v3',
    messages: buildMessages(),
    transport: { mode: 'tcp-client', port: 39189, host: '127.0.0.1' },
    loop: { count: 1000 },
    verifyOnRecv: true,
    receiveLog: 'file',
    receiveLogPath: 'script-logs/复杂协议v3.log',
    progressEvery: 100
  }
}

describe('v3 可视化压测脚本生成器（三步 pipeline 版）', () => {
  it('第一步：协议文档生成器产出正确字段表（含动态偏移标注）', () => {
    const dsl = buildLargeDsl()
    const doc = generateProtocolDoc(dsl)
    expect(doc.name).toBe('复杂协议v3')
    expect(doc.messages).toHaveLength(4)
    const req = doc.messages[0]
    // 帧头静态字段
    expect(req.fields.find(f => f.name === 'magic')?.offsetMode).toBe('static')
    // TLV value 是动态偏移（v3 bug 核心修复点）
    const t10value = req.fields.find(f => f.name === '参数区.T10.value')
    expect(t10value?.offsetMode).toBe('dynamic')
    expect(t10value?.dynamicLengthFrom).toBe('tlv-value')
    // 依赖图含 TLV value ← len
    expect(doc.dependencies.some(d => d.from === '参数区.T10.value' && d.kind === 'length')).toBe(true)
  })

  it('第二步：工具拆分验证 —— TLV 布局正确（T12 不越界）', () => {
    // 直接用 splitFrame 验证 TLV 拆解（独立 TLV 段，验证动态长度传播）
    // DSL 声明：T10 value='AABBCC'(3字节), T11 value='HELLO'(5字节 utf8), T12 value='0102030405'(5字节)
    const tlvHex = [
      '10', '03', 'AABBCC',           // T10: type=10 len=03 value=AABBCC
      '11', '05', '48454C4C4F',       // T11: type=11 len=05 value='HELLO' utf8
      '12', '05', '0102030405'        // T12: type=12 len=05 value=0102030405
    ].join('')
    // 手工布局（模拟 generateDoc 的 TLV 展开顺序）
    const tlvLayout: FieldLayoutItem[] = [
      { name: '参数区.T10.type', kind: 'tlv-type', startByte: 0, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T10.len', kind: 'tlv-len', startByte: 1, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T10.value', kind: 'tlv-value', startByte: 2, lengthBytes: 0, parse: 'hex', dynamicLengthFrom: 'tlv-value' },
      { name: '参数区.T11.type', kind: 'tlv-type', startByte: 5, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T11.len', kind: 'tlv-len', startByte: 6, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T11.value', kind: 'tlv-value', startByte: 7, lengthBytes: 0, parse: 'hex', dynamicLengthFrom: 'tlv-value' },
      { name: '参数区.T12.type', kind: 'tlv-type', startByte: 12, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T12.len', kind: 'tlv-len', startByte: 13, lengthBytes: 1, parse: 'uint', width: 1, endian: 'big' },
      { name: '参数区.T12.value', kind: 'tlv-value', startByte: 14, lengthBytes: 0, parse: 'hex', dynamicLengthFrom: 'tlv-value' }
    ]
    const result = splitFrame(tlvHex, tlvLayout)
    expect(result.ok).toBe(true)
    // 关键断言：T12 value 长度 = 5（不是 v3 bug 的 187 或吞掉所有后续字节）
    const t12value = result.fields.find(f => f.name === '参数区.T12.value')!
    expect(t12value.actualLength).toBe(5)
    expect(t12value.hex).toBe('0102030405')
    // T11 value 也正确（5 字节）
    const t11value = result.fields.find(f => f.name === '参数区.T11.value')!
    expect(t11value.actualLength).toBe(5)
  })

  it('第三步：DSL→graph 拆包链含 TLV value 动态 length 连线', () => {
    const dsl = buildLargeDsl()
    const { graph } = runPipeline(dsl, {}, (g) => generateCodeFromRete(g))
    const nodes = graph.nodes as any[]
    const conns = graph.connections as any[]
    // TLV value slice 节点存在
    const tlvValueSlices = nodes.filter(n => n.key === 'protocol-slice' && String(n.label).includes('.值'))
    expect(tlvValueSlices.length).toBeGreaterThan(0)
    // len-parse → value-slice.length 连线存在（动态长度驱动）
    const lenToValueConns = conns.filter(c => c.targetInput === 'length')
    expect(lenToValueConns.length).toBeGreaterThan(0)
  })

  it('第三步：TLV value 长度由 len 解析值驱动（v3 T12 越界 bug 修复）', () => {
    const dsl = buildLargeDsl()
    const graph = runPipeline(dsl, {}, (g) => generateCodeFromRete(g)).graph
    const code = generateCodeFromRete(graph)
    // TLV value slice 的 length 应引用 len 解析变量（parseInt(_out_N)）
    const closureStart = code.indexOf('listenTcpPackets')
    const closure = closureStart >= 0 ? code.slice(closureStart) : code
    // 动态长度引用（parseInt(_out_N)），而非固定常量
    expect(closure).toMatch(/parseInt\(_out_\d+\) \|\| 0\) \* 2/)
  })

  it('第三步：CRC endian 转换（little-endian CRC16 经字节序转换后比对）', () => {
    const dsl = buildLargeDsl()
    const { graph } = runPipeline(dsl, {}, (g) => generateCodeFromRete(g))
    const nodes = graph.nodes as any[]
    // DSL 用 endian='little'，应有 transform-byteorder 节点
    const byteorderNodes = nodes.filter(n => n.key === 'transform-byteorder')
    expect(byteorderNodes.length).toBeGreaterThan(0)
  })

  it('生成完整 v3 脚本 + 验证契约 + 写入文件', () => {
    const dsl = buildLargeDsl()
    // 用 pipeline 三步生成（注入 codegen）
    const { graph, code, docMarkdown } = runPipeline(dsl, {}, (g) => generateCodeFromRete(g))
    const nodeCount = (graph.nodes as any[]).length
    const connCount = (graph.connections as any[]).length
    console.log(`\n=== v3 压测脚本生成（三步 pipeline）===`)
    console.log(`消息类型: ${dsl.messages?.map(m => m.msgType).join('/')}`)
    console.log(`graph 节点数: ${nodeCount}`)
    console.log(`graph 连线数: ${connCount}`)
    console.log(`协议文档 Markdown 长度: ${docMarkdown.length}`)

    // 节点构成统计
    const countByKey = new Map<string, number>()
    for (const n of graph.nodes as any[]) {
      countByKey.set(n.key, (countByKey.get(n.key) ?? 0) + 1)
    }
    const stats = [...countByKey.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`)
      .join(', ')
    console.log(`节点构成: ${stats}`)

    // 验证 graph 契约：importGraphState 不丢内置节点（custom-* 除外）
    const customCount = (graph.nodes as any[]).filter(n => String(n.key).startsWith('custom-')).length
    const imported = importGraphState(graph)
    const dropped = nodeCount - imported.nodes.length
    console.log(`importGraphState 后节点数: ${imported.nodes.length}（丢弃 ${dropped}，其中 custom-* 未注册 ${customCount}）`)
    expect(dropped).toBeLessThanOrEqual(customCount)

    // 横向布局断言
    const positions = (graph.nodes as any[]).map(n => n.position)
    const maxX = Math.max(...positions.map(p => p?.x ?? 0))
    expect(maxX).toBeGreaterThan(1500)

    // 结构断言
    const keys = (graph.nodes as any[]).map(n => n.key)
    expect(keys).toContain('protocol-slice')
    expect(keys).toContain('protocol-parse-u')
    expect(keys).toContain('protocol-bitfield')
    expect(keys).toContain('protocol-len-prefix')
    expect(keys).toContain('numeric-calc') // cursor 链 + 可选字段掩码
    expect(keys).toContain('compare-eq')
    expect(keys).toContain('compare-neq')
    expect(keys).toContain('protocol-decode-text')
    expect((graph.nodes as any[]).filter(n => n.key === 'control-loop').length).toBe(1)
    expect((graph.nodes as any[]).filter(n => n.key === 'output-tcp').length).toBe(4)

    // 压测防刷屏
    const fileLogs = (graph.nodes as any[]).filter(n => n.key === 'output-file')
    expect(fileLogs.length).toBeGreaterThan(10)
    for (const n of fileLogs) expect(n.data?.path).toBe('script-logs/复杂协议v3.log')
    const consoleLogs = (graph.nodes as any[]).filter(n => n.key === 'output-log')
    expect(consoleLogs.length).toBe(1)
    expect(String(consoleLogs[0]?.label)).toContain('进度')

    // codegen
    expect(code).toContain('crc16')
    expect(code).toContain('listenTcpPackets')
    expect(code).toContain('convertBase')
    expect(code).toContain('textToHex')
    expect(code.length).toBeGreaterThan(5000)

    // 循环体内 4 次发送
    const loopStart = code.indexOf('for (let _i = 0; _i < 1000;')
    let depth = 0
    let loopEnd = loopStart
    for (let j = loopStart; j < code.length; j++) {
      if (code[j] === '{') depth++
      else if (code[j] === '}') {
        depth--
        if (depth === 0) { loopEnd = j; break }
      }
    }
    const loopBody = code.slice(loopStart, loopEnd)
    expect((loopBody.match(/sendTCP/g) || []).length).toBe(4)

    // 写入文件
    const fileContent = buildScriptFile(graph, code)
    fs.writeFileSync(OPTIONS.outputPath, fileContent, 'utf8')
    console.log(`已写入: ${OPTIONS.outputPath}（${(fileContent.length / 1024).toFixed(1)} KB）`)
    console.log(`节点数 ${nodeCount} ${nodeCount >= 150 ? '✓ 达标' : '✗ 不足，需增字段'}`)
  })
})
