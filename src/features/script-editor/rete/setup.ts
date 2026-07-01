import { ClassicPreset, NodeEditor } from 'rete'
import { createElement } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AreaExtensions, AreaPlugin, Drag } from 'rete-area-plugin'
import { AutoArrangePlugin, Presets as ArrangePresets } from 'rete-auto-arrange-plugin'
import { ClassicFlow, ConnectionPlugin } from 'rete-connection-plugin'
import type { SocketData } from 'rete-connection-plugin'
import { DockPlugin, DockPresets } from 'rete-dock-plugin'
import { MinimapPlugin } from 'rete-minimap-plugin'
import { ReactPlugin, Presets as ReactPresets } from 'rete-react-plugin'
import type { RenderEmit } from 'rete-react-plugin'
import type { ControlSpec, NodeDef, ReteGraphExport, SocketKind } from '@shared/types'
import { NODE_CATEGORIES, NODE_DEFINITIONS } from '@/features/script-editor/nodes/definitions'
import { SOCKETS, canConnectSockets } from '@/features/script-editor/nodes/sockets'
import {
  debugScriptNodeInteraction,
  describeInteractionTarget,
  SCRIPT_NODE_OPEN_CONFIG_EVENT
} from '@/features/script-editor/nodeInteraction'
import type { GraphEditorConnection, GraphEditorNode, GraphEditorState } from '@/features/script-editor/rete/graphState'
import type { ScriptAreaExtra, ScriptConnection, ScriptNode, ScriptSchemes } from '@/features/script-editor/rete/types'

const socketInstances: Record<SocketKind, ClassicPreset.Socket> = {
  dataSocket: new ClassicPreset.Socket(SOCKETS.dataSocket.label),
  boolSocket: new ClassicPreset.Socket(SOCKETS.boolSocket.label),
  flowSocket: new ClassicPreset.Socket(SOCKETS.flowSocket.label),
  triggerSocket: new ClassicPreset.Socket(SOCKETS.triggerSocket.label)
}

export interface ScriptEditorRuntime {
  nodeCount: number
  categoryKeys: string[]
  socketKeys: SocketKind[]
}

export interface ReteEditorInstance {
  editor: NodeEditor<ScriptSchemes>
  area: AreaPlugin<ScriptSchemes, ScriptAreaExtra>
  connection: ConnectionPlugin<ScriptSchemes, ScriptAreaExtra>
  render: ReactPlugin<ScriptSchemes, ScriptAreaExtra>
  arrange: AutoArrangePlugin<ScriptSchemes, ScriptAreaExtra>
  dock: DockPlugin<ScriptSchemes>
  minimap: MinimapPlugin<ScriptSchemes>
  options: CreateReteEditorOptions
  setAreaPanEnabled: (enabled: boolean) => void
  destroy: () => void
}

export type ReteGraphChange =
  | { type: 'node-position'; id: string; position: { x: number; y: number } }
  | { type: 'node-data'; id: string; key: string; value: unknown }
  | { type: 'connection-created'; connection: GraphEditorConnection }
  | { type: 'connection-removed'; connectionId: string }

type ClassicNodeProps = {
  data: ScriptNode
  emit: RenderEmit<ScriptSchemes>
}

type RefSocketProps = {
  emit: RenderEmit<ScriptSchemes>
  name: string
  nodeId: string
  payload: ClassicPreset.Socket
  side: 'input' | 'output'
  socketKey: string
}

type RefControlProps = {
  emit: RenderEmit<ScriptSchemes>
  name: string
  payload: ClassicPreset.Control
}

const RefSocket = ReactPresets.classic.RefSocket as ComponentType<RefSocketProps>
const RefControl = ReactPresets.classic.RefControl as ComponentType<RefControlProps>

export interface CreateReteEditorOptions {
  onGraphChange?: (change: ReteGraphChange) => void
}

export function getRetePackageNames(): string[] {
  return [
    'rete',
    'rete-area-plugin',
    'rete-connection-plugin',
    'rete-react-plugin',
    'rete-auto-arrange-plugin',
    'rete-dock-plugin',
    'rete-minimap-plugin'
  ]
}

export function createScriptEditorRuntime(): ScriptEditorRuntime {
  return {
    nodeCount: Object.keys(NODE_DEFINITIONS).length,
    categoryKeys: Object.keys(NODE_CATEGORIES),
    socketKeys: Object.keys(SOCKETS) as SocketKind[]
  }
}

