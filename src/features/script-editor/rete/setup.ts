import { ClassicPreset, NodeEditor } from 'rete'
import { createElement } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { AreaExtensions, AreaPlugin, Drag, Zoom } from 'rete-area-plugin'
import { AutoArrangePlugin, Presets as ArrangePresets } from 'rete-auto-arrange-plugin'
import type { Preset } from 'rete-auto-arrange-plugin'
import { ClassicFlow, ConnectionPlugin } from 'rete-connection-plugin'
import type { SocketData } from 'rete-connection-plugin'
import { MinimapPlugin } from 'rete-minimap-plugin'
import { ReactPlugin, Presets as ReactPresets } from 'rete-react-plugin'
import type { RenderEmit } from 'rete-react-plugin'
import type { ControlSpec, NodeDef, ReteGraphExport, SocketKind } from '@shared/types'
import { NODE_CATEGORIES, NODE_DEFINITIONS, getNodeDefinition } from '@/features/script-editor/nodes/definitions'
import { SOCKETS, canConnectSockets } from '@/features/script-editor/nodes/sockets'
import { orthogonalConnectionPath } from '@/features/script-editor/rete/connectionPath'
import {
  CANVAS_ZOOM_MAX,
  MINIMAP_MIN_DISTANCE,
  MINIMAP_RATIO,
  MINIMAP_SIZE,
  computeCanvasPanBounds,
  computeCanvasZoomMin
} from '@/features/script-editor/viewModel'
import {
  debugScriptNodeInteraction,
  describeInteractionTarget,
  SCRIPT_NODE_OPEN_CONFIG_EVENT
} from '@/features/script-editor/nodeInteraction'
import type { GraphEditorConnection, GraphEditorNode, GraphEditorState } from '@/features/script-editor/rete/graphState'
import type { ScriptAreaExtra, ScriptConnection, ScriptNode, ScriptSchemes } from '@/features/script-editor/rete/types'
import { KeyListControl, KeyListControlView, type KeyEntry } from '@/features/script-editor/rete/KeyListControl'
import { BitfieldControl, BitfieldControlView, type BitfieldEntry } from '@/features/script-editor/rete/BitfieldControl'
import { concatPortCount, isConcatNode, parseBitfieldEntries, parseKeyEntries, resolveNodePorts } from '@/features/script-editor/rete/dynamicPorts'

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
  getArrangeOrderIndex?: (id: string) => number
  /**
   * 返回当前 app 层选中的节点 id 集合（真实选择源；不用 Rete 内置 selector）。
   * 供渲染层在连线 DOM 上设置高亮属性（见 GraphCanvas 选择→DOM effect）。
   */
  getSelectedNodeIds?: () => Set<string>
}

export function createOrderedArrangePreset(getArrangeOrderIndex: (id: string) => number): Preset {
  const classic = ArrangePresets.classic.setup()

  return (id) => {
    const layout = classic(id)
    if (!layout) return null

    return {
      ...layout,
      options: () => ({
        ...layout.options?.(id),
        'elk.position': `(0, ${getArrangeOrderIndex(id)})`
      })
    }
  }
}

