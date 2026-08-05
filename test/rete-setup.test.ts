import { describe, expect, it } from 'vitest'
import { ClassicPreset, NodeEditor } from 'rete'
import {
  BITFIELD_NODE_WIDTH,
  DEFAULT_NODE_WIDTH,
  createClassicConnectionFromGraphConnection,
  createClassicNodeFromGraphNode,
  createClassicNodeFromDefinition,
  createOrderedArrangePreset,
  createScriptEditorRuntime,
  exportReteEditorGraph,
  getRetePackageNames,
  isDynamicNode,
  recalcDynamicNodeHeight,
  syncDynamicNodeSizeFromDom,
  syncReteNodeDataFromGraph,
  syncReteNodePositionsFromGraph,
  wheelZoomDelta
} from '../src/features/script-editor/rete/setup'
import { NODE_DEFINITIONS } from '../src/features/script-editor/nodes/definitions'
import { addGraphNode, connectGraphNodes, createEmptyGraphState, updateGraphNodeData } from '../src/features/script-editor/rete/graphState'
import type { ScriptSchemes } from '../src/features/script-editor/rete/types'

describe('Rete setup skeleton', () => {
  it('exposes package names used by Phase 1 setup', () => {
    expect(getRetePackageNames()).toEqual([
      'rete',
      'rete-area-plugin',
      'rete-connection-plugin',
      'rete-react-plugin',
      'rete-auto-arrange-plugin',
      'rete-minimap-plugin'
    ])
  })

  it('creates DOM-free runtime metadata from the typed node registry', () => {
    const runtime = createScriptEditorRuntime()

    expect(runtime.nodeCount).toBe(66)
    expect(runtime.categoryKeys).toContain('compare')
    expect(runtime.categoryKeys).toContain('protocol')
    expect(runtime.socketKeys).toEqual(['dataSocket', 'boolSocket', 'flowSocket', 'triggerSocket'])
  })

  it('adds graph order as an ELK vertical position hint', () => {
    const preset = createOrderedArrangePreset((id) => id === 'later' ? 3 : 0)
    const layout = preset('later')

    expect(layout).toBeTruthy()
    expect(layout?.options?.('later')).toMatchObject({
      'elk.position': '(0, 3)'
    })
    expect(layout?.port({
      nodeId: 'later',
      side: 'input',
      key: 'in',
      index: 0,
      ports: 1,
      width: 216,
      height: 120
    })).toMatchObject({ side: 'WEST' })
  })

  it('creates a classic Rete node from a node definition', () => {
    const node = createClassicNodeFromDefinition(NODE_DEFINITIONS['compare-gte'])

    expect(node).toBeInstanceOf(ClassicPreset.Node)
    expect(node.label).toBe('大于等于')
    expect(node.inputs.left?.socket.name).toBe('数据')
    expect(node.outputs.result?.socket.name).toBe('布尔')
    expect(node.controls.operand).toBeInstanceOf(ClassicPreset.InputControl)
    expect(node.width).toBe(DEFAULT_NODE_WIDTH)
  })

  it('gives bitfield nodes a wider canvas so field-name inputs are usable', () => {
    const node = createClassicNodeFromDefinition(NODE_DEFINITIONS['protocol-bitfield'])
    expect(node.width).toBe(BITFIELD_NODE_WIDTH)
    expect(BITFIELD_NODE_WIDTH).toBeGreaterThan(DEFAULT_NODE_WIDTH)

    const graph = addGraphNode(createEmptyGraphState(), 'protocol-bitfield', { x: 0, y: 0 })
    const fromGraph = createClassicNodeFromGraphNode(graph.nodes[0])
    expect(fromGraph.width).toBe(BITFIELD_NODE_WIDTH)
  })

  it('sizes nodes without reserving canvas rows for select controls', () => {
    const serialInput = createClassicNodeFromDefinition(NODE_DEFINITIONS['input-serial'])

    expect(serialInput.controls.portPath).toBeInstanceOf(ClassicPreset.InputControl)
    expect(serialInput.controls.baudRate).toBeInstanceOf(ClassicPreset.InputControl)
    expect(serialInput.controls.bufferMs).toBeInstanceOf(ClassicPreset.InputControl)
    expect(serialInput.controls.timeout).toBeUndefined()
    expect(serialInput.height).toBe(160)
  })

  it('syncs graph-state nodes and connections through a Rete NodeEditor', async () => {
    let graph = createEmptyGraphState()
    graph = addGraphNode(graph, 'input-manual', { x: 10, y: 20 }, 'input', { content: 'A' })
    graph = addGraphNode(graph, 'compare-eq', { x: 260, y: 20 }, 'compare', { operand: 'A' })
    graph = connectGraphNodes(graph, {
      source: 'input',
      sourceOutput: 'out',
      target: 'compare',
      targetInput: 'left'
    })

    const editor = new NodeEditor<ScriptSchemes>()
    const source = createClassicNodeFromGraphNode(graph.nodes[0])
    const target = createClassicNodeFromGraphNode(graph.nodes[1])
    await editor.addNode(source)
    await editor.addNode(target)
    await editor.addConnection(createClassicConnectionFromGraphConnection(graph.connections[0], source, target))

    expect(source.id).toBe('input')
    expect(source.key).toBe('input-manual')
    expect(source.data?.content).toBe('A')
    expect((source.controls.content as ClassicPreset.InputControl<'text'>).value).toBe('A')
    expect(editor.getConnections()).toHaveLength(1)
    expect(exportReteEditorGraph(editor, graph).connections).toEqual(graph.connections)
  })

  it('bridges Rete input control edits back to node data', () => {
    const node = createClassicNodeFromDefinition(NODE_DEFINITIONS['input-manual'])
    const control = node.controls.content as ClassicPreset.InputControl<'text'>

    control.setValue('payload')

    expect(node.data?.content).toBe('payload')
  })

  it('updates only the changed Rete node without clearing the editor', async () => {
    let graph = addGraphNode(createEmptyGraphState(), 'output-log', { x: 0, y: 0 }, 'log', { prefix: 'before' })
    const node = createClassicNodeFromGraphNode(graph.nodes[0])
    const areaUpdates: Array<[string, string]> = []
    const instance = {
      editor: {
        getNode: (id: string) => (id === 'log' ? node : undefined),
        clear: async () => { throw new Error('full graph clear must not run') }
      },
      area: {
        update: async (type: string, id: string) => { areaUpdates.push([type, id]) }
      }
    }

    graph = updateGraphNodeData(graph, 'log', 'prefix', 'after')
    await syncReteNodeDataFromGraph(instance as never, graph, ['log'])

    expect(node.data?.prefix).toBe('after')
    expect(areaUpdates).toEqual([['node', 'log']])
  })

  it('translates only nodes whose restored positions changed', async () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 240, y: 120 }, 'input')
    const translations: Array<[string, { x: number; y: number }]> = []
    const instance = {
      area: {
        translate: async (id: string, position: { x: number; y: number }) => {
          translations.push([id, position])
        }
      }
    }

    await syncReteNodePositionsFromGraph(instance as never, graph, ['input'])

    expect(translations).toEqual([['input', { x: 240, y: 120 }]])
  })

  it('wheelZoomDelta follows Windows convention: forward zooms in', () => {
    // 向前（deltaY<0）放大，向后（deltaY>0）缩小；与 Rete 默认一致。
    expect(wheelZoomDelta(-100, 0.1)).toBe(0.1)
    expect(wheelZoomDelta(100, 0.1)).toBe(-0.1)
  })

  it('isDynamicNode recognizes all dynamic-port node keys', () => {
    expect(isDynamicNode('transform-object')).toBe(true)
    expect(isDynamicNode('transform-namefields')).toBe(true)
    expect(isDynamicNode('protocol-bitfield')).toBe(true)
    expect(isDynamicNode('protocol-concat')).toBe(true)
    expect(isDynamicNode('string-concat')).toBe(true)
    expect(isDynamicNode('script-expr')).toBe(true)
    expect(isDynamicNode('output-log')).toBe(false)
    expect(isDynamicNode(undefined)).toBe(false)
  })

  it('recalcDynamicNodeHeight updates height for dynamic nodes and returns true on change', () => {
    // 对象节点（transform-object）：初始高度按 0 键算，加键后高度应变大
    const objectNode = createClassicNodeFromGraphNode(
      addGraphNode(createEmptyGraphState(), 'transform-object', { x: 0, y: 0 }, 'obj', {
        keys: [{ id: 'k1', name: 'a' }, { id: 'k2', name: 'b' }, { id: 'k3', name: 'c' }]
      }).nodes[0]
    )
    // 篡改 height 模拟「过期」状态（如排版前被 ELK 读到的偏小值）
    objectNode.height = 86
    expect(recalcDynamicNodeHeight(objectNode)).toBe(true)
    expect(objectNode.height).toBeGreaterThan(86)

    // 再次校准：高度已是正确值 → 返回 false（无需刷新）
    expect(recalcDynamicNodeHeight(objectNode)).toBe(false)
  })

  it('recalcDynamicNodeHeight recalibrates concat nodes from data.ports', () => {
    const concatNode = createClassicNodeFromGraphNode(
      addGraphNode(createEmptyGraphState(), 'protocol-concat', { x: 0, y: 0 }, 'c', {
        ports: 5
      }).nodes[0]
    )
    concatNode.height = 86 // 模拟过期
    expect(recalcDynamicNodeHeight(concatNode)).toBe(true)
    // 5 端口 → 高度应大于 2 端口的默认
    expect(concatNode.height).toBeGreaterThan(86)
  })

  it('recalcDynamicNodeHeight returns false for non-dynamic nodes', () => {
    const logNode = createClassicNodeFromGraphNode(
      addGraphNode(createEmptyGraphState(), 'output-log', { x: 0, y: 0 }, 'log').nodes[0]
    )
    const before = logNode.height
    expect(recalcDynamicNodeHeight(logNode)).toBe(false)
    expect(logNode.height).toBe(before)
  })

  it('bitfield height estimate accounts for both port rows and control rows (regression: 排版后字段溢出)', () => {
    // 旧公式只按字段数算一次 28px，控件部分只给固定 60px 额度，
    // 字段越多欠得越多，排版后 area.resize 把容器压矮，字段挂在节点下面。
    // 新公式按真实 DOM 结构（端口行 22px + 控件行 26px + footer + 容器开销）拆开计高。
    const makeBitfield = (fieldCount: number, mode: string) =>
      createClassicNodeFromGraphNode(
        addGraphNode(createEmptyGraphState(), 'protocol-bitfield', { x: 0, y: 0 }, 'bf', {
          mode,
          fields: Array.from({ length: fieldCount }, (_, i) => ({ id: `f${i + 1}`, name: `x${i + 1}`, bits: 4 }))
        }).nodes[0]
      )

    const four = makeBitfield(4, '解包')
    // 4 字段：端口区 4*22+3*5=103，控件区 4*26+3*4=116 + footer 24 + chrome 20 + base 58 + 余量 4 ≈ 325
    // 关键回归断言：高度必须显著高于「只算一次端口行」的旧值（旧公式 4 字段 = 230）。
    expect(four.height).toBeGreaterThan(300)
    // 且随字段数单调增（每多一个字段，端口行 + 控件行各贡献一次）
    const six = makeBitfield(6, '解包')
    expect(six.height).toBeGreaterThan(four.height)

    // 打包/解包两种模式端口数对称，高度应基本一致（差异不超过 1px 取整误差）
    const pack = makeBitfield(4, '打包')
    expect(Math.abs(pack.height - four.height)).toBeLessThanOrEqual(1)
  })

  it('syncDynamicNodeSizeFromDom writes real DOM height back to node.height', () => {
    const bitfield = createClassicNodeFromGraphNode(
      addGraphNode(createEmptyGraphState(), 'protocol-bitfield', { x: 0, y: 0 }, 'bf', {
        mode: '解包',
        fields: [
          { id: 'f1', name: 'a', bits: 8 },
          { id: 'f2', name: 'b', bits: 8 },
          { id: 'f3', name: 'c', bits: 8 }
        ]
      }).nodes[0]
    )
    const formulaHeight = bitfield.height
    // 用纯 stub 模拟 DOM（vitest 默认 node 环境无 document）。
    // fakeRoot 实现 getBoundingClientRect，fakeElement 的 querySelector 返回 fakeRoot，
    // 复刻 rete-area-plugin resize 用的 `*:not(span):not([fragment])` 命中路径。
    let measuredHeight = formulaHeight + 40 // 模拟字段名换行/字体放大导致控件比公式高
    const fakeRoot = {
      getBoundingClientRect: () => ({ height: measuredHeight, width: 300 })
    }
    const fakeElement = {
      querySelector: () => fakeRoot
    }
    const area = {
      nodeViews: new Map([[String(bitfield.id), { element: fakeElement as unknown as HTMLElement }]])
    }

    expect(syncDynamicNodeSizeFromDom(bitfield, area)).toBe(true)
    expect(bitfield.height).toBe(formulaHeight + 40)

    // 再次同步：高度已一致 → 返回 false
    expect(syncDynamicNodeSizeFromDom(bitfield, area)).toBe(false)

    // DOM 变化后（如字段增多）应再次回写
    measuredHeight = formulaHeight + 80
    expect(syncDynamicNodeSizeFromDom(bitfield, area)).toBe(true)
    expect(bitfield.height).toBe(formulaHeight + 80)
  })

  it('syncDynamicNodeSizeFromDom falls back to formula when DOM view is missing', () => {
    const concat = createClassicNodeFromGraphNode(
      addGraphNode(createEmptyGraphState(), 'protocol-concat', { x: 0, y: 0 }, 'c', { ports: 4 }).nodes[0]
    )
    // 篡改成过期高度，模拟「import 后 DOM 尚未渲染就要排版」
    concat.height = 86
    const emptyArea = { nodeViews: new Map() }
    expect(syncDynamicNodeSizeFromDom(concat, emptyArea)).toBe(true)
    expect(concat.height).toBeGreaterThan(86) // 回退到公式，4 端口 > 86
  })

  it('syncDynamicNodeSizeFromDom ignores non-dynamic nodes', () => {
    const log = createClassicNodeFromGraphNode(
      addGraphNode(createEmptyGraphState(), 'output-log', { x: 0, y: 0 }, 'log').nodes[0]
    )
    const before = log.height
    const area = { nodeViews: new Map() }
    expect(syncDynamicNodeSizeFromDom(log, area)).toBe(false)
    expect(log.height).toBe(before)
  })
})
