/**
 * MCP 端口契约单测：验证所有节点的 MCP 描述符含端口信息（inputs/outputs），
 * 动态端口节点含 dynamic 规则说明。
 *
 * 这是 AI 拼装 graph 的前提——AI 需知道每个节点的端口 key + socket 类型才能正确连线。
 */
import { describe, it, expect } from 'vitest'
import {
  listNodeMcpTools,
  getNodeMcpTool
} from '@/features/script-editor/nodes/component/registry'
import type { McpPortInfo } from '@shared/types'

describe('MCP 端口契约（AI 拼装 graph 的前提）', () => {
  const tools = listNodeMcpTools()

  it('所有节点 MCP 描述符含 ports 契约', () => {
    const missing: string[] = []
    for (const tool of tools) {
      if (!tool.ports) missing.push(tool.name)
    }
    expect(missing, `这些节点缺 ports: ${missing.join(', ')}`).toEqual([])
  })

  it('所有端口含 key + socket 类型（连线必需）', () => {
    for (const tool of tools) {
      const allPorts = [...(tool.ports?.inputs ?? []), ...(tool.ports?.outputs ?? [])]
      for (const port of allPorts) {
        expect(port.key, `${tool.name} 端口缺 key`).toBeTruthy()
        expect(port.socket, `${tool.name}.${port.key} 缺 socket`).toBeTruthy()
        expect(['dataSocket', 'boolSocket', 'flowSocket', 'triggerSocket']).toContain(port.socket)
      }
    }
  })

  it('动态端口节点含 dynamic 规则说明', () => {
    const dynamicKeys = ['protocol-concat', 'string-concat', 'script-expr', 'protocol-bitfield', 'transform-object', 'transform-namefields']
    for (const key of dynamicKeys) {
      const tool = getNodeMcpTool(key)
      expect(tool, `${key} 应在 MCP 目录`).toBeDefined()
      expect(tool!.ports?.dynamic, `${key} 应含 dynamic 规则`).toBeDefined()
      expect(tool!.ports!.dynamic!.description.length, `${key} dynamic.description 非空`).toBeGreaterThan(10)
    }
  })

  it('非动态节点不含 dynamic（避免误导 AI）', () => {
    const dynamicKeys = new Set(['protocol-concat', 'string-concat', 'script-expr', 'protocol-bitfield', 'transform-object', 'transform-namefields'])
    for (const tool of tools) {
      if (dynamicKeys.has(tool.name)) continue
      expect(tool.ports?.dynamic, `${tool.name} 非动态节点不应有 dynamic`).toBeUndefined()
    }
  })

  it('抽样：input-manual 端口契约正确（1 输出 dataSocket）', () => {
    const tool = getNodeMcpTool('input-manual')
    expect(tool).toBeDefined()
    expect(tool!.ports!.inputs).toHaveLength(0)
    expect(tool!.ports!.outputs).toHaveLength(1)
    expect(tool!.ports!.outputs[0]).toEqual({ key: 'out', socket: 'dataSocket', label: '输出' })
  })

  it('抽样：protocol-crc 端口契约正确（1 in + 1 out，dataSocket）', () => {
    const tool = getNodeMcpTool('protocol-crc')
    expect(tool).toBeDefined()
    expect(tool!.ports!.inputs.length).toBeGreaterThanOrEqual(1)
    expect(tool!.ports!.outputs.length).toBeGreaterThanOrEqual(1)
    const inPorts = tool!.ports!.inputs.map((p: McpPortInfo) => p.key)
    const outPorts = tool!.ports!.outputs.map((p: McpPortInfo) => p.key)
    expect(inPorts).toContain('body')
    expect(outPorts).toContain('out')
  })

  it('抽样：control-if 端口含 flow 类型输出（true/false）', () => {
    const tool = getNodeMcpTool('control-if')
    expect(tool).toBeDefined()
    const outSockets = tool!.ports!.outputs.map((p: McpPortInfo) => p.socket)
    expect(outSockets).toContain('flowSocket')
    const outKeys = tool!.ports!.outputs.map((p: McpPortInfo) => p.key)
    expect(outKeys).toContain('true')
    expect(outKeys).toContain('false')
  })

  it('抽样：protocol-concat dynamic 说明含 ports=N 规则 + a..z key 规则', () => {
    const tool = getNodeMcpTool('protocol-concat')
    expect(tool).toBeDefined()
    expect(tool!.ports!.dynamic!.kind).toBe('concat')
    expect(tool!.ports!.dynamic!.description).toContain('ports')
    expect(tool!.ports!.dynamic!.description).toMatch(/a.*z|字母/)
  })

  it('抽样：protocol-bitfield dynamic 说明含 field_${id} 规则', () => {
    const tool = getNodeMcpTool('protocol-bitfield')
    expect(tool).toBeDefined()
    expect(tool!.ports!.dynamic!.kind).toBe('bitfield')
    expect(tool!.ports!.dynamic!.description).toContain('field_')
  })

  it('compare-* 节点输出为 boolSocket（bool→data 兼容规则的源头）', () => {
    for (const key of ['compare-eq', 'compare-gt', 'compare-lt']) {
      const tool = getNodeMcpTool(key)
      expect(tool, `${key} 应在 MCP 目录`).toBeDefined()
      const outPorts = tool!.ports!.outputs
      expect(outPorts.some((p: McpPortInfo) => p.socket === 'boolSocket'), `${key} 应有 boolSocket 输出`).toBe(true)
    }
  })
})
