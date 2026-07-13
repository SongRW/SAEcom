import { ArrowsClockwise as RefreshCw } from '@phosphor-icons/react'
import type { ControlSpec, ReteGraphConnection } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { controlSupportsRefresh, type SelectOption } from '@/features/script-editor/viewModel'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'
import { isPanelConfigRef } from '@/features/script-editor/panelConfig'
import {
  connectGraphNodes,
  getCompatibleSources,
  removeGraphConnection,
  removeGraphNode,
  updateGraphNodeData,
  validateGraphNode
} from '@/features/script-editor/rete/graphState'
import { getNodeDefinition } from '@/features/script-editor/nodes/definitions'
import { usePanelsStore } from '@/features/serial-panel/store'
import { displayName } from '@/features/serial-panel/paneViewModel'

interface NodeConfigPanelProps {
  graph: GraphEditorState
  selectedNodeId: string | null
  selectedCount?: number
  refreshingPanels: boolean
  refreshingPorts: boolean
  serialPanelOptions: SelectOption[]
  serialPortOptions: SelectOption[]
  onGraphChange: (graph: GraphEditorState) => void
  onDeleted: () => void
  onRefreshPanels: () => void | Promise<void>
  onRefreshPorts: () => void | Promise<void>
}

export function NodeConfigPanel({
  graph,
  selectedNodeId,
  selectedCount,
  refreshingPanels,
  refreshingPorts,
  serialPanelOptions,
  serialPortOptions,
  onGraphChange,
  onDeleted,
  onRefreshPanels,
  onRefreshPorts
}: NodeConfigPanelProps) {
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) || null

  function updateControl(nodeId: string, key: string, value: string) {
    onGraphChange(updateGraphNodeData(graph, nodeId, key, value))
  }

  function connect(targetId: string, targetInput: string, value: string) {
    if (!value) return
    const [source, sourceOutput] = value.split('::')
    onGraphChange(connectGraphNodes(graph, { source, sourceOutput, target: targetId, targetInput }))
  }

  if (!selectedNode) {
    if (selectedCount && selectedCount > 1) {
      return <div className="script-editor-inspector__empty">已选 {selectedCount} 个节点（单选 1 个可编辑参数）</div>
    }
    return <div className="script-editor-inspector__empty">选择节点后配置参数与连线</div>
  }

  return (
    <div className="script-editor-inspector__content">
      <div className="script-editor-inspector__header">
        <div>
          <div className="script-editor-inspector__title">{selectedNode.label}</div>
          <div className="script-editor-inspector__key">{selectedNode.key}</div>
        </div>
        <Button
          variant="link"
          className="h-auto p-0 text-destructive"
          onClick={() => {
            onGraphChange(removeGraphNode(graph, selectedNode.id))
            onDeleted()
          }}
        >
          删除
        </Button>
      </div>

      <div className="script-editor-inspector__coords">
        <span>X {Math.round(selectedNode.position.x)}</span>
        <span>Y {Math.round(selectedNode.position.y)}</span>
      </div>
      <SerialStatusBadge node={selectedNode} serialPortOptions={serialPortOptions} />
      <Separator />
      <NodeControls
        node={selectedNode}
        serialPanelOptions={serialPanelOptions}
        serialPortOptions={serialPortOptions}
        refreshingPanels={refreshingPanels}
        refreshingPorts={refreshingPorts}
        onChange={updateControl}
        onRefreshPanels={onRefreshPanels}
        onRefreshPorts={onRefreshPorts}
      />
      <NodeConnections graph={graph} nodeId={selectedNode.id} onConnect={connect} onGraphChange={onGraphChange} />
    </div>
  )
}

function controlSectionTitle(nodeKey: string): string {
  return nodeKey === 'input-serial' || nodeKey === 'output-serial' ? '串口配置' : '参数'
}

