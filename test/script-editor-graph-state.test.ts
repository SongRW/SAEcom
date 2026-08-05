import { describe, expect, it } from 'vitest'
import {
  addGraphNode,
  connectGraphNodes,
  createEmptyGraphState,
  exportGraphState,
  getCompatibleSources,
  importGraphState,
  updateGraphNodeData,
  updateGraphNodeLabel,
  updateGraphNodePosition,
  updateGraphNodePositions,
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

  it('batch-updates node positions without touching other fields', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 10, y: 20 }, 'a')
    graph = addGraphNode(graph, 'transform-hex', { x: 30, y: 40 }, 'b')
    graph = updateGraphNodeData(graph, 'a', 'value', 'hello')

    const next = updateGraphNodePositions(graph, {
      a: { x: 100, y: 200 },
      b: { x: 300, y: 400 },
      missing: { x: 1, y: 2 }
    })

    expect(next.nodes.map((node) => ({ id: node.id, position: node.position, data: node.data }))).toEqual([
      { id: 'a', position: { x: 100, y: 200 }, data: expect.objectContaining({ value: 'hello' }) },
      { id: 'b', position: { x: 300, y: 400 }, data: graph.nodes[1].data }
    ])
    expect(next.connections).toBe(graph.connections)

    // 单点 API 仍可用
    const one = updateGraphNodePosition(next, 'a', { x: 1, y: 2 })
    expect(one.nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 1, y: 2 })
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

  // 回归（Bug B「修改脚本后保存不了」）：加载一个已选好端口的串口节点时，
  // defaultNodeData 带的顶层 portPath:"" 不得清空 configRef.portPath，
  // 否则 validateGraphNode 报「未选择串口」→ saveScript 拦截保存。
  it('keeps a selected serial port valid for save when re-adding a serial node with an existing configRef', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-serial', { x: 0, y: 0 }, 'serial', {
      portPath: '',
      configRef: {
        kind: 'serial-port',
        portPath: 'COM7',
        serialOptions: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
        usesFallbackOptions: true
      }
    })
    const node = graph.nodes[0]
    expect((node.data.configRef as { portPath?: string }).portPath).toBe('COM7')
    expect(validateGraphNode(node)).toEqual([])
  })

  it('keeps every node category available for the vertical component tree', () => {
    const groups = groupNodesForPalette()

    expect(groups).toHaveLength(11)
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

  it('restores dynamic object and bitfield ports before importing their connections', () => {
    const graph = importGraphState({
      nodes: [
        { id: 'source', key: 'input-manual', position: { x: 0, y: 0 }, data: { content: 'ABCD' } },
        { id: 'object', key: 'transform-object', position: { x: 240, y: 0 }, data: { keys: [{ id: 'k1', name: 'value' }] } },
        { id: 'unpack', key: 'protocol-bitfield', position: { x: 480, y: 0 }, data: { mode: '解包', fields: [{ id: 'f1', name: '状态', bits: 8 }] } },
        { id: 'log', key: 'output-log', position: { x: 720, y: 0 }, data: { prefix: '状态' } }
      ],
      connections: [
        { source: 'source', sourceOutput: 'out', target: 'object', targetInput: 'key_k1' },
        { source: 'source', sourceOutput: 'out', target: 'unpack', targetInput: 'hex' },
        { source: 'unpack', sourceOutput: 'field_f1', target: 'log', targetInput: 'in' }
      ]
    })

    expect(graph.nodes.find((node) => node.id === 'object')?.inputs).toHaveProperty('key_k1')
    expect(graph.nodes.find((node) => node.id === 'unpack')?.inputs).toHaveProperty('hex')
    expect(graph.nodes.find((node) => node.id === 'unpack')?.outputs).toHaveProperty('field_f1')
    expect(graph.connections).toHaveLength(3)
    expect(importGraphState(exportGraphState(graph)).connections).toEqual(graph.connections)
  })

  it('prunes only connections whose object key port is removed', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 0, y: 0 }, 'left')
    graph = addGraphNode(graph, 'input-manual', { x: 0, y: 120 }, 'right')
    graph = addGraphNode(graph, 'transform-object', { x: 240, y: 0 }, 'object', {
      keys: [{ id: 'k1', name: 'first' }, { id: 'k2', name: 'second' }]
    })
    graph = connectGraphNodes(graph, { source: 'left', sourceOutput: 'out', target: 'object', targetInput: 'key_k1' })
    graph = connectGraphNodes(graph, { source: 'right', sourceOutput: 'out', target: 'object', targetInput: 'key_k2' })

    const next = updateGraphNodeData(graph, 'object', 'keys', [{ id: 'k2', name: 'second' }])

    expect(next.nodes.find((node) => node.id === 'object')?.inputs).not.toHaveProperty('key_k1')
    expect(next.nodes.find((node) => node.id === 'object')?.inputs).toHaveProperty('key_k2')
    expect(next.connections).toEqual([
      expect.objectContaining({ source: 'right', target: 'object', targetInput: 'key_k2' })
    ])
  })

  it('prunes directed bitfield connections after changing packing mode', () => {
    const graph = importGraphState({
      nodes: [
        { id: 'source', key: 'input-manual', position: { x: 0, y: 0 }, data: { content: 'ABCD' } },
        { id: 'bitfield', key: 'protocol-bitfield', position: { x: 240, y: 0 }, data: {
          mode: '解包', fields: [{ id: 'f1', name: '状态', bits: 8 }, { id: 'f2', name: '告警', bits: 8 }]
        } },
        { id: 'first', key: 'output-log', position: { x: 480, y: 0 }, data: { prefix: '状态' } },
        { id: 'second', key: 'output-log', position: { x: 480, y: 120 }, data: { prefix: '告警' } }
      ],
      connections: [
        { source: 'source', sourceOutput: 'out', target: 'bitfield', targetInput: 'hex' },
        { source: 'bitfield', sourceOutput: 'field_f1', target: 'first', targetInput: 'in' },
        { source: 'bitfield', sourceOutput: 'field_f2', target: 'second', targetInput: 'in' }
      ]
    })

    const next = updateGraphNodeData(graph, 'bitfield', 'mode', '打包')
    const bitfield = next.nodes.find((node) => node.id === 'bitfield')

    expect(bitfield?.inputs).toHaveProperty('field_f1')
    expect(bitfield?.inputs).toHaveProperty('field_f2')
    expect(bitfield?.outputs).not.toHaveProperty('field_f1')
    expect(bitfield?.outputs).not.toHaveProperty('field_f2')
    expect(next.connections).toEqual([])
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

describe('updateGraphNodeLabel', () => {
  it('updates the label of the specified node', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '串口输入')
    const updated = updateGraphNodeLabel(graph, 'n1', '我的数据源')
    expect(updated.nodes[0].label).toBe('我的数据源')
  })

  it('preserves all other nodes and connections unchanged', () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 0, y: 0 }, 'n1', {}, '串口输入')
    graph = addGraphNode(graph, 'output-log', { x: 240, y: 0 }, 'n2', {}, '日志')
    graph = connectGraphNodes(graph, { source: 'n1', sourceOutput: 'out', target: 'n2', targetInput: 'in' })
    const originalSecond = graph.nodes[1]
    const originalConnections = graph.connections

    const updated = updateGraphNodeLabel(graph, 'n1', '改名')
    expect(updated.nodes[1]).toEqual(originalSecond)
    expect(updated.connections).toEqual(originalConnections)
  })

  it('trims surrounding whitespace from the label', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '串口输入')
    const updated = updateGraphNodeLabel(graph, 'n1', '  我的数据源  ')
    expect(updated.nodes[0].label).toBe('我的数据源')
  })

  it('keeps the previous label when the trimmed value is empty', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '串口输入')
    const updated = updateGraphNodeLabel(graph, 'n1', '   ')
    expect(updated.nodes[0].label).toBe('串口输入')
  })

  it('returns the same state reference when the node id does not match', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'n1', {}, '串口输入')
    const updated = updateGraphNodeLabel(graph, 'missing', '改名')
    expect(updated).toBe(graph)
  })

  it('migrates legacy string-concat left/right ports to a/b and infers port count', () => {
    // 旧版 string-concat：固定 left/right 端口，data 无 ports 字段
    const imported = importGraphState({
      nodes: [
        { id: '1', key: 'input-manual', label: 'A', position: { x: 0, y: 0 }, data: { content: 'A' } },
        { id: '2', key: 'input-manual', label: 'B', position: { x: 0, y: 60 }, data: { content: 'B' } },
        { id: '3', key: 'string-concat', label: '拼接', position: { x: 200, y: 0 }, data: { separator: '|' } }
      ],
      connections: [
        { id: 'c1', source: '1', sourceOutput: 'out', target: '3', targetInput: 'left' },
        { id: 'c2', source: '2', sourceOutput: 'out', target: '3', targetInput: 'right' }
      ]
    })

    // string-concat 应被推断出 ports:2，端口名变成 a/b（left→a, right→b）
    const concatNode = imported.nodes.find((n) => n.key === 'string-concat')!
    expect(concatNode.data.ports).toBe(2)
    expect(Object.keys(concatNode.inputs).sort()).toEqual(['a', 'b'])

    // 连线应保留：targetInput 从 left/right 迁移到 a/b
    expect(imported.connections).toHaveLength(2)
    const targets = imported.connections.map((c) => c.targetInput).sort()
    expect(targets).toEqual(['a', 'b'])
  })

  it('keeps legacy protocol-concat 6 ports when no ports field and no connections', () => {
    const imported = importGraphState({
      nodes: [
        { id: '1', key: 'protocol-concat', label: '拼帧', position: { x: 0, y: 0 }, data: {} }
      ],
      connections: []
    })

    const concatNode = imported.nodes.find((n) => n.key === 'protocol-concat')!
    // 无连线无法推断 → 保底 6 端口（旧版 protocol-concat 固定 a~f）
    expect(concatNode.data.ports).toBe(6)
    expect(Object.keys(concatNode.inputs).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('does NOT migrate left/right for compare nodes (only concat targets)', () => {
    const imported = importGraphState({
      nodes: [
        { id: '1', key: 'input-manual', label: 'A', position: { x: 0, y: 0 }, data: { content: 'A' } },
        { id: '2', key: 'compare-eq', label: '等于', position: { x: 200, y: 0 }, data: { operand: 'A' } }
      ],
      connections: [
        { id: 'c1', source: '1', sourceOutput: 'out', target: '2', targetInput: 'left' }
      ]
    })

    // compare-eq 的 left 端口不应被迁移
    expect(imported.connections).toHaveLength(1)
    expect(imported.connections[0]!.targetInput).toBe('left')
  })
})
