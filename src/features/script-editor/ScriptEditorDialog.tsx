import { useEffect, useMemo, useRef, useState } from 'react'
import type { SerialPanelSummary, SerialPortInfo } from '@shared/types'
import { getIPC } from '@/shared/ipc'
import { generateCodeFromRete } from '@/features/script-editor/codegen'
import {
  debugScriptNodeInteraction,
  describePointerInteractionEvent,
  installScriptNodeInteractionDebugBridge,
  isScriptNodeInteractionDebugEnabled
} from '@/features/script-editor/nodeInteraction'
import { buildScriptFile, parseScriptFile } from '@/features/script-editor/persistence'
import { useScriptEditorStore } from '@/features/script-editor/store'
import {
  closeConfig,
  closeSidePanel,
  createScriptEditorUiState,
  nextWindowMode,
  onNodeDeleted,
  onNodeDoubleClick,
  onSelectedNodeDeleted,
  onScriptRunStarted,
  openSidePanel,
  restoreFromMinimized,
  setCanvasTool,
  toggleScriptOutput,
  toggleSidePanel
} from '@/features/script-editor/uiState'
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  AUTO_SERIAL_PORT_REFRESH_INTERVAL_MS,
  clampCanvasZoom,
  getNextCanvasNodePosition,
  getNextPaletteNodePosition,
  groupNodesForPalette,
  nextDefaultScriptName,
  normalizeScriptName,
  type OverwriteSource
} from '@/features/script-editor/viewModel'
import {
  addGraphNode,
  createEmptyGraphState,
  duplicateGraphNode,
  exportGraphState,
  importGraphState,
  validateGraphState
} from '@/features/script-editor/rete/graphState'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'
import { CanvasToolBar } from '@/features/script-editor/components/CanvasToolBar'
import { GraphCanvas } from '@/features/script-editor/components/GraphCanvas'
import type { GraphCanvasHandle } from '@/features/script-editor/components/GraphCanvas'
import { NodeConfigPanel } from '@/features/script-editor/components/NodeConfigPanel'
import { NodePalette } from '@/features/script-editor/components/NodePalette'
import { ScriptEditorDrawer } from '@/features/script-editor/components/ScriptEditorDrawer'
import { ScriptEditorRail } from '@/features/script-editor/components/ScriptEditorRail'
import { ScriptEditorSidePanel } from '@/features/script-editor/components/ScriptEditorSidePanel'
import { ScriptList } from '@/features/script-editor/components/ScriptList'
import { ScriptOutputPanel } from '@/features/script-editor/components/ScriptOutputPanel'
import { Toolbar } from '@/features/script-editor/components/Toolbar'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { detectPlatform } from '@/features/titlebar'

interface ScriptEditorDialogProps {
  open: boolean
  isPopout?: boolean
  onClose: () => void
}

