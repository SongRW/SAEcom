import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NodeConfigPanel } from '../src/features/script-editor/components/NodeConfigPanel'
import { addGraphNode, createEmptyGraphState, updateGraphNodeData } from '../src/features/script-editor/rete/graphState'

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
      onLabelChange: () => {},
      onNoteChange: () => {},
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

  it('renders an editable label input initialized from the node label', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '我的数据源')
    const html = renderToStaticMarkup(React.createElement(NodeConfigPanel, {
      graph,
      selectedNodeId: 'n1',
      refreshingPanels: false,
      refreshingPorts: false,
      serialPanelOptions: [],
      serialPortOptions: [],
      onGraphChange: () => {},
      onLabelChange: () => {},
      onNoteChange: () => {},
      onDeleted: () => {},
      onRefreshPanels: () => {},
      onRefreshPorts: () => {}
    }))

    // header 不再是纯文本，而是一个带 className 的可编辑 input，value 初始化为节点 label
    expect(html).toContain('script-editor-inspector__title-input')
    expect(html).toContain('value="我的数据源"')
    // 不应再渲染旧的只读 title div
    expect(html).not.toContain('script-editor-inspector__title"')
  })

  it('renders a note textarea initialized from node data note', () => {
    let graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '输入')
    graph = updateGraphNodeData(graph, 'n1', 'note', '入口节点说明')
    const html = renderToStaticMarkup(React.createElement(NodeConfigPanel, {
      graph,
      selectedNodeId: 'n1',
      refreshingPanels: false,
      refreshingPorts: false,
      serialPanelOptions: [],
      serialPortOptions: [],
      onGraphChange: () => {},
      onLabelChange: () => {},
      onNoteChange: () => {},
      onDeleted: () => {},
      onRefreshPanels: () => {},
      onRefreshPorts: () => {}
    }))

    // 存在备注 textarea，className 正确，初始值为节点 data.note
    expect(html).toContain('script-editor-inspector__note-input')
    expect(html).toContain('入口节点说明')
    expect(html).toContain('备注')
  })

  it('renders an empty note textarea when the node has no note', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '输入')
    const html = renderToStaticMarkup(React.createElement(NodeConfigPanel, {
      graph,
      selectedNodeId: 'n1',
      refreshingPanels: false,
      refreshingPorts: false,
      serialPanelOptions: [],
      serialPortOptions: [],
      onGraphChange: () => {},
      onLabelChange: () => {},
      onNoteChange: () => {},
      onDeleted: () => {},
      onRefreshPanels: () => {},
      onRefreshPorts: () => {}
    }))

    // 无 note 时渲染空 textarea（不报错、不显示 undefined）
    expect(html).toContain('script-editor-inspector__note-input')
    expect(html).not.toContain('undefined')
    expect(html).toContain('为这个节点添加说明')
  })

  it('wires label and note changes through onLabelChange / onNoteChange props', () => {
    // 校验组件源码确实把 props 接入 onChange（与 select description 静态源码断言同模式）。
    const source = readFileSync(resolve(__dirname, '../src/features/script-editor/components/NodeConfigPanel.tsx'), 'utf8')
    expect(source).toMatch(/onLabelChange\(selectedNode\.id/)
    expect(source).toMatch(/onNoteChange\(selectedNode\.id/)
    expect(source).toMatch(/value=\{selectedNode\.label\}/)
  })
})