// 串口状态条：在面板顶部醒目展示当前选中的串口端口 + 波特率。
// 仅 input-serial / output-serial 节点渲染。
function SerialStatusBadge({
  node,
  serialPortOptions
}: {
  node: GraphEditorState['nodes'][number]
  serialPortOptions: SelectOption[]
}) {
  const isSerial = node.key === 'input-serial' || node.key === 'output-serial'
  if (!isSerial) return null

  const portPath = String(node.data.portPath ?? '')
  const baudRate = node.data.baudRate ?? ''
  const option = serialPortOptions.find((item) => item.value === portPath)
  const selected = portPath && portPath !== '__current__'

  return (
    <div className="script-editor-serial-status" data-empty={!selected || undefined}>
      <span className="script-editor-serial-status__port">
        {selected ? (option?.label ?? portPath) : '未选择串口'}
      </span>
      {selected ? (
        <>
          <span className="script-editor-serial-status__sep">@</span>
          <span className="script-editor-serial-status__baud">{String(baudRate)}</span>
          <span className="script-editor-serial-status__unit">bps</span>
        </>
      ) : (
        <span className="script-editor-serial-status__hint">请在下方选择端口</span>
      )}
    </div>
  )
}

function NodeControls({
  node,
  serialPanelOptions,
  serialPortOptions,
  refreshingPanels,
  refreshingPorts,
  onChange,
  onRefreshPanels,
  onRefreshPorts
}: {
  node: GraphEditorState['nodes'][number]
  serialPanelOptions: SelectOption[]
  serialPortOptions: SelectOption[]
  refreshingPanels: boolean
  refreshingPorts: boolean
  onChange: (nodeId: string, key: string, value: string) => void
  onRefreshPanels: () => void | Promise<void>
  onRefreshPorts: () => void | Promise<void>
}) {
  const definition = getNodeDefinition(node.key)
  const errors = validateGraphNode(node)

  if (!definition || definition.controls.length === 0) {
    return <div className="script-editor-inspector__empty">此节点无参数</div>
  }

  const isSerial = node.key === 'input-serial' || node.key === 'output-serial'
  const configRef = node.data.configRef
  const usesFallback = isSerial && isPanelConfigRef(configRef) ? configRef.usesFallbackOptions : false

  return (
    <section className="script-editor-inspector__section">
      <div className="script-editor-inspector__section-title">{controlSectionTitle(node.key)}</div>
      {definition.controls.map((control) => {
        const invalid = errors.some((error) => error.startsWith(control.label))
        const showFallbackHint = usesFallback && control.key === 'baudRate'
        return (
          <div className="script-editor-field" data-invalid={invalid || undefined} key={control.key}>
            <Label>{control.label}</Label>
            {control.type === 'select' ? (
              <ControlSelect
                control={control}
                invalid={invalid}
                options={optionsForControl(control, serialPanelOptions, serialPortOptions)}
                refreshing={control.source === 'serial-panels' ? refreshingPanels : refreshingPorts}
                value={String(node.data[control.key] ?? control.default ?? '')}
                onChange={(value) => onChange(node.id, control.key, value)}
                onRefresh={refreshHandlerForControl(control, onRefreshPanels, onRefreshPorts)}
              />
            ) : (
              <Input
                aria-invalid={invalid || undefined}
                type={control.type === 'number' ? 'number' : 'text'}
                value={String(node.data[control.key] ?? '')}
                onChange={(event) => onChange(node.id, control.key, event.target.value)}
              />
            )}
            {showFallbackHint && (
              <span className="script-editor-field__hint">当前使用默认基础参数，修改后将固定为自定义值</span>
            )}
            {invalid && <span className="script-editor-field__error">{control.label}不能为空</span>}
          </div>
        )
      })}
    </section>
  )
}

function optionsForControl(
  control: ControlSpec,
  serialPanelOptions: SelectOption[],
  serialPortOptions: SelectOption[]
): SelectOption[] {
  if (control.source === 'modbus-panels') {
    // 无 prop 线程（ScriptEditorDialog/viewModel 暂不可改），直接读 store vanilla API。
    // 在非组件函数里用 getState() 而非 hook，避免破坏 hooks 规则；列表始终为最新。
    const { panels, listOrder } = usePanelsStore.getState()
    return listOrder
      .map((id) => panels[id])
      .filter((p) => p && p.type === 'modbus')
      .map((p) => ({ value: p.id, label: displayName(p) }))
  }
  if (control.source === 'serial-panels') return serialPanelOptions
  if (control.source === 'serial-ports') return serialPortOptions
  return (control.options || []).map((option) => ({ value: option, label: option }))
}