export function createClassicNodeFromDefinition(definition: NodeDef): ScriptNode {
  const node = new ClassicPreset.Node(definition.name) as ScriptNode
  node.width = 216
  node.height = calculateNodeHeight(definition)
  node.key = definition.key
  node.data = Object.fromEntries(definition.controls.map((control) => [control.key, control.default ?? '']))

  definition.inputs.forEach((input) => {
    node.addInput(input.key, new ClassicPreset.Input(socketInstances[input.socket], input.label, false))
  })

  definition.outputs.forEach((output) => {
    node.addOutput(output.key, new ClassicPreset.Output(socketInstances[output.socket], output.label, true))
  })

  definition.controls.forEach((control) => {
    const inputControl = createInputControl(control, (value) => {
      node.data = { ...(node.data || {}), [control.key]: value }
      node.onDataChange?.(control.key, value)
    })
    if (inputControl) node.addControl(control.key, inputControl)
  })

  return node
}

export function createClassicNodeFromGraphNode(graphNode: GraphEditorNode): ScriptNode {
  const definition = NODE_DEFINITIONS[graphNode.key]
  const node = createClassicNodeFromDefinition(definition)
  node.id = graphNode.id
  node.label = graphNode.label
  node.key = graphNode.key
  node.data = { ...graphNode.data }

  definition.controls.forEach((control) => {
    const inputControl = node.controls[control.key]
    if (inputControl instanceof ClassicPreset.InputControl) {
      const value = graphNode.data[control.key]
      if (control.type === 'number') inputControl.setValue(Number(value ?? control.default ?? 0))
      else inputControl.setValue(String(value ?? control.default ?? ''))
    }
  })

  return node
}

export function createClassicConnectionFromGraphConnection(
  connection: GraphEditorConnection,
  source: ScriptNode,
  target: ScriptNode
): ScriptConnection {
  const classicConnection = new ClassicPreset.Connection(
    source,
    connection.sourceOutput as keyof ScriptNode['outputs'],
    target,
    connection.targetInput as keyof ScriptNode['inputs']
  ) as ScriptConnection
  classicConnection.id = connection.id
  return classicConnection
}

export async function syncReteEditorFromGraph(instance: ReteEditorInstance, graph: GraphEditorState): Promise<void> {
  await instance.editor.clear()
  const nodeMap = new Map<string, ScriptNode>()

  for (const graphNode of graph.nodes) {
    const node = createClassicNodeFromGraphNode(graphNode)
    node.onDataChange = (key, value) => {
      node.data = { ...(node.data || {}), [key]: value }
      instance.options.onGraphChange?.({ type: 'node-data', id: node.id, key, value })
    }
    nodeMap.set(node.id, node)
    await instance.editor.addNode(node)
    await instance.area.translate(node.id, graphNode.position)
  }

  for (const connection of graph.connections) {
    const source = nodeMap.get(connection.source)
    const target = nodeMap.get(connection.target)
    if (!source || !target) continue
    await instance.editor.addConnection(createClassicConnectionFromGraphConnection(connection, source, target))
  }
}

export function exportReteEditorGraph(
  editor: Pick<NodeEditor<ScriptSchemes>, 'getNodes' | 'getConnections'>,
  fallbackGraph?: GraphEditorState
): ReteGraphExport {
  const fallbackPositions = new Map((fallbackGraph?.nodes || []).map((node) => [node.id, node.position]))
  return {
    nodes: editor.getNodes().map((node) => ({
      id: node.id,
      key: node.key || '',
      label: node.label,
      position: fallbackPositions.get(node.id) || { x: 0, y: 0 },
      data: node.data || {},
      inputs: node.inputs,
      outputs: node.outputs
    })),
    connections: editor.getConnections().map((connection) => ({
      id: connection.id,
      source: connection.source,
      sourceOutput: String(connection.sourceOutput),
      target: connection.target,
      targetInput: String(connection.targetInput)
    }))
  }
}