export function getRetePackageNames(): string[] {
  return [
    'rete',
    'rete-area-plugin',
    'rete-connection-plugin',
    'rete-react-plugin',
    'rete-auto-arrange-plugin',
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

/** 普通节点默认宽度（px）。 */
export const DEFAULT_NODE_WIDTH = 216
/**
 * 位域节点宽度：字段名 + 位宽 + bit 标签 + 删除钮并排，216 会把名称输入挤到只剩两三个字。
 * 与 CSS `.script-rete-node__control--full` 配套，让 fields 控件占满整行。
 */
export const BITFIELD_NODE_WIDTH = 300

export function createClassicNodeFromDefinition(definition: NodeDef): ScriptNode {
  const node = new ClassicPreset.Node(definition.name) as ScriptNode
  node.width = isBitfieldNode(definition.key) ? BITFIELD_NODE_WIDTH : DEFAULT_NODE_WIDTH
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
  const definition = getNodeDefinition(graphNode.key) ?? NODE_DEFINITIONS[graphNode.key]
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

  if (isKeyListNode(graphNode.key)) {
    const keys = parseKeyEntries(graphNode.data as Record<string, unknown> | undefined)
    syncKeyListNodePorts(node, keys)
    if (!node.controls['keys']) {
      node.addControl('keys', new KeyListControl(keys, () => {}))
    }
    node.height = keyListNodeHeight(keys.length)
  }

  if (isBitfieldNode(graphNode.key)) {
    const fields = parseBitfieldEntries(graphNode.data as Record<string, unknown> | undefined)
    const mode = String((graphNode.data as Record<string, unknown> | undefined)?.mode ?? '打包')
    syncBitfieldNodePorts(node, fields, mode)
    if (!node.controls['fields']) {
      node.addControl('fields', new BitfieldControl(fields, () => {}))
    }
    node.width = BITFIELD_NODE_WIDTH
    node.height = bitfieldNodeHeight(fields.length, mode)
  }

  if (isConcatNode(graphNode.key)) {
    const portCount = concatPortCount(graphNode.data as Record<string, unknown> | undefined)
    syncConcatNodePorts(node, portCount)
  }

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

export async function syncReteNodePositionsFromGraph(
  instance: Pick<ReteEditorInstance, 'area'>,
  graph: GraphEditorState,
  nodeIds: string[]
): Promise<void> {
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]))

  for (const id of nodeIds) {
    const graphNode = graphNodes.get(id)
    if (!graphNode) continue
    await instance.area.translate(id, graphNode.position)
  }
}

