/**
 * v3 可视化压测脚本生成器。
 *
 * 构造一个大 ProtocolDsl（~60 字段 + 多个 bitfield + custom + transport + loop），
 * 经 dslToGraph 转成 ~200 节点的 ReteGraphExport，再用 buildScriptFile 包装成
 * 可视化脚本文件（VS_FLOW_START...VS_FLOW_END 格式）。
 *
 * 运行：npx vitest run test/gen-v3-stress.mjs --reporter=verbose
 * （vitest 能解析 @/ 别名 + TS，比独立 node 脚本简单）
 *
 * 参数（改下方 OPTIONS）：targetNodes 控制目标节点数。
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { dslToGraph } from '@/features/script-editor/dsl/toGraph'
import { buildScriptFile } from '@/features/script-editor/persistence'
import { importGraphState } from '@/features/script-editor/rete/graphState'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import type { ProtocolDsl } from '@shared/protocol-dsl'

const OPTIONS = {
  targetNodes: 200,
  outputPath: path.resolve(__dirname, '../shared/samples/复杂协议v3-可视化.js')
}

/** 构造大 DSL：普通字段 + bitfield + custom + crc + transport + loop。
 *  目标产出 ~200 节点（每字段 ~1.4 节点，bitfield ~5 节点）。 */
function buildLargeDsl(): ProtocolDsl {
  const fields: ProtocolDsl['fields'] = []

  // 帧头常量
  fields.push({ kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' })
  fields.push({ kind: 'const', name: 'version', value: '03', mode: 'hex' })
  fields.push({ kind: 'uint', name: 'seq', width: 2, value: 0 })

  // 30 个传感器读数字段（u16）——组包+拆包各 1 节点 = 60 节点
  for (let i = 0; i < 30; i++) {
    fields.push({ kind: 'uint', name: `sensor${i}`, width: 2, value: i })
  }

  // 3 个位域字段（每个 4 子字段 → 组包侧 5 节点 + 拆包侧 2 节点 = 21 节点）
  for (let b = 0; b < 3; b++) {
    fields.push({
      kind: 'bitfield',
      name: `status${b}`,
      fields: [
        { name: 'flagA', bits: 4 },
        { name: 'flagB', bits: 4 },
        { name: 'flagC', bits: 8 },
        { name: 'flagD', bits: 8 }
      ]
    })
  }

  // 10 个文本字段（设备名）
  for (let t = 0; t < 10; t++) {
    fields.push({ kind: 'text', name: `label${t}`, value: `DEV${t}`, encoding: 'utf8' })
  }

  // 3 个自定义组件字段（测自定义组件功能）
  fields.push({
    kind: 'custom', name: '时间戳',
    componentKey: 'custom-time-convert',
    config: { mode: 'epoch-to-iso', fmt: 'YYYY-MM-DD HH:mm:ss' }
  })
  fields.push({
    kind: 'custom', name: '位置',
    componentKey: 'custom-geo-convert',
    config: { mode: 'dec-to-dms', axis: 'lat' }
  })
  fields.push({
    kind: 'custom', name: '载荷加密',
    componentKey: 'custom-aes-crypto',
    config: { mode: 'encrypt', key: '000102030405060708090A0B0C0D0E0F', iv: '101112131415161718191A1B1C1D1E1F' }
  })

  // CRC + 长度前缀
  fields.push({ kind: 'length-prefix', name: 'lenPrefix', width: 'u16' })
  fields.push({ kind: 'crc', name: 'crc16', algorithm: 'CRC16', endian: 'little', append: true })

  return {
    name: '复杂协议v3',
    fields,
    transport: { mode: 'tcp-loopback', port: 18930 },
    loop: { count: 100 }
  }
}

describe('v3 可视化压测脚本生成器', () => {
  it('生成 ~200 节点的可视化脚本 + 验证契约', () => {
    const dsl = buildLargeDsl()
    const graph = dslToGraph(dsl)
    const nodeCount = (graph.nodes as any[]).length
    const connCount = (graph.connections as any[]).length
    console.log(`\n=== v3 压测脚本生成 ===`)
    console.log(`DSL 字段数: ${dsl.fields.length}`)
    console.log(`graph 节点数: ${nodeCount}`)
    console.log(`graph 连线数: ${connCount}`)

    // 验证 graph 契约：importGraphState 不丢内置节点。
    // 注：custom-* 节点在测试环境未注册（运行时 app 加载自定义组件后才有），
    // 会被 importGraphState 丢弃——这是预期行为，运行时 app 注册后不丢。
    const customCount = (graph.nodes as any[]).filter(n => String(n.key).startsWith('custom-')).length
    const imported = importGraphState(graph)
    const dropped = nodeCount - imported.nodes.length
    console.log(`importGraphState 后节点数: ${imported.nodes.length}（丢弃 ${dropped}，其中 custom-* 未注册 ${customCount}）`)
    // 丢弃数应 ≤ custom-* 数量（其他内置节点不应被丢弃）
    expect(dropped).toBeLessThanOrEqual(customCount)

    // codegen 性能
    const t0 = Date.now()
    const code = generateCodeFromRete(graph)
    const codegenMs = Date.now() - t0
    console.log(`codegen 耗时: ${codegenMs}ms，代码长度: ${code.length}`)
    expect(codegenMs).toBeLessThan(10000) // 200 节点 codegen < 10s

    // 产出含各类节点调用
    expect(code).toContain('crc16')
    expect(code.length).toBeGreaterThan(5000)

    // 写入文件
    const fileContent = buildScriptFile(graph, code)
    fs.writeFileSync(OPTIONS.outputPath, fileContent, 'utf8')
    console.log(`已写入: ${OPTIONS.outputPath}（${(fileContent.length / 1024).toFixed(1)} KB）`)
    console.log(`节点数 ${nodeCount} ${nodeCount >= 150 ? '✓ 达标' : '✗ 不足，需增字段'}`)
  })
})
