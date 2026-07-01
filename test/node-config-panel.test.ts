import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NodeConfigPanel } from '../src/features/script-editor/components/NodeConfigPanel'
import { addGraphNode, createEmptyGraphState } from '../src/features/script-editor/rete/graphState'

describe('NodeConfigPanel', () => {
  it('renders a single merged serial section without a separate summary', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-serial', { x: 0, y: 0 }, 'serial', {
      portPath: 'COM20',
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      bufferMs: 50,
      append: 'CRLF'
    })

    const html = renderToStaticMarkup(React.createElement(NodeConfigPanel, {
      graph,
      selectedNodeId: 'serial',
      refreshingPanels: false,
      refreshingPorts: false,
      serialPanelOptions: [],
      serialPortOptions: [
        {
          value: 'COM20',
          label: 'COM20',
          description: 'COM20 · 未打开 · 115200/8/1/none'
        }
      ],
      onGraphChange: () => {},
      onDeleted: () => {},
      onRefreshPanels: () => {},
      onRefreshPorts: () => {}
    }))

    // 合并后只有一个「串口配置」section，不再有独立的只读摘要区
    expect(html).toContain('串口配置')
    expect(html).not.toContain('script-editor-config-summary')
    // 顶部状态条显示当前选中端口 + 波特率
    expect(html).toContain('script-editor-serial-status')
    expect(html).toContain('COM20')
    expect(html).toContain('115200')
    // 波特率等参数与串口选择同处一个 section
    expect(html).toContain('波特率')
    expect(html).toContain('接收缓冲(ms)')
    // select option 的 description 文本不应泄漏到 trigger 显示区
    expect(html).not.toContain('未打开 · 115200/8/1/none')
  })

  it('keeps select descriptions out of the Radix item text', () => {
    const selectSource = readFileSync(resolve(__dirname, '../src/components/ui/select.tsx'), 'utf8')
    const itemTextMatches = [...selectSource.matchAll(/<SelectPrimitive\.ItemText>([\s\S]*?)<\/SelectPrimitive\.ItemText>/g)]

    // nova 版 select 不再提供 description 槽位；ItemText 只承载 children。
    expect(itemTextMatches.length).toBeGreaterThan(0)
    expect(itemTextMatches.every((match) => !match[1].includes('description'))).toBe(true)
    // NodeConfigPanel 已不向 SelectItem 传递 description（nova SelectItem 无该 prop）
    const panelSource = readFileSync(resolve(__dirname, '../src/features/script-editor/components/NodeConfigPanel.tsx'), 'utf8')
    expect(panelSource).not.toMatch(/description=\{option\.description\}/)
  })
})
