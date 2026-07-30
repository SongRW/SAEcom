import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScriptFile } from '../src/features/script-editor/persistence'
import { NODE_DEFINITIONS } from '../src/features/script-editor/nodes/definitions'
import { NODE_COMPONENT_MAP } from '../src/features/script-editor/nodes/component/registry'
import { exportGraphState, importGraphState } from '../src/features/script-editor/rete/graphState'

const SAMPLE = path.join(__dirname, '../shared/samples/复杂协议v2.js')

describe('shared sample scripts', () => {
  it('ships complex protocol v2 sample as runnable legacy JS', () => {
    expect(fs.existsSync(SAMPLE)).toBe(true)
    const content = fs.readFileSync(SAMPLE, 'utf8')
    expect(content.length).toBeGreaterThan(1000)

    const parsed = parseScriptFile(content)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    // 无流程图标记 → 脚本页建空图 + 用 legacyCode 运行
    expect(parsed.reason).toBe('missing-markers')
    expect(parsed.code).toContain('await send(')
    expect(parsed.code).toContain('waitOnePacket')
    expect(parsed.code).toContain('DONE=1')
    expect(parsed.code).toContain('FLAG_FRAGMENT')
    expect(parsed.code).not.toContain('sendToPanel')
  })

  it('ships complex protocol visual graph sample with flow markers', () => {
    const visual = path.join(__dirname, '../shared/samples/复杂协议v2-可视化.js')
    expect(fs.existsSync(visual)).toBe(true)
    const parsed = parseScriptFile(fs.readFileSync(visual, 'utf8'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.graph.nodes).toBeTruthy()
    const nodes = Array.isArray(parsed.graph.nodes)
      ? parsed.graph.nodes
      : Object.values(parsed.graph.nodes)
    expect(nodes.length).toBeGreaterThan(15)
    expect(nodes.some((n) => n.key === 'input-tcp')).toBe(true)
    expect(nodes.some((n) => n.key === 'output-tcp')).toBe(true)
    expect(nodes.some((n) => n.key === 'protocol-bitfield')).toBe(true)
    // 拆帧链：含 CRC 计算 + 校验、变长字段解析
    // 双校验封包现用两个通用 protocol-crc 串联（CRC16 小端追加 → CRC8 追加）表达
    expect(nodes.filter((n) => n.key === 'protocol-crc').length).toBeGreaterThanOrEqual(2)
    expect(nodes.some((n) => n.key === 'compare-eq')).toBe(true)
    expect(nodes.some((n) => n.key === 'protocol-parse-u')).toBe(true)
    // 动态 length：变长本体 slice 的 length 由上游长度前缀解析值驱动
    const conns = Array.isArray(parsed.graph.connections)
      ? parsed.graph.connections
      : Object.values(parsed.graph.connections || {})
    const sliceLenInputs = conns.filter(
      (cc) => cc.targetInput === 'length'
    )
    expect(sliceLenInputs.length, '应有动态 length 连线').toBeGreaterThanOrEqual(1)

    // 所有连线的 sourceOutput / targetInput 必须匹配节点端口定义
    // （compare-eq 输出是 result 不是 out；曾因写错 key 导致下游漏 emit）
    // 动态端口节点（transform-object / protocol-bitfield 等）的实际端口由 data 派生，
    // 静态 NodeDef 查不到，故跳过 —— 它们的端口正确性由各自的 setup 同步逻辑保证。
    const nodeMap = new Map(nodes.map((n) => [String(n.id), n]))
    const badConns: string[] = []
    for (const cc of conns) {
      const src = nodeMap.get(String(cc.source))
      const tgt = nodeMap.get(String(cc.target))
      if (!src || !tgt) { badConns.push(`dangling: ${JSON.stringify(cc)}`); continue }
      const srcDef = NODE_DEFINITIONS[src.key]
      const tgtDef = NODE_DEFINITIONS[tgt.key]
      const srcDynamic = NODE_COMPONENT_MAP[src.key]?.dynamicPorts
      const tgtDynamic = NODE_COMPONENT_MAP[tgt.key]?.dynamicPorts
      if (srcDef && !srcDynamic && !srcDef.outputs.some((o) => o.key === cc.sourceOutput)) {
        badConns.push(`${src.key}(${src.id}).sourceOutput='${cc.sourceOutput}' 不在 outputs [${srcDef.outputs.map((o) => o.key).join(',')}]`)
      }
      if (tgtDef && !tgtDynamic && !tgtDef.inputs.some((i) => i.key === cc.targetInput)) {
        badConns.push(`${tgt.key}(${tgt.id}).targetInput='${cc.targetInput}' 不在 inputs [${tgtDef.inputs.map((i) => i.key).join(',')}]`)
      }
    }
    expect(badConns, `连线端口不匹配:\n${badConns.join('\n')}`).toEqual([])
    expect(exportGraphState(importGraphState(parsed.graph)).connections).toHaveLength(conns.length)
  })
})
