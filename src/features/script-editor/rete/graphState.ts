import type {
  ReteGraphConnection,
  ReteGraphExport,
  ReteGraphNode,
  SerialPanelSummary,
  SocketKind,
  SocketSpec
} from '@shared/types'
import { NODE_DEFINITIONS, getNodeDefinition } from '@/features/script-editor/nodes/definitions'
import { canConnectSockets } from '@/features/script-editor/nodes/sockets'
import { createDefaultNodeData, migrateNodeData, updateConfigRefForControl, validateNodeConfig } from '@/features/script-editor/panelConfig'
import { resolveNodePorts } from '@/features/script-editor/rete/dynamicPorts'

export interface GraphPort {
  key: string
  label: string
  socket: SocketKind
}

export type GraphNodeData = Record<string, unknown>

export interface GraphEditorNode extends Omit<ReteGraphNode, 'id' | 'position' | 'data' | 'inputs' | 'outputs'> {
  id: string
  key: string
  label: string
  position: { x: number; y: number }
  data: GraphNodeData
  inputs: Record<string, GraphPort>
  outputs: Record<string, GraphPort>
}

export interface GraphEditorConnection extends Required<Omit<ReteGraphConnection, 'id'>> {
  id: string
  source: string
  target: string
}

export interface GraphEditorState {
  nodes: GraphEditorNode[]
  connections: GraphEditorConnection[]
}

export interface PendingConnection {
  source: string | number
  sourceOutput: string
  target: string | number
  targetInput: string
}

export interface CompatibleSource {
  nodeId: string
  outputKey: string
  label: string
}

export function createEmptyGraphState(): GraphEditorState {
  return { nodes: [], connections: [] }
}

export function importGraphState(graph: ReteGraphExport | null | undefined): GraphEditorState {
  if (!graph?.nodes) return createEmptyGraphState()

  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : Object.values(graph.nodes)
  const rawConnections = Array.isArray(graph.connections)
    ? graph.connections
    : Object.values(graph.connections || {})

  let state = createEmptyGraphState()
  rawNodes.forEach((node) => {
    if (!getNodeDefinition(node.key)) return
    state = addGraphNode(
      state,
      node.key,
      node.position || { x: 0, y: 0 },
      String(node.id),
      migrateNodeData(node.key, node.data || {}),
      node.label
    )
  })

  rawConnections.forEach((connection) => {
    state = connectGraphNodes(state, connection)
  })

  return state
}

export function exportGraphState(state: GraphEditorState): ReteGraphExport {
  return {
    nodes: state.nodes.map((node) => ({
      id: node.id,
      key: node.key,
      label: node.label,
      position: node.position,
      data: { ...node.data },
      inputs: node.inputs,
      outputs: node.outputs
    })),
    connections: state.connections.map((connection) => ({ ...connection }))
  }
}

export function addGraphNode(
  state: GraphEditorState,
  key: string,
  position: { x: number; y: number },
  id = nextNodeId(state),
  data: GraphNodeData = {},
  label?: string
): GraphEditorState {
  const definition = getNodeDefinition(key)
  if (!definition) throw new Error(`Unknown script node: ${key}`)
  const panels = Array.isArray((data as { __panels?: unknown }).__panels)
    ? (data as { __panels: SerialPanelSummary[] }).__panels
    : []
  const cleanData = { ...data }
  delete cleanData.__panels
  const migratedData = Object.keys(cleanData).length > 0 ? migrateNodeData(key, cleanData) : {}

  const nodeData = { ...defaultNodeData(key, panels), ...migratedData }
  const ports = resolveNodePorts(key, nodeData)
  const node: GraphEditorNode = {
    id: String(id),
    key,
    label: label || definition.name,
    position: { x: position.x, y: position.y },
    data: nodeData,
    inputs: portMap(ports.inputs),
    outputs: portMap(ports.outputs)
  }

  return {
    ...state,
    nodes: [...state.nodes.filter((existing) => existing.id !== node.id), node]
  }
}

export function duplicateGraphNode(state: GraphEditorState, nodeId: string | number): GraphEditorState {
  const source = state.nodes.find((node) => node.id === String(nodeId))
  if (!source) return state
  const nextPosition = { x: source.position.x + 32, y: source.position.y + 32 }
  return addGraphNode(state, source.key, nextPosition, nextNodeId(state), source.data, `${source.label} 副本`)
}

export function updateGraphNodeData(
  state: GraphEditorState,
  nodeId: string | number,
  controlKey: string,
  value: unknown
): GraphEditorState {
  const id = String(nodeId)
  const updatedNodes = state.nodes.map((node) => {
    if (node.id !== id) return node
    const data = updateConfigRefForControl(node.key, node.data, controlKey, value)
    const ports = resolveNodePorts(node.key, data)
    return { ...node, data, inputs: portMap(ports.inputs), outputs: portMap(ports.outputs) }
  })
  const nodesById = new Map(updatedNodes.map((node) => [node.id, node]))
  const connections = state.connections.filter((connection) => {
    const source = nodesById.get(connection.source)
    const target = nodesById.get(connection.target)
    const sourceOutput = source?.outputs[connection.sourceOutput]
    const targetInput = target?.inputs[connection.targetInput]
    return !!sourceOutput && !!targetInput && canConnectSockets(sourceOutput.socket, targetInput.socket)
  })
  return { ...state, nodes: updatedNodes, connections }
}