export function createReteEditor(container: HTMLElement, options: CreateReteEditorOptions = {}): ReteEditorInstance {
  const editor = new NodeEditor<ScriptSchemes>()
  const area = new AreaPlugin<ScriptSchemes, ScriptAreaExtra>(container)
  const connection = new ConnectionPlugin<ScriptSchemes, ScriptAreaExtra>()
  const render = new ReactPlugin<ScriptSchemes, ScriptAreaExtra>({ createRoot })
  const arrange = new AutoArrangePlugin<ScriptSchemes, ScriptAreaExtra>()
  const dock = new DockPlugin<ScriptSchemes>()

  connection.addPreset(() => new ClassicFlow<ScriptSchemes, [ScriptAreaExtra]>({
    canMakeConnection: (from: SocketData, to: SocketData) => canMakeReteConnection(editor, from, to),
    makeConnection: (from: SocketData, to: SocketData) => {
      const graphConnection = graphConnectionFromSockets(editor, from, to)
      if (!graphConnection) return false
      void editor.addConnection(createClassicConnectionFromGraphConnection(
        graphConnection,
        editor.getNode(graphConnection.source)!,
        editor.getNode(graphConnection.target)!
      )).then((created) => {
        if (created) options.onGraphChange?.({ type: 'connection-created', connection: graphConnection })
      })
      return true
    }
  }))
  render.addPreset(ReactPresets.classic.setup({
    customize: {
      node: () => ScriptClassicNode
    }
  }))
  render.addPreset(ReactPresets.minimap.setup({ size: 200 }))
  arrange.addPreset(ArrangePresets.classic.setup())
  dock.addPreset(DockPresets.classic.setup({ area }))

  const minimap = new MinimapPlugin<ScriptSchemes>()

  editor.use(area)
  area.use(connection)
  area.use(render)
  area.use(arrange)
  area.use(dock)
  area.use(minimap)

  const selector = AreaExtensions.selector()
  AreaExtensions.selectableNodes(area, selector, { accumulating: AreaExtensions.accumulateOnCtrl() })
  AreaExtensions.simpleNodesOrder(area)

  let areaPanAllowed = true
  area.area.setDragHandler(new Drag({
    down: () => areaPanAllowed,
    move: () => true
  }))

  return {
    editor,
    area,
    connection,
    render,
    arrange,
    dock,
    minimap,
    options,
    setAreaPanEnabled: (enabled: boolean) => { areaPanAllowed = enabled },
    destroy: () => area.destroy()
  }
}

function canMakeReteConnection(editor: NodeEditor<ScriptSchemes>, from: SocketData, to: SocketData): boolean {
  return !!graphConnectionFromSockets(editor, from, to)
}

function graphConnectionFromSockets(
  editor: NodeEditor<ScriptSchemes>,
  from: SocketData,
  to: SocketData
): GraphEditorConnection | null {
  const output = from.side === 'output' ? from : to.side === 'output' ? to : null
  const input = from.side === 'input' ? from : to.side === 'input' ? to : null
  if (!output || !input || output.nodeId === input.nodeId) return null

  const source = editor.getNode(output.nodeId)
  const target = editor.getNode(input.nodeId)
  const sourceSocket = source?.outputs[output.key]?.socket
  const targetSocket = target?.inputs[input.key]?.socket
  if (!source || !target || !sourceSocket || !targetSocket) return null
  if (!canConnectSockets(socketKindFromName(sourceSocket.name), socketKindFromName(targetSocket.name))) return null

  return {
    id: `${output.nodeId}:${output.key}->${input.nodeId}:${input.key}`,
    source: output.nodeId,
    sourceOutput: output.key,
    target: input.nodeId,
    targetInput: input.key
  }
}

function socketKindFromName(name: string): SocketKind {
  const match = Object.values(SOCKETS).find((socket) => socket.label === name)
  return match?.key || 'dataSocket'
}

function createInputControl(control: ControlSpec, onChange?: (value: unknown) => void): ClassicPreset.Control | null {
  if (control.type === 'number') {
    return new ClassicPreset.InputControl('number', {
      initial: Number(control.default ?? 0),
      change: onChange
    })
  }
  if (control.type === 'text' || control.type === 'select') {
    return new ClassicPreset.InputControl('text', {
      initial: String(control.default ?? ''),
      change: onChange
    })
  }
  return null
}

function calculateNodeHeight(definition: NodeDef): number {
  const ports = Math.max(definition.inputs.length, definition.outputs.length)
  const controlRows = definition.controls.filter((control) => control.type !== 'select').length
  const serialSummary = definition.key === 'input-serial' || definition.key === 'output-serial' ? 26 : 0
  return Math.max(86, 58 + ports * 28 + controlRows * 24 + serialSummary)
}