export function ScriptEditorDialog({ open, isPopout = false, onClose }: ScriptEditorDialogProps) {
  const groups = useMemo(() => groupNodesForPalette(), [])
  const activeScriptName = useScriptEditorStore((state) => state.activeScriptName)
  const runningScriptId = useScriptEditorStore((state) => state.runningScriptId)
  // 跟踪当前 runId 供 onLog 回调过滤；持续监听脚本运行期间 store 值会变化，闭包会过期。
  const runningScriptIdRef = useRef<string | null>(null)
  useEffect(() => { runningScriptIdRef.current = runningScriptId }, [runningScriptId])
  const outputLines = useScriptEditorStore((state) => state.outputLines)
  const setActiveScriptName = useScriptEditorStore((state) => state.setActiveScriptName)
  const setRunningScriptId = useScriptEditorStore((state) => state.setRunningScriptId)
  const appendOutputLine = useScriptEditorStore((state) => state.appendOutputLine)
  const clearOutput = useScriptEditorStore((state) => state.clearOutput)
  const [scripts, setScripts] = useState<string[]>([])
  const [loadingScripts, setLoadingScripts] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [graph, setGraph] = useState<GraphEditorState>(() => createEmptyGraphState())
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const singleSelectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
  const [legacyCode, setLegacyCode] = useState('')
  const [zoom, setZoom] = useState(1)
  const [minimapVisible, setMinimapVisible] = useState(true)
  const graphCanvasRef = useRef<GraphCanvasHandle | null>(null)
  const [uiState, setUiState] = useState(() => createScriptEditorUiState())
  const windowMode = uiState.windowMode
  const [activeGroupKey, setActiveGroupKey] = useState<string>(groups[0]?.key || 'input')
  const [serialPanels, setSerialPanels] = useState<SerialPanelSummary[]>([])
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([])
  const [refreshingPanels, setRefreshingPanels] = useState(false)
  const [refreshingPorts, setRefreshingPorts] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [createNameOpen, setCreateNameOpen] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ name: string; source: OverwriteSource } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const serialPanelOptions = useMemo(() => buildSerialPanelOptions(serialPanels), [serialPanels])
  const serialPortOptions = useMemo(() => buildSerialPortOptions(serialPorts, serialPanels), [serialPanels, serialPorts])

  useEffect(() => {
    if (!open) return
    void refreshScripts()
  }, [open])

  useEffect(() => {
    installScriptNodeInteractionDebugBridge()
    if (!open || !isScriptNodeInteractionDebugEnabled()) return

    const logPointerEvent = (event: MouseEvent | PointerEvent) => {
      debugScriptNodeInteraction(`document.${event.type}.capture`, describePointerInteractionEvent(event))
    }
    const eventTypes = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick'] as const
    console.info('[script-editor:event] installing document pointer probe', { eventTypes: [...eventTypes] })
    eventTypes.forEach((type) => document.addEventListener(type, logPointerEvent, true))
    debugScriptNodeInteraction('document.probe-installed', { eventTypes: [...eventTypes] })
    return () => eventTypes.forEach((type) => document.removeEventListener(type, logPointerEvent, true))
  }, [open])

  useEffect(() => {
    if (!open) return
    void refreshSerialPanels()
    window.addEventListener('saecom:serial-panels-changed', refreshSerialPanels)
    return () => window.removeEventListener('saecom:serial-panels-changed', refreshSerialPanels)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let refreshing = false
    const refresh = async () => {
      if (refreshing) return
      refreshing = true
      try {
        const ports = await getIPC().serial.list()
        if (!cancelled) setSerialPanels(readSerialPanelSummaries())
        if (!cancelled) setSerialPorts(ports)
      } catch {
        if (!cancelled) setSerialPorts([])
      } finally {
        refreshing = false
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, AUTO_SERIAL_PORT_REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const ipc = getIPC()
    // 实时日志：每行 console.log 触发即追加，不再等到脚本结束。
    const offLog = ipc.scripts.onLog((payload) => {
      if (payload.runId && payload.runId !== runningScriptIdRef.current) return
      appendOutputLine(payload.line)
    })
    return offLog
  }, [appendOutputLine, open])

  useEffect(() => {
    if (!open) return
    const ipc = getIPC()
    return ipc.scripts.onEnded((result) => {
      // 日志已通过 onLog 实时输出，这里只追加结束标记。
      appendOutputLine(result.ok ? '[完成]' : `[错误] ${result.error || '脚本运行失败'}`)
      setRunningScriptId(null)
    })
  }, [appendOutputLine, open, setRunningScriptId])

  async function refreshScripts() {
    setLoadingScripts(true)
    setScriptError(null)
    try {
      setScripts(await getIPC().scripts.list())
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingScripts(false)
    }
  }

  async function refreshSerialPanels() {
    setRefreshingPanels(true)
    try {
      setSerialPanels(readSerialPanelSummaries())
    } finally {
      setRefreshingPanels(false)
    }
  }

  async function refreshSerialPorts() {
    setRefreshingPorts(true)
    try {
      setSerialPanels(readSerialPanelSummaries())
      setSerialPorts(await getIPC().serial.list())
    } catch {
      setSerialPorts([])
    } finally {
      setRefreshingPorts(false)
    }
  }

  async function selectScript(name: string) {
    const content = await getIPC().scripts.read(name)
    const parsed = parseScriptFile(content)
    setActiveScriptName(name)
    setSelectedNodeIds([])
    setUiState(closeConfig)
    if (parsed.ok) {
      setGraph(importGraphState(parsed.graph))
      setLegacyCode(parsed.code)
    } else if (parsed.reason === 'invalid-json') {
      // 图形 JSON 损坏：不清空当前图（避免用户保存时空图覆盖原文件——数据丢失），
      // 仅置 scriptError + toast 提示。代码段仍按解析结果回填（persistence 已尽量提取）。
      const msg = `图形数据损坏：${parsed.error || 'JSON 解析失败'}`
      setScriptError(msg)
      toast.error(msg)
      setLegacyCode(parsed.code)
      window.requestAnimationFrame(() => graphCanvasRef.current?.fitView())
      return
    } else {
      // missing-markers：无图形标记的纯代码脚本，正常建空图 + 回填原始代码。
      setGraph(createEmptyGraphState())
      setLegacyCode(parsed.code)
    }
    // 下一帧再触发 fit-to-view：此时 graphRef 已指向新 graph，
    // GraphCanvas 会检测到签名未同步，延后到 Rete 同步完成后执行。
    window.requestAnimationFrame(() => graphCanvasRef.current?.fitView())
  }

  async function createScript() {
    // 新建：弹出命名对话框，默认值沿用 Script_N 自增逻辑
    setCreateNameOpen(true)
  }

  /**
   * 解析待写入的脚本名并执行（处理覆盖确认）。
   * - 目标名 == 当前活动脚本：直接写入（正常迭代保存）。
   * - 目标名在列表中已存在：先弹覆盖确认。
   * - 否则：直接写入。
   */
  async function resolveWrite(name: string) {
    if (name !== activeScriptName && scripts.includes(name)) {
      setConfirmOverwrite({ name, source: 'save' })
      return
    }
    await writeScriptAs(name)
  }

  async function writeScriptAs(name: string) {
    const graphExport = exportGraphState(graph)
    const generatedCode = graph.nodes.length > 0 ? generateCodeFromRete(graphExport) : legacyCode || generateCodeFromRete(graphExport)
    await getIPC().scripts.write(name, buildScriptFile(graphExport, generatedCode))
    setActiveScriptName(name)
    setLegacyCode(generatedCode)
    await refreshScripts()
  }

  /** 收集当前图形所有节点的校验错误（必填控件 + 按节点类型的配置校验）。空数组 = 有效。 */
  function collectGraphErrors(): string[] {
    const byNode = validateGraphState(graph)
    const errors: string[] = []
    for (const [, errs] of byNode) {
      for (const e of errs) if (e) errors.push(e)
    }
    return errors
  }

  async function saveScript() {
    // 图形存在未填项（必填控件/未选串口等）时拒绝保存，避免把无效图写入文件。
    const errors = collectGraphErrors()
    if (errors.length) {
      toast.error('图形存在未填项，请检查节点配置后保存', { description: errors.slice(0, 3).join('；') })
      return
    }
    // 无活动脚本名时弹「另存为」输入框（替代 Electron 渲染进程被禁用的 window.prompt）
    if (!activeScriptName) {
      setSaveAsOpen(true)
      return
    }
    await resolveWrite(activeScriptName)
  }

  async function deleteScript() {
    // 删除前先确认（对齐 PaneContextMenu 的删除确认）
    if (!activeScriptName) return
    setDeleteConfirmOpen(true)
  }

  async function execDelete() {
    if (!activeScriptName) return
    await getIPC().scripts.delete(activeScriptName)
    setActiveScriptName(null)
    setGraph(createEmptyGraphState())
    setLegacyCode('')
    setSelectedNodeIds([])
    setUiState(closeConfig)
    await refreshScripts()
  }

  /** 覆盖确认通过后：根据来源决定建空脚本（新建命名）或写入当前内容（保存/另存为）。 */
  async function execOverwrite() {
    const pending = confirmOverwrite
    setConfirmOverwrite(null)
    if (!pending) return
    // source 来自「新建命名」分支 → 建空脚本；否则来自「保存/另存为」→ 写入当前内容。
    // 不能用 createNameOpen 判断：PromptDialog 的 onConfirm 后会自动 close，
    // 到这里 createNameOpen 必为 false，所以用显式 source 区分。
    if (pending.source === 'create') {
      await createScriptNamed(pending.name)
      return
    }
    await writeScriptAs(pending.name)
  }

  /** 用给定名称创建一个空脚本并切换到它（沿用原 createScript 的写入/重置逻辑）。 */
  async function createScriptNamed(name: string) {
    const emptyGraph = createEmptyGraphState()
    await getIPC().scripts.write(name, buildScriptFile(exportGraphState(emptyGraph), generateCodeFromRete(exportGraphState(emptyGraph))))
    setActiveScriptName(name)
    setGraph(emptyGraph)
    setLegacyCode('')
    setSelectedNodeIds([])
    setUiState(closeConfig)
    await refreshScripts()
  }

  async function runScript() {
    // 图形存在未填项时拒绝运行（与保存一致），避免跑到无效配置。
    const errors = collectGraphErrors()
    if (errors.length) {
      toast.error('图形存在未填项，请检查节点配置后运行', { description: errors.slice(0, 3).join('；') })
      return
    }

    const panelId = currentPanelId(serialPanels)
    if (!panelId) {
      toast.warning('请先选择一个面板（在工作区点击面板）')
      return
    }

    clearOutput()
    appendOutputLine('[开始运行...]')
    setUiState(onScriptRunStarted)

    const graphExport = exportGraphState(graph)
    const generatedCode = graph.nodes.length > 0 ? generateCodeFromRete(graphExport) : legacyCode || generateCodeFromRete(graphExport)
    const run = await getIPC().scripts.run(generatedCode, { id: panelId })
    setRunningScriptId(run.runId)
  }

  async function stopScript() {
    if (!runningScriptId) return
    await getIPC().scripts.stop(runningScriptId)
    setRunningScriptId(null)
  }

  function addNode(
    key: string,
    position?: { x: number; y: number } | ((graph: GraphEditorState) => { x: number; y: number })
  ) {
    setGraph((current) => {
      const nodePosition = typeof position === 'function'
        ? position(current)
        : position || getNextCanvasNodePosition(current)
      const next = addGraphNode(current, key, nodePosition, undefined, { __panels: serialPanels })
      const newId = next.nodes[next.nodes.length - 1]?.id
      setSelectedNodeIds(newId ? [newId] : [])
      return next
    })
  }

  function duplicateNode(id: string) {
    setGraph((current) => {
      const next = duplicateGraphNode(current, id)
      const duplicated = next.nodes[next.nodes.length - 1]
      if (duplicated?.id !== id) setSelectedNodeIds(duplicated?.id ? [duplicated.id] : [])
      return next
    })
  }

  // 弹出窗 dock 回主窗：主窗收到 main 的 script-editor:dock 时由外层（脚本入口）
  // 通过 open prop 重新显示弹层。此处仅注册监听占位，确保 IPC 链路连通；
  // 主窗是否在收到 dock 时重开弹层，由外层挂载点决定（见集成 Task）。
  useEffect(() => {
    if (isPopout) return
    const ipc = getIPC()
    if (!ipc.scriptEditor?.onDock) return
    return ipc.scriptEditor.onDock(() => { /* 重新可见由外层 open 控制 */ })
  }, [isPopout])

  function handlePopout() {
    try {
      void getIPC().scriptEditor?.popout?.().then((res) => {
        if (res?.ok) onClose() // 弹出成功后隐藏内嵌弹层
      })
    } catch {
      /* web 预览无 ipc，静默 */
    }
  }

  function handleDock() {
    try {
      getIPC().scriptEditor?.requestDock?.()
    } catch {
      /* web 预览无 ipc，静默 */
    }
  }

  if (!open) return null

  const modeClass =
    isPopout ? ' is-popout'
    : windowMode === 'maximized' ? ' is-maximized'
    : windowMode === 'minimized' ? ' is-minimized'
    : ''
  const showBackdrop = !isPopout && windowMode !== 'minimized'
  const showMinimizedBar = !isPopout && windowMode === 'minimized'

  return (
    <>
    {showBackdrop ? (
      <div className="script-editor-backdrop" role="presentation" data-os={detectPlatform()}>
        {renderEditorBody(modeClass)}
      </div>
    ) : (
      <>
        {showMinimizedBar ? (
          <div className="script-editor-minimized-bar" role="presentation">
            <button
              type="button"
              className="script-editor-minimized-bar__restore"
              onClick={() => setUiState(restoreFromMinimized)}
            >
              <span className="script-editor-minimized-bar__title">脚本页 · {activeScriptName || '未选中'}</span>
              <span className="script-editor-minimized-bar__hint">点击还原</span>
            </button>
          </div>
        ) : null}
        {renderEditorBody(modeClass)}
      </>
    )}
    <PromptDialog
      open={saveAsOpen}
      onOpenChange={setSaveAsOpen}
      title="另存为脚本"
      description="请输入脚本名称"
      defaultValue={activeScriptName || ''}
      onConfirm={async (v) => {
        const name = normalizeScriptName(v)
        if (!name) {
          toast.warning('脚本名无效（不能为空或含非法字符）')
          return
        }
        await resolveWrite(name)
      }}
    />

    <PromptDialog
      open={createNameOpen}
      onOpenChange={setCreateNameOpen}
      title="新建脚本"
      description="请输入脚本名称"
      defaultValue={nextDefaultScriptName(scripts)}
      onConfirm={async (v) => {
        const name = normalizeScriptName(v)
        if (!name) {
          toast.warning('脚本名无效（不能为空或含非法字符）')
          return
        }
        if (scripts.includes(name)) {
          // 名称已存在 → 走覆盖确认；确认后在 execOverwrite 里建空脚本
          setConfirmOverwrite({ name, source: 'create' })
          return
        }
        await createScriptNamed(name)
      }}
    />

    <AlertDialog
      open={!!confirmOverwrite}
      onOpenChange={(open) => {
        if (open) return
        // 取消覆盖：新建命名来源时回到命名对话框，便于改名重试；其它来源仅关闭。
        const source = confirmOverwrite?.source
        setConfirmOverwrite(null)
        if (source === 'create') setCreateNameOpen(true)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>覆盖脚本</AlertDialogTitle>
          <AlertDialogDescription>
            脚本「{confirmOverwrite?.name}」已存在，确定覆盖吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execOverwrite}>覆盖</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除脚本</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除脚本「{activeScriptName}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execDelete}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )

  function renderEditorBody(modeClass: string) {
    return (
      <section className={`script-editor-dialog${modeClass}`} aria-label="脚本编辑器" role="dialog">
        <Toolbar
          activeScriptName={activeScriptName}
          running={Boolean(runningScriptId)}
          windowMode={windowMode}
          isPopout={isPopout}
          saveDisabled={!!scriptError}
          onNew={createScript}
          onSave={saveScript}
          onDelete={deleteScript}
          onRun={runScript}
          onStop={stopScript}
          onZoomIn={() => setZoom((value) => clampCanvasZoom(value + 0.1))}
          onZoomOut={() => setZoom((value) => clampCanvasZoom(value - 0.1))}
          onOpenScripts={() => setUiState((current) => openSidePanel(current, 'scripts'))}
          onToggleMaximize={() => setUiState(nextWindowMode)}
          onMinimize={() => setUiState((current) => nextWindowMode(current, 'minimize'))}
          onPopout={handlePopout}
          onDock={handleDock}
          onClose={onClose}
        />
        <div className="script-editor-workspace">
          <ScriptEditorRail
            sidePanel={uiState.sidePanel}
            outputExpanded={uiState.outputExpanded}
            onSelectPanel={(panel) => setUiState((current) => toggleSidePanel(current, panel))}
            onToggleOutput={() => setUiState(toggleScriptOutput)}
          />
          {uiState.sidePanel === 'components' ? (
            <ScriptEditorSidePanel title="组件库" subtitle="选择或拖拽组件到画布" onClose={() => setUiState(closeSidePanel)}>
              <NodePalette
                activeGroupKey={activeGroupKey}
                groups={groups}
                onAddNode={(key) => addNode(key, getNextPaletteNodePosition)}
                onSelectGroup={setActiveGroupKey}
              />
            </ScriptEditorSidePanel>
          ) : null}
          {uiState.sidePanel === 'scripts' ? (
            <ScriptEditorSidePanel title="脚本列表" subtitle="选择已保存脚本" onClose={() => setUiState(closeSidePanel)}>
              <ScriptList
                activeScriptName={activeScriptName}
                error={scriptError}
                loading={loadingScripts}
                scripts={scripts}
                onSelect={async (name) => {
                  await selectScript(name)
                  setUiState(closeSidePanel)
                }}
              />
            </ScriptEditorSidePanel>
          ) : null}
          <div className="script-editor-canvas-shell">
            <CanvasToolBar
              value={uiState.canvasTool}
              minimapVisible={minimapVisible}
              onChange={(tool) => setUiState((current) => setCanvasTool(current, tool))}
              onToggleMinimap={() => setMinimapVisible((value) => !value)}
            />
            <GraphCanvas
              ref={graphCanvasRef}
              graph={graph}
              selectedNodeIds={selectedNodeIds}
              tool={uiState.canvasTool}
              zoom={zoom}
              minimapVisible={minimapVisible}
              onZoomChange={(value) => setZoom(value)}
              onDeleteSelectedNodes={() => {
                setSelectedNodeIds([])
                setUiState(onSelectedNodeDeleted)
              }}
              onDropNode={addNode}
              onDuplicateNode={duplicateNode}
              onGraphChange={setGraph}
              onOpenNodes={() => setUiState((current) => openSidePanel(current, 'components'))}
              onResetView={() => graphCanvasRef.current?.fitView()}
              onNodeDoubleClick={(id) => {
                setSelectedNodeIds([id])
                setUiState(onNodeDoubleClick)
              }}
              onSelectNodes={setSelectedNodeIds}
            />
            <ScriptEditorDrawer
              open={uiState.configOpen}
              placement="right"
              subtitle="参数与输入连线"
              title="节点配置"
              onClose={() => setUiState(closeConfig)}
            >
              <NodeConfigPanel
                graph={graph}
                selectedNodeId={singleSelectedNodeId}
                selectedCount={selectedNodeIds.length}
                refreshingPanels={refreshingPanels}
                refreshingPorts={refreshingPorts}
                serialPanelOptions={serialPanelOptions}
                serialPortOptions={serialPortOptions}
                onDeleted={() => {
                  setSelectedNodeIds([])
                  setUiState(onNodeDeleted)
                }}
                onGraphChange={setGraph}
                onRefreshPanels={refreshSerialPanels}
                onRefreshPorts={refreshSerialPorts}
              />
            </ScriptEditorDrawer>
          </div>
        </div>
        <ScriptOutputPanel
          expanded={uiState.outputExpanded}
          lines={outputLines}
          onClear={clearOutput}
          onToggle={() => setUiState(toggleScriptOutput)}
        />
      </section>
    )
  }
}

function readSerialPanelSummaries(): SerialPanelSummary[] {
  const bridge = (window as Window & {
    getSerialPanelSummaries?: () => SerialPanelSummary[]
  }).getSerialPanelSummaries
  if (!bridge) return []
  try {
    return bridge()
  } catch {
    return []
  }
}

function currentPanelId(panels: SerialPanelSummary[]): string | null {
  return panels.find((panel) => panel.active)?.id || null
}