export async function syncReteNodeDataFromGraph(
  instance: Pick<ReteEditorInstance, 'editor' | 'area'>,
  graph: GraphEditorState,
  nodeIds: string[]
): Promise<void> {
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]))

  for (const id of nodeIds) {
    const graphNode = graphNodes.get(id)
    const reteNode = instance.editor.getNode(id)
    if (!graphNode || !reteNode) continue

    reteNode.data = { ...graphNode.data }
    const definition = getNodeDefinition(graphNode.key) ?? NODE_DEFINITIONS[graphNode.key]
    for (const control of definition.controls) {
      const inputControl = reteNode.controls[control.key]
      if (!(inputControl instanceof ClassicPreset.InputControl)) continue
      const value = graphNode.data[control.key]
      inputControl.value = control.type === 'number'
        ? Number(value ?? control.default ?? 0)
        : String(value ?? control.default ?? '')
    }
    await instance.area.update('node', id)
  }
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

    if (isKeyListNode(node.key)) {
      const initialKeys = parseKeyEntries(graphNode.data as Record<string, unknown> | undefined)
      if (node.controls['keys']) node.removeControl('keys')
      const handleKeysChange = (next: KeyEntry[]): void => {
        // 1) 更新内存 data
        node.data = { ...(node.data || {}), keys: next }
        // 1.5) 删除将失去端口的连接（removeInput 不自动清理连接）。
        // 仅对 transform-object（有 key_* 动态端口）生效；transform-namefields 无此类端口，此处为 no-op。
        const nextPortKeys = new Set(next.map((entry) => `key_${entry.id}`))
        instance.editor.getConnections()
          .filter((connection) => connection.target === String(node.id)
            && connection.targetInput.startsWith('key_')
            && !nextPortKeys.has(connection.targetInput))
          .forEach((connection) => { void instance.editor.removeConnection(connection.id) })
        // 2) 同步端口
        syncKeyListNodePorts(node, next)
        // 3) 重算高度
        node.height = keyListNodeHeight(next.length)
        // 4) 轻量刷新节点视图
        void instance.area.update('node', String(node.id))
        // 5) 通知上层持久化
        instance.options.onGraphChange?.({ type: 'node-data', id: node.id, key: 'keys', value: next })
      }
      node.addControl('keys', new KeyListControl(initialKeys, handleKeysChange))
      syncKeyListNodePorts(node, initialKeys)
      node.height = keyListNodeHeight(initialKeys.length)
    }

    if (isBitfieldNode(node.key)) {
      const initialFields = parseBitfieldEntries(graphNode.data as Record<string, unknown> | undefined)
      const initialMode = String(graphNode.data?.mode ?? '打包')
      if (node.controls['fields']) node.removeControl('fields')
      const applyFieldsChange = (next: BitfieldEntry[], mode: string): void => {
        // 1) 更新内存 data
        node.data = { ...(node.data || {}), fields: next }
        // 1.5) 清理将失去端口的连接（removeInput/removeOutput 不自动清理连接）
        const nextPortKeys = new Set(next.map((entry) => `field_${entry.id}`))
        instance.editor.getConnections()
          .filter((connection) =>
            (connection.target === String(node.id) || connection.source === String(node.id))
            && (connection.targetInput.startsWith('field_') || connection.sourceOutput.startsWith('field_'))
            && !nextPortKeys.has(connection.targetInput)
            && !nextPortKeys.has(connection.sourceOutput)
          )
          .forEach((connection) => { void instance.editor.removeConnection(connection.id) })
        // 2) 同步端口
        syncBitfieldNodePorts(node, next, mode)
        // 3) 重算尺寸（宽固定，高随字段数 + mode）
        node.width = BITFIELD_NODE_WIDTH
        node.height = bitfieldNodeHeight(next.length, mode)
        // 4) 轻量刷新
        void instance.area.update('node', String(node.id))
        // 5) 通知上层持久化
        instance.options.onGraphChange?.({ type: 'node-data', id: node.id, key: 'fields', value: next })
      }
      const handleFieldsChange = (next: BitfieldEntry[]): void => {
        const mode = String(node.data?.mode ?? '打包')
        applyFieldsChange(next, mode)
      }
      // mode 切换：拦截 mode control 的 data change，触发端口方向反转。
      // createClassicNodeFromDefinition 里 mode 是普通 select control，change 时只更新 data.mode；
      // 这里覆盖 onDataChange，额外同步端口。
      const baseOnDataChange = node.onDataChange
      node.onDataChange = (key: string, value: unknown) => {
        baseOnDataChange?.(key, value)
        if (key === 'mode') {
          const fields = parseBitfieldEntries(node.data as Record<string, unknown> | undefined)
          applyFieldsChange(fields, String(value ?? '打包'))
        }
      }
      node.addControl('fields', new BitfieldControl(initialFields, handleFieldsChange))
      syncBitfieldNodePorts(node, initialFields, initialMode)
      node.width = BITFIELD_NODE_WIDTH
      node.height = bitfieldNodeHeight(initialFields.length, initialMode)
    }

    if (isConcatNode(node.key)) {
      // 拼接节点无画布内控件（增减按钮在 NodeConfigPanel）；端口数由 data.ports 驱动。
      const portCount = concatPortCount(graphNode.data as Record<string, unknown> | undefined)
      syncConcatNodePorts(node, portCount)
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

  // 加固：import 完成后统一校准动态节点高度，防止任何路径漏算导致 ELK/排版读到过期高度。
  for (const node of instance.editor.getNodes()) {
    if (recalcDynamicNodeHeight(node)) {
      await instance.area.update('node', String(node.id))
    }
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
      node: () => ScriptClassicNode,
      control: (context) => {
        if (context.payload instanceof KeyListControl) {
          // Rete passes `{ data: payload }` to the control component, where
          // payload is typed as the generic ClassicPreset.Control. Our view
          // accepts `{ data: KeyListControl }` (KeyListControl extends Control).
          // Cast bridges the contravariant prop-shape mismatch.
          return KeyListControlView as unknown as ComponentType<{ data: ClassicPreset.Control }>
        }
        if (context.payload instanceof BitfieldControl) {
          return BitfieldControlView as unknown as ComponentType<{ data: ClassicPreset.Control }>
        }
        return null
      }
    }
  }))
  // 缩略图略放大、略宽：复杂协议横向节点流更易一眼看全。
  render.addPreset(ReactPresets.minimap.setup({ size: MINIMAP_SIZE }))
  // 正交折线：减少默认贝塞尔交叉/穿节点；回边走外绕。
  render.addPipe((context) => {
    if (context.type !== 'connectionpath') return context
    const points = context.data.points
    if (!points || points.length < 2) return context
    const start = points[0]
    const end = points[points.length - 1]
    return {
      ...context,
      data: {
        ...context.data,
        path: orthogonalConnectionPath(start, end)
      }
    }
  })
  arrange.addPreset(createOrderedArrangePreset((id) => options.getArrangeOrderIndex?.(id) ?? 0))

  // boundViewport 关闭：缩小时若把视口并进包围盒，节点会被压成几乎看不见，
  // 导航框铺满缩略图 → 用户看到「整块发灰且像失能」。飞出图外改由 pan restrictor 管。
  // ratio 必须为 1（rete-react-plugin 用宽度同时映射 X/Y）。
  const minimap = new MinimapPlugin<ScriptSchemes>({
    boundViewport: false,
    minDistance: MINIMAP_MIN_DISTANCE,
    ratio: MINIMAP_RATIO
  })

  editor.use(area)
  area.use(connection)
  area.use(render)
  area.use(arrange)
  area.use(minimap)

  const selector = AreaExtensions.selector()
  AreaExtensions.selectableNodes(area, selector, { accumulating: AreaExtensions.accumulateOnCtrl() })
  AreaExtensions.simpleNodesOrder(area)
  // 缩放 + 平移限幅：
  // - 缩放 min 按节点包围盒动态下调（大图可低于默认 50%，保证 fit 得下）
  // - 平移始终与节点包围盒「contain」约束，防止缩略图/空白处拖出界
  const collectNodeRects = () => [...area.nodeViews].map(([id, view]) => {
    const node = editor.getNode(id)
    return {
      x: view.position.x,
      y: view.position.y,
      width: node?.width || view.element.offsetWidth || 216,
      height: node?.height || view.element.offsetHeight || 120
    }
  })
  AreaExtensions.restrictor(area, {
    scaling: () => {
      const container = area.container
      const min = computeCanvasZoomMin(
        collectNodeRects(),
        { width: container.clientWidth, height: container.clientHeight }
      )
      return { min, max: CANVAS_ZOOM_MAX }
    },
    translation: () => {
      const k = area.area.transform.k
      const container = area.container
      return computeCanvasPanBounds(
        collectNodeRects(),
        { width: container.clientWidth, height: container.clientHeight },
        k
      )
    }
  })

  // 滚轮方向：Windows 惯例向前放大 / 向后缩小（与 Rete 默认一致，符号集中在 wheelZoomDelta）。
  // 只替换 wheel；pinch / dblclick 仍走 Zoom 父类。
  area.area.setZoomHandler(new WindowsWheelZoom(0.1))

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
    minimap,
    options,
    setAreaPanEnabled: (enabled: boolean) => { areaPanAllowed = enabled },
    destroy: () => area.destroy()
  }
}