export function updateGraphNodePosition(
  state: GraphEditorState,
  nodeId: string | number,
  position: { x: number; y: number }
): GraphEditorState {
  const id = String(nodeId)
  return {
    ...state,
    nodes: state.nodes.map((node) => (
      node.id === id ? { ...node, position: { x: position.x, y: position.y } } : node
    ))
  }
}

/** 批量更新节点坐标（自动排版一次写回，避免 N 次 setState）。 */
export function updateGraphNodePositions(
  state: GraphEditorState,
  positions: Record<string, { x: number; y: number }>
): GraphEditorState {
  if (Object.keys(positions).length === 0) return state
  let changed = false
  const nodes = state.nodes.map((node) => {
    const next = positions[node.id]
    if (!next) return node
    if (node.position.x === next.x && node.position.y === next.y) return node
    changed = true
    return { ...node, position: { x: next.x, y: next.y } }
  })
  return changed ? { ...state, nodes } : state
}

export function removeGraphNode(state: GraphEditorState, nodeId: string | number): GraphEditorState {
  const id = String(nodeId)
  return {
    nodes: state.nodes.filter((node) => node.id !== id),
    connections: state.connections.filter((connection) => connection.source !== id && connection.target !== id)
  }
}

export function removeGraphConnection(state: GraphEditorState, connectionId: string): GraphEditorState {
  return {
    ...state,
    connections: state.connections.filter((connection) => connection.id !== connectionId)
  }
}

export function connectGraphNodes(state: GraphEditorState, pending: PendingConnection): GraphEditorState {
  const sourceId = String(pending.source)
  const targetId = String(pending.target)
  const sourceNode = state.nodes.find((node) => node.id === sourceId)
  const targetNode = state.nodes.find((node) => node.id === targetId)
  const sourceOutput = sourceNode?.outputs[pending.sourceOutput]
  const targetInput = targetNode?.inputs[pending.targetInput]

  if (!sourceNode || !targetNode || !sourceOutput || !targetInput) return state
  if (!canConnectSockets(sourceOutput.socket, targetInput.socket)) return state

  const connection: GraphEditorConnection = {
    id: connectionId(sourceId, pending.sourceOutput, targetId, pending.targetInput),
    source: sourceId,
    sourceOutput: pending.sourceOutput,
    target: targetId,
    targetInput: pending.targetInput
  }

  const remaining = state.connections.filter((existing) => (
    existing.id !== connection.id && !(existing.target === targetId && existing.targetInput === pending.targetInput)
  ))

  return { ...state, connections: [...remaining, connection] }
}

export function getCompatibleSources(
  state: GraphEditorState,
  targetId: string | number,
  targetInputKey: string
): CompatibleSource[] {
  const targetNode = state.nodes.find((node) => node.id === String(targetId))
  const targetInput = targetNode?.inputs[targetInputKey]
  if (!targetNode || !targetInput) return []

  return state.nodes.flatMap((node) => {
    if (node.id === targetNode.id) return []
    return Object.values(node.outputs)
      .filter((output) => canConnectSockets(output.socket, targetInput.socket))
      .map((output) => ({
        nodeId: node.id,
        outputKey: output.key,
        label: `${node.label} / ${output.label}`
      }))
  })
}

export function validateGraphNode(node: GraphEditorNode): string[] {
  const definition = getNodeDefinition(node.key)
  if (!definition) return [`未知节点: ${node.key}`]

  const controlErrors = definition.controls.flatMap((control) => {
    if (!control.required) return []
    const value = node.data[control.key]
    return value === undefined || value === null || String(value).trim() === ''
      ? [`${control.label}不能为空`]
      : []
  })

  return [...controlErrors, ...validateNodeConfig(node.key, node.data)]
}

export function validateGraphState(state: GraphEditorState): Map<string, string[]> {
  return new Map(state.nodes.map((node) => [node.id, validateGraphNode(node)]))
}

export function defaultNodeData(key: string, panels: SerialPanelSummary[] = []): GraphNodeData {
  const definition = getNodeDefinition(key)
  if (!definition) return {}
  return {
    ...Object.fromEntries(definition.controls.map((control) => [control.key, control.default ?? ''])),
    ...createDefaultNodeData(key, panels)
  }
}

function portMap(specs: SocketSpec[]): Record<string, GraphPort> {
  return Object.fromEntries(specs.map((spec) => [
    spec.key,
    { key: spec.key, label: spec.label || spec.key, socket: spec.socket }
  ]))
}

function nextNodeId(state: GraphEditorState): string {
  const existingIds = new Set(state.nodes.map((node) => node.id))
  let index = Object.keys(NODE_DEFINITIONS).length + state.nodes.length + 1
  while (existingIds.has(`node-${index}`)) index++
  return `node-${index}`
}

function connectionId(source: string, sourceOutput: string, target: string, targetInput: string): string {
  return `${source}:${sourceOutput}->${target}:${targetInput}`
}
