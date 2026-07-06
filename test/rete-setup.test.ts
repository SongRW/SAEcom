import { describe, expect, it } from 'vitest'
import { ClassicPreset, NodeEditor } from 'rete'
import {
  createClassicConnectionFromGraphConnection,
  createClassicNodeFromGraphNode,
  createClassicNodeFromDefinition,
  createScriptEditorRuntime,
  exportReteEditorGraph,
  getRetePackageNames
} from '../src/features/script-editor/rete/setup'
import { NODE_DEFINITIONS } from '../src/features/script-editor/nodes/definitions'
import { addGraphNode, connectGraphNodes, createEmptyGraphState } from '../src/features/script-editor/rete/graphState'
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

    expect(runtime.nodeCount).toBe(51)
    expect(runtime.categoryKeys).toContain('compare')
    expect(runtime.socketKeys).toEqual(['dataSocket', 'boolSocket', 'flowSocket', 'triggerSocket'])
  })

  it('creates a classic Rete node from a node definition', () => {
    const node = createClassicNodeFromDefinition(NODE_DEFINITIONS['compare-gte'])

    expect(node).toBeInstanceOf(ClassicPreset.Node)
    expect(node.label).toBe('大于等于')
    expect(node.inputs.left?.socket.name).toBe('数据')
    expect(node.outputs.result?.socket.name).toBe('布尔')
    expect(node.controls.operand).toBeInstanceOf(ClassicPreset.InputControl)
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
})
