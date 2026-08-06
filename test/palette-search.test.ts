import { describe, it, expect } from 'vitest'
import { filterPaletteGroups, findMatchRanges, type PaletteGroup } from '@/features/script-editor/viewModel'
import type { NodeDef } from '@shared/types'

function makeNode(overrides: Partial<NodeDef>): NodeDef {
  return {
    key: 'x', category: 'input', name: 'X', inputs: [], outputs: [], controls: [],
    ...overrides
  }
}

function makeGroups(): PaletteGroup[] {
  return [
    { key: 'input', name: '输入', color: '#409eff', nodes: [
      makeNode({ key: 'input-serial', name: '接收串口', description: '从串口接收数据' }),
      makeNode({ key: 'input-tcp', name: '接收TCP', description: '从 TCP 接收' })
    ]},
    { key: 'output', name: '输出', color: '#10b981', nodes: [
      makeNode({ key: 'output-serial', name: '发送串口', description: '向串口发送' }),
      makeNode({ key: 'output-log', name: '日志输出', description: '输出到控制台' })
    ]},
    { key: 'custom', name: '自定义', color: '#ec4899', nodes: [] }
  ]
}

describe('filterPaletteGroups 调色板搜索', () => {
  it('空 query 原样返回（零行为变化）', () => {
    const groups = makeGroups()
    const result = filterPaletteGroups(groups, '')
    expect(result).toBe(groups) // 同一引用
  })

  it('纯空白 query 原样返回', () => {
    const groups = makeGroups()
    const result = filterPaletteGroups(groups, '   ')
    expect(result).toBe(groups)
  })

  it('中文名称匹配：返回扁平化单组', () => {
    const result = filterPaletteGroups(makeGroups(), '串口')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('搜索结果')
    const keys = result[0].nodes.map((n) => n.key)
    expect(keys).toContain('input-serial')
    expect(keys).toContain('output-serial')
  })

  it('key 匹配（大小写不敏感）', () => {
    const result = filterPaletteGroups(makeGroups(), 'INPUT-TCP')
    expect(result[0].nodes).toHaveLength(1)
    expect(result[0].nodes[0].key).toBe('input-tcp')
  })

  it('description 匹配', () => {
    const result = filterPaletteGroups(makeGroups(), '控制台')
    expect(result[0].nodes.map((n) => n.key)).toEqual(['output-log'])
  })

  it('无命中返回空节点组（不是空数组）', () => {
    const result = filterPaletteGroups(makeGroups(), '不存在的组件名xyz')
    expect(result).toHaveLength(1)
    expect(result[0].nodes).toHaveLength(0)
  })

  it('部分子串匹配', () => {
    const result = filterPaletteGroups(makeGroups(), 'serial')
    const keys = result[0].nodes.map((n) => n.key)
    expect(keys).toContain('input-serial')
    expect(keys).toContain('output-serial')
  })
})

describe('findMatchRanges 高亮定位', () => {
  it('空 query 返回 null', () => {
    expect(findMatchRanges('接收串口', '')).toBeNull()
    expect(findMatchRanges('接收串口', '   ')).toBeNull()
  })

  it('未命中返回 null', () => {
    expect(findMatchRanges('接收串口', 'tcp')).toBeNull()
  })

  it('单次命中返回一个区间', () => {
    expect(findMatchRanges('接收串口', '串口')).toEqual([[2, 4]])
  })

  it('多次命中返回多个区间', () => {
    expect(findMatchRanges('serial serial', 'serial')).toEqual([[0, 6], [7, 13]])
  })

  it('大小写不敏感', () => {
    expect(findMatchRanges('Input-TCP', 'tcp')).toEqual([[6, 9]])
  })
})