function ControlSelect({
  control,
  invalid,
  options,
  refreshing,
  value,
  onChange,
  onRefresh
}: {
  control: ControlSpec
  invalid: boolean
  options: SelectOption[]
  refreshing: boolean
  value: string
  onChange: (value: string) => void
  onRefresh?: () => void | Promise<void>
}) {
  const refreshable = controlSupportsRefresh(control.source) && !!onRefresh

  return (
    <>
      <div className={refreshable ? 'script-editor-field__select-row is-refreshable' : 'script-editor-field__select-row'}>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger aria-invalid={invalid || undefined} className="script-editor-field__select">
            <SelectValue placeholder={`选择${control.label}`} />
          </SelectTrigger>
          <SelectContent className="script-editor-select-content">
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="script-editor-select-option">{option.label}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {refreshable ? (
          <Button
            aria-label={`刷新${control.label}列表`}
            className="script-editor-field__refresh"
            disabled={refreshing}
            size="icon"
            title={`刷新${control.label}列表`}
            type="button"
            variant="outline"
            onClick={() => void onRefresh()}
          >
            <RefreshCw className={refreshing ? 'is-spinning' : undefined} />
          </Button>
        ) : null}
      </div>
      {control.source === 'serial-panels' && value === '__current__' && (
        <span className="script-editor-field__hint">运行时使用当前选中的项目面板</span>
      )}
      {control.source === 'serial-ports' && value === '__current__' && (
        <span className="script-editor-field__hint">运行时使用当前脚本上下文串口</span>
      )}
    </>
  )
}

function refreshHandlerForControl(
  control: ControlSpec,
  onRefreshPanels: () => void | Promise<void>,
  onRefreshPorts: () => void | Promise<void>
): (() => void | Promise<void>) | undefined {
  if (control.source === 'serial-panels') return onRefreshPanels
  if (control.source === 'serial-ports') return onRefreshPorts
  return undefined
}

function NodeConnections({
  graph,
  nodeId,
  onConnect,
  onGraphChange
}: {
  graph: GraphEditorState
  nodeId: string
  onConnect: (targetId: string, targetInput: string, value: string) => void
  onGraphChange: (graph: GraphEditorState) => void
}) {
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node || Object.keys(node.inputs).length === 0) {
    return <div className="script-editor-inspector__empty">此节点无输入连线</div>
  }

  return (
    <section className="script-editor-inspector__section">
      <div className="script-editor-inspector__section-title">输入连线</div>
      {Object.values(node.inputs).map((input) => {
        const current = graph.connections.find((connection) => (
          connection.target === node.id && connection.targetInput === input.key
        ))
        const options = getCompatibleSources(graph, node.id, input.key)
        return (
          <div className="script-editor-field" key={input.key}>
            <Label>{input.label}</Label>
            <Select
              value={current ? `${current.source}::${current.sourceOutput}` : ''}
              onValueChange={(value) => onConnect(node.id, input.key, value)}
            >
              <SelectTrigger><SelectValue placeholder="未连接" /></SelectTrigger>
              <SelectContent className="script-editor-select-content">
                {options.map((option) => (
                  <SelectItem key={`${option.nodeId}-${option.outputKey}`} value={`${option.nodeId}::${option.outputKey}`}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {current && (
              <Button
                variant="link"
                className="h-auto p-0 text-destructive"
                onClick={() => onGraphChange(removeGraphConnection(graph, connectionKey(current)))}
              >
                断开
              </Button>
            )}
          </div>
        )
      })}
    </section>
  )
}

function connectionKey(connection: ReteGraphConnection): string {
  return String(connection.id || `${connection.source}:${connection.sourceOutput}->${connection.target}:${connection.targetInput}`)
}
