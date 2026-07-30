import { describe, expect, it } from 'vitest'
import { ClassicPreset, NodeEditor } from 'rete'
import {
  BITFIELD_NODE_WIDTH,
  DEFAULT_NODE_WIDTH,
  createClassicConnectionFromGraphConnection,
  createClassicNodeFromGraphNode,
  createClassicNodeFromDefinition,
  createScriptEditorRuntime,
  exportReteEditorGraph,
  getRetePackageNames,
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
      'rete-dock-plugin',
      'rete-minimap-plugin'
    ])
  })

  it('creates DOM-free runtime metadata from the typed node registry', () => {
    const runtime = createScriptEditorRuntime()

    expect(runtime.nodeCount).toBe(64)
    expect(runtime.categoryKeys).toContain('compare')
    expect(runtime.categoryKeys).toContain('protocol')
    expect(runtime.socketKeys).toEqual(['dataSocket', 'boolSocket', 'flowSocket', 'triggerSocket'])
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
})
