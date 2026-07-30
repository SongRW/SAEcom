import { describe, expect, it } from 'vitest'
import {
  addGraphNode,
  connectGraphNodes,
  createEmptyGraphState,
  updateGraphNodeData
} from '../src/features/script-editor/rete/graphState'
import { classifyGraphSync } from '../src/features/script-editor/rete/graphSync'

describe('script editor graph synchronization', () => {
  it('classifies a scalar node configuration edit as a local data refresh', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'output-log', { x: 0, y: 0 }, 'log')
    const next = updateGraphNodeData(graph, 'log', 'prefix', '[status]')

    expect(classifyGraphSync(graph, next)).toEqual({
      kind: 'node-data',
      changedNodeIds: ['log']
    })
  })

  it('classifies a connection change as a structural refresh', () => {
    let graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'source')
    graph = addGraphNode(graph, 'output-log', { x: 240, y: 0 }, 'log')
    const next = connectGraphNodes(graph, {
      source: 'source',
      sourceOutput: 'out',
      target: 'log',
      targetInput: 'in'
    })

    expect(classifyGraphSync(graph, next)).toEqual({
      kind: 'structure',
      changedNodeIds: []
    })
  })

  it('classifies an external custom-control edit as a structural refresh', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'transform-namefields', { x: 0, y: 0 }, 'names', {
      keys: [{ id: 'k1', name: 'before' }]
    })
    const next = updateGraphNodeData(graph, 'names', 'keys', [{ id: 'k1', name: 'after' }])

    expect(classifyGraphSync(graph, next)).toEqual({
      kind: 'structure',
      changedNodeIds: []
    })
  })

  it('classifies a dynamic port mode change as a structural refresh', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'protocol-bitfield', { x: 0, y: 0 }, 'bitfield', {
      mode: '打包',
      fields: [{ id: 'f1', name: '状态', bits: 8 }]
    })
    const next = updateGraphNodeData(graph, 'bitfield', 'mode', '解包')

    expect(classifyGraphSync(graph, next)).toEqual({
      kind: 'structure',
      changedNodeIds: []
    })
  })

  it('classifies a retained bitfield field change as a structural refresh', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'protocol-bitfield', { x: 0, y: 0 }, 'bitfield', {
      mode: '打包',
      fields: [{ id: 'f1', name: '状态', bits: 8 }]
    })
    const next = updateGraphNodeData(graph, 'bitfield', 'fields', [{ id: 'f1', name: '告警', bits: 8 }])

    expect(classifyGraphSync(graph, next)).toEqual({
      kind: 'structure',
      changedNodeIds: []
    })
  })

  it('classifies a position-only history restore as a local position refresh', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'input')
    const next = {
      ...graph,
      nodes: graph.nodes.map((node) => ({ ...node, position: { x: 240, y: 120 } }))
    }

    expect(classifyGraphSync(graph, next)).toEqual({
      kind: 'node-position',
      changedNodeIds: ['input']
    })
  })

  it('returns none for the same graph state', () => {
    const graph = addGraphNode(createEmptyGraphState(), 'input-manual', { x: 0, y: 0 }, 'input')

    expect(classifyGraphSync(graph, graph)).toEqual({ kind: 'none', changedNodeIds: [] })
  })
})