// 串口节点标题下方摘要：显示当前选中的 COM 端口 + 波特率。
function renderSerialSummary(data: ScriptNode): ReactElement | null {
  if (data.key !== 'input-serial' && data.key !== 'output-serial') return null
  const portPath = String(data.data?.portPath ?? '')
  const baudRate = data.data?.baudRate
  const isCurrent = portPath === '__current__' || !portPath
  const portLabel = isCurrent ? '当前串口' : portPath
  const baudLabel = baudRate ? `${baudRate}` : ''
  return createElement(
    'div',
    { className: 'script-rete-node__serial-summary', 'data-testid': 'serial-summary' },
    createElement('span', { className: 'script-rete-node__serial-port' }, portLabel),
    baudLabel ? createElement('span', { className: 'script-rete-node__serial-baud' }, `${baudLabel} bps`) : null
  )
}

const ScriptClassicNode: ComponentType<ClassicNodeProps> = ({ data, emit }) => {
  const inputs = sortEntries(data.inputs)
  const outputs = sortEntries(data.outputs)
  const definition = data.key ? NODE_DEFINITIONS[data.key] : null
  const controlSpecs = new Map(definition?.controls.map((control) => [control.key, control]) || [])
  const controls = sortEntries(data.controls).filter(([key]) => controlSpecs.get(key)?.type !== 'select')
  const controlLabels = new Map(definition?.controls.map((control) => [control.key, control.label]) || [])

  return createElement(
    'div',
    {
      className: 'script-rete-node',
      'data-node-id': data.id,
      'data-node-key': data.key || undefined,
      'data-selected': data.selected || undefined,
      'data-testid': 'node',
      onDoubleClick: (event) => {
        debugScriptNodeInteraction('node.dblclick', {
          id: data.id,
          detail: event.detail,
          target: describeInteractionTarget(event.target)
        })
        emitOpenConfigEvent(event.currentTarget, data.id, 'dblclick')
      },
      style: { width: data.width, minHeight: data.height }
    },
    createElement(
      'div',
      { className: 'script-rete-node__title', 'data-testid': 'title' },
      createElement('span', { className: 'script-rete-node__name' }, data.label),
      definition ? createElement('span', { className: 'script-rete-node__kind' }, definition.category) : null
    ),
    renderSerialSummary(data),
    createElement(
      'div',
      { className: 'script-rete-node__ports' },
      createElement(
        'div',
        { className: 'script-rete-node__side' },
        inputs.map(([key, input]) => input ? createElement(
          'div',
          {
            className: 'script-rete-node__port script-rete-node__port--input',
            'data-testid': `input-${key}`,
            key
          },
          createElement(RefSocket, {
            emit,
            name: 'input-socket',
            nodeId: data.id,
            payload: input.socket,
            side: 'input',
            socketKey: key
          }),
          createElement('span', { className: 'script-rete-node__port-title', 'data-testid': 'input-title' }, input.label)
        ) : null)
      ),
      createElement(
        'div',
        { className: 'script-rete-node__side script-rete-node__side--output' },
        outputs.map(([key, output]) => output ? createElement(
          'div',
          {
            className: 'script-rete-node__port script-rete-node__port--output',
            'data-testid': `output-${key}`,
            key
          },
          createElement('span', { className: 'script-rete-node__port-title', 'data-testid': 'output-title' }, output.label),
          createElement(RefSocket, {
            emit,
            name: 'output-socket',
            nodeId: data.id,
            payload: output.socket,
            side: 'output',
            socketKey: key
          })
        ) : null)
      )
    ),
    controls.length > 0 ? createElement(
      'div',
      { className: 'script-rete-node__controls' },
      controls.map(([key, control]) => control ? createElement(
        'div',
        {
          className: 'script-rete-node__control',
          'data-testid': `control-${key}`,
          key
        },
        createElement('span', null, controlLabels.get(key) || key),
        createElement(RefControl, {
          emit,
          name: 'control',
          payload: control
        })
      ) : null)
    ) : null
  )
}

function sortEntries<T extends { index?: number }>(items: Record<string, T | undefined>): Array<[string, T | undefined]> {
  return Object.entries(items).sort((left, right) => (left[1]?.index || 0) - (right[1]?.index || 0))
}

function emitOpenConfigEvent(target: HTMLElement, id: string, source: string) {
  debugScriptNodeInteraction('node.emit-open-config', { id, source })
  target.dispatchEvent(new CustomEvent(SCRIPT_NODE_OPEN_CONFIG_EVENT, {
    bubbles: true,
    detail: { id, source }
  }))
}
