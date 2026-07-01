import { describe, expect, it } from 'vitest'
import {
  addGraphNode,
  connectGraphNodes,
  createEmptyGraphState,
  exportGraphState,
  getCompatibleSources,
  importGraphState,
  updateGraphNodeData,
  validateGraphNode
} from '../src/features/script-editor/rete/graphState'
import {
  buildSerialPanelOptions,
  getNextCanvasNodePosition,
  groupNodesForPalette
} from '../src/features/script-editor/viewModel'

describe('script editor graph state', () => {
  it('adds a typed node with default control values and position', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-tcp', { x: 120, y: 80 }, 'node-1')
    const node = graph.nodes[0]

    expect(node).toMatchObject({
      id: 'node-1',
      key: 'input-tcp',
      label: '接收TCP',
      position: { x: 120, y: 80 },
      data: {
        host: '127.0.0.1',
        port: 8080,
        configRef: { kind: 'tcp-endpoint', host: '127.0.0.1', port: 8080 }
      }
    })
    expect(node.inputs).toEqual({})
    expect(node.outputs).toHaveProperty('out')
  })

  it('places click-added nodes away from the toolbar and existing nodes', () => {
    let graph = createEmptyGraphState()

    expect(getNextCanvasNodePosition(graph)).toEqual({ x: 64, y: 72 })

    graph = addGraphNode(graph, 'input-manual', getNextCanvasNodePosition(graph), 'input')
    graph = addGraphNode(graph, 'transform-hex', getNextCanvasNodePosition(graph), 'hex')

    expect(graph.nodes.map((node) => node.position)).toEqual([
      { x: 64, y: 72 },
      { x: 324, y: 72 }
    ])
    expect(getNextCanvasNodePosition(graph)).toEqual({ x: 584, y: 72 })
  })

  it('builds serial binding options from the current panel and panel list', () => {
    const options = buildSerialPanelOptions([
      { id: 'COM3', name: '主串口', type: 'serial', open: true, active: true },
      { id: 'tcp://127.0.0.1:502', name: 'PLC', type: 'tcp', open: false, active: false }
    ])

    expect(options).toEqual([
      { value: '__current__', label: '当前面板：主串口', description: 'COM3 · 已打开' },
      { value: 'COM3', label: '主串口', description: 'COM3 · 已打开' },
      { value: 'tcp://127.0.0.1:502', label: 'PLC', description: 'tcp://127.0.0.1:502 · 未打开' }
    ])
  })

  it('inherits the active serial panel as direct serial settings when adding serial nodes with panel context', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-serial', { x: 0, y: 0 }, 'serial', {
      __panels: [
        {
          id: 'COM3',
          name: '主串口',
          type: 'serial',
          open: true,
          active: true,
          options: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
        }
      ]
    })

    expect(graph.nodes[0].data.configRef).toEqual({
      kind: 'serial-port',
      portPath: 'COM3',
      serialOptions: { baudRate: 9600, dataBits: 7, stopBits: 2, parity: 'even' }
    })
    expect(graph.nodes[0].data).toMatchObject({
      portPath: 'COM3',
      baudRate: 9600,
      dataBits: 7,
      stopBits: 2,
      parity: 'even',
      bufferMs: 50,
      append: 'CRLF'
    })
    expect(graph.nodes[0].data).not.toHaveProperty('__panels')
  })

  it('keeps every node category available for the vertical component tree', () => {
    const groups = groupNodesForPalette()

    expect(groups).toHaveLength(9)
    expect(groups[0]?.key).toBe('input')
    expect(groups.every((group) => group.nodes.length > 0)).toBe(true)
    expect(groups.find((group) => group.key === 'string')?.nodes.map((node) => node.key)).toContain('string-concat')
  })

  it('enforces socket compatibility when connecting nodes', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 0, y: 0 }, 'input')
    graph = addGraphNode(graph, 'compare-eq', { x: 240, y: 0 }, 'compare')
    graph = addGraphNode(graph, 'control-if', { x: 480, y: 0 }, 'if')

    expect(connectGraphNodes(graph, {
      source: 'input',
      sourceOutput: 'out',
      target: 'if',
      targetInput: 'condition'
    }).connections).toEqual([])

    const connected = connectGraphNodes(
      connectGraphNodes(graph, {
        source: 'input',
        sourceOutput: 'out',
        target: 'compare',
        targetInput: 'left'
      }),
      {
        source: 'compare',
        sourceOutput: 'result',
        target: 'if',
        targetInput: 'condition'
      }
    )

    expect(connected.connections).toEqual([
      expect.objectContaining({ source: 'input', sourceOutput: 'out', target: 'compare', targetInput: 'left' }),
      expect.objectContaining({ source: 'compare', sourceOutput: 'result', target: 'if', targetInput: 'condition' })
    ])
  })

  it('round-trips export/import and removes invalid connections', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 0, y: 0 }, 'input')
    graph = addGraphNode(graph, 'compare-eq', { x: 240, y: 0 }, 'compare')
    graph = addGraphNode(graph, 'control-if', { x: 480, y: 0 }, 'if')
    graph = connectGraphNodes(graph, { source: 'input', sourceOutput: 'out', target: 'compare', targetInput: 'left' })
    graph = connectGraphNodes(graph, { source: 'compare', sourceOutput: 'result', target: 'if', targetInput: 'condition' })

    const exported = exportGraphState(graph)
    const exportedConnections = Array.isArray(exported.connections)
      ? exported.connections
      : Object.values(exported.connections || {})
    const imported = importGraphState({
      ...exported,
      connections: [
        ...exportedConnections,
        { source: 'input', sourceOutput: 'out', target: 'if', targetInput: 'condition' }
      ]
    })

    expect(imported.connections).toHaveLength(2)
    expect(exportGraphState(imported)).toEqual(exported)
  })

  it('filters compatible sources and validates required control values', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 0, y: 0 }, 'input')
    graph = addGraphNode(graph, 'compare-eq', { x: 240, y: 0 }, 'compare')
    graph = addGraphNode(graph, 'control-if', { x: 480, y: 0 }, 'if')
    graph = updateGraphNodeData(graph, 'input', 'content', 'payload')

    expect(getCompatibleSources(graph, 'if', 'condition')).toEqual([
      { nodeId: 'compare', outputKey: 'result', label: '等于 / 结果' }
    ])

    graph = connectGraphNodes(graph, { source: 'input', sourceOutput: 'out', target: 'compare', targetInput: 'left' })

    expect(getCompatibleSources(graph, 'if', 'condition')).toEqual([
      { nodeId: 'compare', outputKey: 'result', label: '等于 / 结果' }
    ])
    expect(validateGraphNode(graph.nodes.find((node) => node.id === 'input')!)).toEqual([])

    const emptyInput = updateGraphNodeData(graph, 'input', 'content', '')
    expect(validateGraphNode(emptyInput.nodes.find((node) => node.id === 'input')!)).toEqual([
      '输入内容不能为空'
    ])
  })

  it('validates edited TCP controls instead of stale config refs', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-tcp', { x: 0, y: 0 }, 'tcp')
    graph = updateGraphNodeData(graph, 'tcp', 'host', '')

    expect(validateGraphNode(graph.nodes.find((node) => node.id === 'tcp')!)).toContain(
      '接收TCP：主机不能为空'
    )
  })

  it('syncs output serial edits into direct serial config refs used by codegen', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'output-serial', { x: 0, y: 0 }, 'serial')
    graph = updateGraphNodeData(graph, 'serial', 'portPath', 'COM9')
    graph = updateGraphNodeData(graph, 'serial', 'baudRate', 57600)
    graph = updateGraphNodeData(graph, 'serial', 'dataBits', 7)
    graph = updateGraphNodeData(graph, 'serial', 'stopBits', 2)
    graph = updateGraphNodeData(graph, 'serial', 'parity', 'even')

    expect(graph.nodes.find((node) => node.id === 'serial')?.data.configRef).toEqual({
      kind: 'serial-port',
      portPath: 'COM9',
      serialOptions: { baudRate: 57600, dataBits: 7, stopBits: 2, parity: 'even' },
      usesFallbackOptions: false
    })

    graph = updateGraphNodeData(graph, 'serial', 'portPath', '')

    expect(graph.nodes.find((node) => node.id === 'serial')?.data.configRef).toEqual({
      kind: 'serial-port',
      serialOptions: { baudRate: 57600, dataBits: 7, stopBits: 2, parity: 'even' },
      usesFallbackOptions: false
    })
  })

  it('syncs output serial port path edits into config refs used by codegen', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'output-serial', { x: 0, y: 0 }, 'serial', {
      configRef: {
        kind: 'serial-port',
        serialOptions: { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none' },
        usesFallbackOptions: false
      }
    })
    graph = updateGraphNodeData(graph, 'serial', 'portPath', 'COM7')

    expect(graph.nodes.find((node) => node.id === 'serial')?.data.configRef).toEqual({
      kind: 'serial-port',
      portPath: 'COM7',
      serialOptions: { baudRate: 57600, dataBits: 8, stopBits: 1, parity: 'none' },
      usesFallbackOptions: false
    })
  })

  it('syncs output tcp endpoint edits into config refs used by codegen', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'output-tcp', { x: 0, y: 0 }, 'tcp')
    graph = updateGraphNodeData(graph, 'tcp', 'host', '10.0.0.5')
    graph = updateGraphNodeData(graph, 'tcp', 'port', 1502)

    expect(graph.nodes.find((node) => node.id === 'tcp')?.data.configRef).toEqual({
      kind: 'tcp-endpoint',
      host: '10.0.0.5',
      port: 1502
    })
  })

  it('syncs output tcp server and file edits into config refs used by codegen', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'output-tcp-server', { x: 0, y: 0 }, 'server')
    graph = addGraphNode(graph, 'output-file', { x: 240, y: 0 }, 'file')
    graph = updateGraphNodeData(graph, 'server', 'port', 19000)
    graph = updateGraphNodeData(graph, 'file', 'path', 'D:/logs/out.log')

    expect(graph.nodes.find((node) => node.id === 'server')?.data.configRef).toEqual({
      kind: 'tcp-server',
      port: 19000
    })
    expect(graph.nodes.find((node) => node.id === 'file')?.data.configRef).toEqual({
      kind: 'file',
      path: 'D:/logs/out.log'
    })
  })
})