/**
 * 画布滚轮 → Rete onzoom 的 delta。
 * Windows / 地图类惯例：向前（deltaY<0）放大，向后（deltaY>0）缩小。
 * 与 rete-area-plugin 默认 Zoom.wheel 一致；集中在此便于单测与 minimap 侧对齐。
 */
export function wheelZoomDelta(deltaY: number, intensity: number): number {
  return deltaY < 0 ? intensity : -intensity
}

/**
 * 画布滚轮缩放（Windows：向前放大 / 向后缩小）。
 * 在 super.initialize 前替换 wheel，避免重复绑定（destroy 只 remove 当前 this.wheel）。
 * pinch / dblclick 仍走父类逻辑。
 */
export class WindowsWheelZoom extends Zoom {
  initialize(
    container: HTMLElement,
    element: HTMLElement,
    onzoom: (delta: number, ox: number, oy: number, source?: 'wheel' | 'touch' | 'dblclick') => void
  ): void {
    this.wheel = (e: WheelEvent) => {
      e.preventDefault()
      const { left, top } = this.element.getBoundingClientRect()
      const delta = wheelZoomDelta(e.deltaY, this.intensity)
      const ox = (left - e.clientX) * delta
      const oy = (top - e.clientY) * delta
      this.onzoom(delta, ox, oy, 'wheel')
    }
    super.initialize(container, element, onzoom)
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

// ── 动态端口节点：半统一注册表 ──────────────────────────────────────
// 三类动态端口节点（对象/位域/拼接）共享「按 data 重算高度」的需求，
// 收敛到一个注册表，避免每加一类就复制 is*Node / *NodeHeight 四件套。
// 端口同步（syncXxxPorts）差异较大，保持各自独立函数。
// 未来做 DynamicPortSpec 描述符抽象时，这里是最先收口的入口。
interface DynamicNodeSpec {
  /** 属于该类的节点 key 集合 */
  keys: Set<string>
  /** 按节点 data 计算应有的节点高度 */
  height: (data: Record<string, unknown>) => number
}

function keyListNodeHeight(keyCount: number): number {
  const ports = Math.max(keyCount, 1)
  return Math.max(86, 58 + ports * 28 + 24)
}

function concatNodeHeight(portCount: number): number {
  const ports = Math.max(portCount, 1)
  return Math.max(86, 58 + ports * 28)
}

/**
 * 位域节点（protocol-bitfield）的估算高度。
 *
 * 关键点：位域字段同时贡献两处独立高度，旧公式只算一次导致排版溢出：
 *   1. 端口区 —— 解包模式 N 个 field_* 输出端口；打包模式 N 个 field_* 输入端口。
 *      端口行高 22px + 行间 gap 5px，端口区高度由 max(输入数, 输出数) 决定。
 *   2. BitfieldControl 控件 —— 每行字段（名称 + 位宽 input）约 26px + 4px gap，
 *      外加 footer（总位宽 + 添加按钮）约 24px，以及控件容器 margin/border/padding 约 20px。
 *
 * 公式按真实 DOM 结构拆开计高，并取 ceil + 少量安全余量（4px），确保不再偏小。
 * 非排版路径（import 后、首次排版前）以这个估算作兜底；真正排版时由
 * syncDynamicNodeSizeFromDom 用 DOM 真实高度覆盖。
 */
function bitfieldNodeHeight(fieldCount: number, mode: string): number {
  const fields = Math.max(fieldCount, 1)
  // 端口区：解包含静态 hex 输入 + N 个 field 输出；打包只有 N 个 field 输入。
  // 统一按 N 个端口估算（max(输入, 输出) 在两种模式下都 ≈ N）。
  const portRows = fields
  const portsHeight = portRows * 22 + Math.max(0, portRows - 1) * 5 // 端口行 + gap
  // 控件区：每字段一行 + footer + 容器开销
  const controlRowsHeight = fields * 26 + Math.max(0, fields - 1) * 4 // 字段行 + gap
  const footerHeight = 24
  const controlChrome = 20 // margin-top 8 + border-top + padding-top 8 ≈ 20
  // 基础区：padding 17 + title 27 + ports 上方无额外 margin（已含在 padding）
  const base = 58
  const total = base + portsHeight + controlChrome + controlRowsHeight + footerHeight + 4 // +4 安全余量
  void mode // 当前两种模式端口数对称，保留入参以便未来不对称时按 mode 分支
  return Math.max(86, Math.ceil(total))
}

const DYNAMIC_NODE_SPECS: DynamicNodeSpec[] = [
  // 对象（transform-object）/ 字段命名（transform-namefields）：高度随键数变化
  {
    keys: new Set(['transform-object', 'transform-namefields']),
    height: (d) => keyListNodeHeight(parseKeyEntries(d).length)
  },
  // 位域（protocol-bitfield）：高度随字段数 + mode 变化
  {
    keys: new Set(['protocol-bitfield']),
    height: (d) => bitfieldNodeHeight(parseBitfieldEntries(d).length, String(d.mode ?? '打包'))
  },
  // HEX拼接（protocol-concat）/ 字符串拼接（string-concat）/ 表达式（script-expr）：高度随端口数变化
  {
    keys: new Set(['protocol-concat', 'string-concat', 'script-expr']),
    height: (d) => concatNodeHeight(concatPortCount(d))
  }
]

function isKeyListNode(key: string | undefined): boolean {
  return !!key && DYNAMIC_NODE_SPECS[0].keys.has(key)
}

function isBitfieldNode(key: string | undefined): boolean {
  return !!key && DYNAMIC_NODE_SPECS[1].keys.has(key)
}

/** 是否为任意动态端口节点（用于排版前统一校准高度）。 */
export function isDynamicNode(key: string | undefined): boolean {
  return !!key && DYNAMIC_NODE_SPECS.some((spec) => spec.keys.has(key))
}

/**
 * 按节点当前 data 重新校准动态节点的 node.height。
 * 返回 true 表示高度有变化（调用方应 area.update 刷新视图）；false 表示无需刷新。
 * 用于：
 *   - 一键排版前（runArrangeLayout）：保证 ELK 读到正确高度，避免字段溢出
 *   - syncReteEditorFromGraph 末尾：防止 import 后任何路径漏算
 */
export function recalcDynamicNodeHeight(node: ScriptNode): boolean {
  const spec = DYNAMIC_NODE_SPECS.find((s) => s.keys.has(node.key || ''))
  if (!spec) return false
  const next = spec.height((node.data || {}) as Record<string, unknown>)
  if (node.height === next) return false
  node.height = next
  return true
}

/**
 * 排版前用 DOM 真实高度回写动态节点的 node.height。
 *
 * 估算公式（recalcDynamicNodeHeight）难免与真实 DOM 有几像素出入；ELK 用偏小的
 * node.height 算布局后，rete-area-plugin 的 resize 会在节点根 div 上写固定
 * el.style.height，覆盖 React 组件设的 minHeight，导致内容溢出容器框（位域字段
 * "挂"在节点下面）。排版前从 DOM 读真实高度回写 node.height，让 ELK 用真实尺寸
 * 布局，是这类溢出的根治手段。
 *
 * 选择器 `*:not(span):not([fragment])` 与 rete-area-plugin 的 resize 完全一致，
 * 命中 React 渲染的 .script-rete-node 根 div。getBoundingClientRect().height
 * 是 CSS 像素小数，比 offsetHeight 更贴近 ELK 实际需要的尺寸。
 *
 * 返回 true 表示高度有变化（调用方应 area.update 刷新视图）；false 表示无需刷新。
 * DOM 未就绪（视图未挂载/element 缺失）时回退到 recalcDynamicNodeHeight 公式兜底。
 */
export function syncDynamicNodeSizeFromDom(
  node: ScriptNode,
  area: { nodeViews: Map<string, { element: HTMLElement }> }
): boolean {
  if (!isDynamicNode(node.key)) return false
  const view = area.nodeViews.get(String(node.id))
  const root = view?.element?.querySelector('*:not(span):not([fragment])')
  // duck-type：真 HTML 元素才有 getBoundingClientRect。比 instanceof HTMLElement 更宽松
  // 但足以排除文本节点/注释节点，且不依赖浏览器全局，便于在 node 环境单测。
  if (root && typeof (root as { getBoundingClientRect?: unknown }).getBoundingClientRect === 'function') {
    const measured = Math.ceil((root as HTMLElement).getBoundingClientRect().height)
    // 只接受 DOM 撑开后（大于等于公式估算）的高度：DOM 渲染完时比公式准（根治溢出）。
    // DOM 测出偏小（React 组件还没完全渲染，如 import/向导应用后立即排版）时保留公式值做兜底，
    // 避免 node.height 被缩成最小 → 连线端口悬空。
    const spec = DYNAMIC_NODE_SPECS.find((s) => s.keys.has(node.key || ''))
    const estimated = spec ? spec.height((node.data || {}) as Record<string, unknown>) : node.height
    if (measured >= estimated && Math.abs(measured - node.height) > 1) {
      node.height = measured
      return true
    }
    // DOM 偏小或未就绪：用公式值兜底（若 node.height 当前偏小则修正）
    if (node.height < estimated) {
      node.height = estimated
      return true
    }
    return false
  }
  // DOM 尚未就绪（如 import 后未渲染）：回退到公式估算，保证 ELK 至少读到合理值。
  return recalcDynamicNodeHeight(node)
}

/**
 * 同步对象/字段命名节点（transform-object）的输入端口，使其与 keys 列表一致。
 * 仅 transform-object 会产生 key_* 动态输入端口；transform-namefields
 * 的输入是单个数组端口（由节点定义提供），不在此同步。
 * 可安全重复调用：补齐缺失端口、移除多余端口，不触碰控件。
 */
function syncKeyListNodePorts(node: ScriptNode, keys: KeyEntry[]): void {
  if (node.key !== 'transform-object') return
  const desiredInputs = resolveNodePorts(node.key, { keys }).inputs
  const desired = new Map(desiredInputs.map((port) => [port.key, port]))
  Object.keys(node.inputs).forEach((portKey) => {
    if (portKey.startsWith('key_') && !desired.has(portKey)) {
      node.removeInput(portKey as keyof ScriptNode['inputs'])
    }
  })
  for (const port of desired.values()) {
    if (!node.hasInput(port.key)) {
      node.addInput(port.key, new ClassicPreset.Input(socketInstances[port.socket], port.label, false))
    }
  }
}

/**
 * 同步位域节点（protocol-bitfield）的输入/输出端口，使其与 fields 列表 + mode 一致。
 * mode 决定端口方向：
 *   - 打包：fields → 输入端口（field_${id}）；解包模式遗留的 field_* 输出清掉
 *   - 解包：fields → 输出端口（field_${id}）；打包模式遗留的 field_* 输入清掉
 * 可安全重复调用：补齐缺失端口、移除多余端口，不触碰控件。
 */
function syncBitfieldNodePorts(node: ScriptNode, fields: BitfieldEntry[], mode: string): void {
  if (node.key !== 'protocol-bitfield') return
  const desired = resolveNodePorts(node.key, { fields, mode })
  const desiredInputs = new Map(desired.inputs.map((port) => [port.key, port]))
  const desiredOutputs = new Map(desired.outputs.map((port) => [port.key, port]))

  Object.keys(node.inputs).forEach((portKey) => {
    if ((portKey === 'hex' || portKey.startsWith('field_')) && !desiredInputs.has(portKey)) {
      node.removeInput(portKey as keyof ScriptNode['inputs'])
    }
  })
  Object.keys(node.outputs).forEach((portKey) => {
    if (portKey.startsWith('field_') && !desiredOutputs.has(portKey)) {
      node.removeOutput(portKey as keyof ScriptNode['outputs'])
    }
  })

  for (const port of desiredInputs.values()) {
    if (!node.hasInput(port.key)) {
      node.addInput(port.key, new ClassicPreset.Input(socketInstances[port.socket], port.label, false))
    }
  }
  for (const port of desiredOutputs.values()) {
    if (!node.hasOutput(port.key)) {
      node.addOutput(port.key, new ClassicPreset.Output(socketInstances[port.socket], port.label, true))
    }
  }
}

/**
 * 同步拼接节点（protocol-concat HEX拼接 / string-concat 字符串拼接）的输入端口，
 * 使其与 data.ports 一致。可安全重复调用：补齐缺失、移除多余，不触碰控件。
 */
function syncConcatNodePorts(node: ScriptNode, portCount: number): void {
  const key = node.key
  if (!key || !isConcatNode(key)) return
  const desiredInputs = resolveNodePorts(key, { ports: portCount }).inputs
  const desired = new Map(desiredInputs.map((port) => [port.key, port]))
  // 移除 desired 里没有的字母序 / in_ 序端口（保留静态定义的端口，但 concat 骨架无静态输入）
  Object.keys(node.inputs).forEach((portKey) => {
    if (!desired.has(portKey)) {
      node.removeInput(portKey as keyof ScriptNode['inputs'])
    }
  })
  for (const port of desired.values()) {
    if (!node.hasInput(port.key)) {
      node.addInput(port.key, new ClassicPreset.Input(socketInstances[port.socket], port.label, false))
    }
  }
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
  const definition = data.key ? (getNodeDefinition(data.key) ?? NODE_DEFINITIONS[data.key]) : null
  const controlSpecs = new Map(definition?.controls.map((control) => [control.key, control]) || [])
  const controls = sortEntries(data.controls).filter(([key]) => {
    if (key === 'keys' && isKeyListNode(data.key)) return true
    return controlSpecs.get(key)?.type !== 'select'
  })
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
      controls.map(([key, control]) => {
        if (!control) return null
        // 位域/键列表是多行编辑器，不要和普通单行 control 共用「62px 标签 + 输入」栅格，
        // 否则名称输入会被挤成两三个字符宽。
        const isFullControl = control instanceof BitfieldControl || control instanceof KeyListControl
        return createElement(
          'div',
          {
            className: isFullControl
              ? 'script-rete-node__control script-rete-node__control--full'
              : 'script-rete-node__control',
            'data-testid': `control-${key}`,
            key
          },
          createElement('span', null, controlLabels.get(key) || key),
          createElement(RefControl, {
            emit,
            name: 'control',
            payload: control
          })
        )
      })
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
