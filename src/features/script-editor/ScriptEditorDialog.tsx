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
  setViewMode,
  toggleScriptOutput,
  toggleSidePanel
} from '@/features/script-editor/uiState'
import { useGraphHistory } from '@/features/script-editor/useGraphHistory'
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
  stripScriptExtension,
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
import { ScriptCodePanel } from '@/features/script-editor/components/ScriptCodePanel'
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
import { detectPlatform, TitleBarChrome } from '@/features/titlebar'

interface ScriptEditorDialogProps {
  open: boolean
  isPopout?: boolean
  /** 主窗：dock 回时由外层 BottomNav 传入的待恢复图快照（挂载时消费一次） */
  initialGraphPayload?: { graphStr: string; activeScriptName: string } | null
  /** 主窗：图快照被消费后清除外层待恢复态，避免下次打开误灌回旧图 */
  onConsumedPayload?: () => void
  onClose: () => void
}

export function ScriptEditorDialog({ open, isPopout = false, initialGraphPayload, onConsumedPayload, onClose }: ScriptEditorDialogProps) {
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const singleSelectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
  const [legacyCode, setLegacyCode] = useState('')
  const [zoom, setZoom] = useState(1)
  const [graphRevision, setGraphRevision] = useState(0)
  const [minimapVisible, setMinimapVisible] = useState(true)
  /** 输出是否已弹出独立窗：host 侧收起 dock 面板，日志仍 sync 过去。 */
  const [outputPoppedOut, setOutputPoppedOut] = useState(false)
  const graphCanvasRef = useRef<GraphCanvasHandle | null>(null)
  const {
    graph,
    setGraphCommit,
    setGraphReplace,
    setGraphTransient,
    undo,
    redo,
    canUndo,
    canRedo
  } = useGraphHistory(createEmptyGraphState())
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
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  // 本地 echo 模拟服务：null=未启动；启动后存 { id, port }，便于停止
  const [simulator, setSimulator] = useState<{ id: string; port: number } | null>(null)
  const serialPanelOptions = useMemo(() => buildSerialPanelOptions(serialPanels), [serialPanels])
  const serialPortOptions = useMemo(() => buildSerialPortOptions(serialPorts, serialPanels), [serialPanels, serialPorts])
  // 无流程图节点 + 有源码 → 纯代码视图（示例脚本/手写 JS）。
  // viewMode='canvas' 时强制显示空画布（用户从纯代码脚本切回去加节点）。
  const isPureCodeScript = graph.nodes.length === 0 && legacyCode.trim().length > 0
  const showCodeView = isPureCodeScript && uiState.viewMode !== 'canvas'

  // 编辑器关闭时停掉本地模拟服务，避免 TCP 端口泄漏
  useEffect(() => {
    if (open) return
    if (!simulator) return
    const id = simulator.id
    setSimulator(null)
    void getIPC().tcpServer.stop(id).catch(() => { /* ignore */ })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 撤销/重做快捷键：Ctrl+Z 撤销，Ctrl+Shift+Z / Ctrl+Y 重做
  // 焦点在 input/textarea（如节点配置输入框）时不拦截，避免影响文本编辑
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, undo, redo])

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

  // 输出弹出窗：host 持有日志，变更后 sync；弹出窗 clear/close 反向通知。
  useEffect(() => {
    if (!open) return
    const api = getIPC().scriptOutput
    if (!api) return
    const offClear = api.onClearRequest(() => {
      clearOutput()
    })
    const offClosed = api.onClosed(() => {
      setOutputPoppedOut(false)
    })
    return () => {
      offClear()
      offClosed()
    }
  }, [clearOutput, open])

  useEffect(() => {
    if (!open || !outputPoppedOut) return
    const api = getIPC().scriptOutput
    if (!api) return
    api.sync(outputLines, activeScriptName || '')
  }, [activeScriptName, open, outputLines, outputPoppedOut])

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

  function replaceGraph(next: GraphEditorState) {
    setGraphRevision((revision) => revision + 1)
    setGraphReplace(next)
  }

  async function selectScript(name: string) {
    const content = await getIPC().scripts.read(name)
    const parsed = parseScriptFile(content)
    setActiveScriptName(name)
    setSelectedNodeIds([])
    // 切脚本重置视图模式到 auto：按新内容自动决定显示源码还是画布。
    setUiState((current) => setViewMode(closeConfig(current), 'auto'))
    setScriptError(null)
    if (parsed.ok) {
      replaceGraph(importGraphState(parsed.graph))
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
      // missing-markers：无图形标记的纯代码脚本，建空图 + 回填源码；
      // 画布壳内会渲染 ScriptCodePanel，避免「打开了但什么都看不见」。
      replaceGraph(createEmptyGraphState())
      setLegacyCode(parsed.code)
      toast.message('已打开纯代码脚本', {
        description: '当前文件没有流程图，已切换到源码视图。连接并选中面板后可直接运行。'
      })
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
    try {
      const result = await getIPC().scripts.write(name, buildScriptFile(graphExport, generatedCode))
      if (!result.ok) {
        toast.error(`保存失败：${result.error || '未知错误'}`)
        return false
      }
    } catch (error) {
      toast.error(`保存失败：${error instanceof Error ? error.message : String(error)}`)
      return false
    }
    setActiveScriptName(name)
    setLegacyCode(generatedCode)
    await refreshScripts()
    toast.success(`已保存：${name}`)
    return true
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
    // 工具栏入口：作用于活动脚本（右键入口在 ScriptList 里直接 setDeleteTarget）
    if (!activeScriptName) return
    setDeleteTarget(activeScriptName)
  }

  async function execDelete() {
    const target = deleteTarget
    if (!target) return
    await getIPC().scripts.delete(target)
    // 仅当删的是活动脚本时才清空画布（删别的脚本不影响当前编辑）
    if (target === activeScriptName) {
      setActiveScriptName(null)
      replaceGraph(createEmptyGraphState())
      setLegacyCode('')
      setSelectedNodeIds([])
      setUiState(closeConfig)
    }
    setDeleteTarget(null)
    await refreshScripts()
  }

  function renameScript() {
    // 工具栏入口：作用于活动脚本（右键入口在 ScriptList 里直接 setRenameTarget）
    if (!activeScriptName) return
    setRenameTarget(activeScriptName)
  }

  async function execRename(newName: string) {
    // PromptDialog 的 onConfirm 会同步 close() → setRenameTarget(null)，故先捕获 oldName。
    const oldName = renameTarget
    if (!oldName) return
    if (newName === oldName) return
    const res = await getIPC().scripts.rename(oldName, newName)
    if (!res.ok) {
      toast.error(`重命名失败：${res.error || '未知错误'}`)
      return
    }
    // 重命名的是活动脚本 → 同步活动名（画布内容不变，下次保存写到新名）
    if (oldName === activeScriptName) setActiveScriptName(newName)
    await refreshScripts()
  }

  async function exportScript() {
    // 工具栏入口：作用于活动脚本（右键入口在 ScriptList 里直接调 exportScriptAs）
    if (!activeScriptName) return
    await exportScriptAs(activeScriptName)
  }

  async function importScript() {
    const result = await getIPC().scripts.importScript()
    if (!result.ok) {
      if (!result.canceled) toast.error(`导入失败：${result.error || '未知错误'}`)
      return
    }

    await refreshScripts()
    await selectScript(result.name)
    toast.success(`已导入：${result.name}`)
  }

  async function exportScriptAs(name: string) {
    const res = await getIPC().scripts.exportScript(name)
    if (res.ok) {
      toast.success(`已导出：${res.filePath}`)
    } else if (!res.canceled) {
      toast.error(`导出失败：${res.error || '未知错误'}`)
    }
    // 用户取消保存对话框 → 静默
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
    const content = buildScriptFile(exportGraphState(emptyGraph), generateCodeFromRete(exportGraphState(emptyGraph)))
    try {
      const result = await getIPC().scripts.write(name, content)
      if (!result.ok) {
        toast.error(`新建脚本失败：${result.error || '未知错误'}`)
        return
      }
    } catch (error) {
      toast.error(`新建脚本失败：${error instanceof Error ? error.message : String(error)}`)
      return
    }
    setActiveScriptName(name)
    replaceGraph(emptyGraph)
    setLegacyCode('')
    setSelectedNodeIds([])
    setUiState(closeConfig)
    await refreshScripts()
    toast.success(`已新建：${name}`)
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

  /** 切换本地 echo 模拟服务：启动（端口 0=系统分配）或停止。 */
  async function toggleSimulator() {
    if (simulator) {
      try { await getIPC().tcpServer.stop(simulator.id) } catch { /* ignore */ }
      setSimulator(null)
      return
    }
    const res = await getIPC().tcpServer.start(0, true)
    if (!res?.ok || !res.id || !res.port) {
      toast.error(`本地模拟启动失败：${res?.error || '未知错误'}`)
      return
    }
    setSimulator({ id: res.id, port: res.port })
    toast.success(`本地 echo 已启动：127.0.0.1:${res.port}`, {
      description: `把脚本里「接收TCP / 发送TCP」节点的主机填 127.0.0.1、端口填 ${res.port}，即可收发闭环自测。`
    })
  }

  function addNode(
    key: string,
    position?: { x: number; y: number } | ((graph: GraphEditorState) => { x: number; y: number })
  ) {
    setGraphCommit((current) => {
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
    setGraphCommit((current) => {
      const next = duplicateGraphNode(current, id)
      const duplicated = next.nodes[next.nodes.length - 1]
      if (duplicated?.id !== id) setSelectedNodeIds(duplicated?.id ? [duplicated.id] : [])
      return next
    })
  }

  // 图快照恢复（双向传图）：
  // - 主窗：dock 回后 BottomNav 把带回的图快照作为 initialGraphPayload 传入，挂载时灌回 graph。
  // - 弹窗：监听主进程 did-finish-load 回灌的 popout-payload（主窗弹出时带去的图）。
  // 二者都避免「弹窗/dock 回后画布是空图、缩略图/拖动失效」（问题2）。
  useEffect(() => {
    if (isPopout) {
      const ipc = getIPC()
      if (!ipc.scriptEditor?.onPopoutPayload) return
      return ipc.scriptEditor.onPopoutPayload((payload) => {
        applyGraphPayload(payload)
      })
    }
    // 主窗：消费外层传入的待恢复图快照（仅挂载/open 时一次）。
    if (!open || !initialGraphPayload) return
    applyGraphPayload(initialGraphPayload)
    onConsumedPayload?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPopout, open])

  /** 把图快照解析灌入 graph/activeScriptName 并 fit-to-view。损坏则忽略，保留当前图。 */
  function applyGraphPayload(payload: { graphStr?: string; activeScriptName?: string } | null) {
    if (!payload) return
    if (payload.graphStr) {
      try {
        const parsed = JSON.parse(payload.graphStr)
        replaceGraph(importGraphState(parsed))
      } catch {
        /* 图快照损坏：忽略 */
      }
    }
    if (payload.activeScriptName) setActiveScriptName(payload.activeScriptName)
    setSelectedNodeIds([])
    setUiState(closeConfig)
    window.requestAnimationFrame(() => graphCanvasRef.current?.fitView())
  }

  function handlePopout() {
    try {
      // 把当前图快照 + 活动脚本名一并带去弹窗（双向传图-去程），避免弹窗/dock 回后图丢失
      const graphStr = JSON.stringify(exportGraphState(graph))
      void getIPC().scriptEditor?.popout?.(graphStr, activeScriptName || '').then((res) => {
        if (res?.ok) onClose() // 弹出成功后隐藏内嵌弹层
      })
    } catch {
      /* web 预览无 ipc，静默 */
    }
  }

  function handleDock() {
    try {
      // dock 回主窗：把弹窗内最新图带回去（双向传图-回程）
      const graphStr = JSON.stringify(exportGraphState(graph))
      getIPC().scriptEditor?.requestDock?.(graphStr, activeScriptName || '')
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

    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除脚本</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除脚本「{deleteTarget}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execDelete}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <PromptDialog
      open={renameTarget !== null}
      onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
      title="重命名脚本"
      description="请输入新的脚本名称"
      defaultValue={renameTarget ? stripScriptExtension(renameTarget) : ''}
      onConfirm={async (v) => {
        const newName = normalizeScriptName(v)
        if (!newName) {
          toast.warning('脚本名无效（不能为空或含非法字符）')
          return
        }
        await execRename(newName)
      }}
    />
    </>
  )

  function renderEditorBody(modeClass: string) {
    return (
      <section className={`script-editor-dialog${modeClass}`} aria-label="脚本编辑器" role="dialog">
        {isPopout ? (
          <TitleBarChrome title={`脚本编辑器${activeScriptName ? ' · ' + activeScriptName : ''}`} />
        ) : null}
        <Toolbar
          activeScriptName={activeScriptName}
          running={Boolean(runningScriptId)}
          windowMode={windowMode}
          isPopout={isPopout}
          saveDisabled={!!scriptError}
          onNew={createScript}
          onSave={saveScript}
          onRename={renameScript}
          onImport={importScript}
          onExport={exportScript}
          onDelete={deleteScript}
          onRun={runScript}
          onStop={stopScript}
          simulator={simulator ? { port: simulator.port } : null}
          onToggleSimulator={() => { void toggleSimulator() }}
          onZoomIn={() => setZoom((value) => {
            const minZoom = graphCanvasRef.current?.getZoomMin()
            return clampCanvasZoom(value + 0.1, minZoom)
          })}
          onZoomOut={() => setZoom((value) => {
            const minZoom = graphCanvasRef.current?.getZoomMin()
            return clampCanvasZoom(value - 0.1, minZoom)
          })}
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
                onRename={(name) => setRenameTarget(name)}
                onDelete={(name) => setDeleteTarget(name)}
                onExport={(name) => { void exportScriptAs(name) }}
              />
            </ScriptEditorSidePanel>
          ) : null}
          <div className="script-editor-canvas-shell">
            {showCodeView ? (
              <ScriptCodePanel
                code={legacyCode}
                scriptName={activeScriptName}
                onChange={setLegacyCode}
                onShowCanvas={() => setUiState((current) => setViewMode(current, 'canvas'))}
              />
            ) : (
              <>
                <CanvasToolBar
                  value={uiState.canvasTool}
                  minimapVisible={minimapVisible}
                  onChange={(tool) => setUiState((current) => setCanvasTool(current, tool))}
                  onToggleMinimap={() => setMinimapVisible((value) => !value)}
                  onArrangeLayout={() => { void graphCanvasRef.current?.arrangeLayout() }}
                  hasLegacyCode={isPureCodeScript}
                  onShowCode={() => setUiState((current) => setViewMode(current, 'auto'))}
                />
                <GraphCanvas
                  ref={graphCanvasRef}
                  graph={graph}
                  selectedNodeIds={selectedNodeIds}
                  tool={uiState.canvasTool}
                  zoom={zoom}
                  graphRevision={graphRevision}
                  minimapVisible={minimapVisible}
                  onZoomChange={(value) => setZoom(value)}
                  onDeleteSelectedNodes={() => {
                    setSelectedNodeIds([])
                    setUiState(onSelectedNodeDeleted)
                  }}
                  onDropNode={addNode}
                  onDuplicateNode={duplicateNode}
                  onGraphChange={setGraphTransient}
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
                    onGraphChange={setGraphTransient}
                    onRefreshPanels={refreshSerialPanels}
                    onRefreshPorts={refreshSerialPorts}
                  />
                </ScriptEditorDrawer>
              </>
            )}
            {/* 底部输出 dock：叠在画布上，不占用 dialog 纵向 flex 高度。 */}
            <ScriptOutputPanel
              expanded={uiState.outputExpanded}
              lines={outputLines}
              poppedOut={outputPoppedOut}
              onClear={clearOutput}
              onPopout={() => {
                const api = getIPC().scriptOutput
                if (!api) {
                  toast.error('当前环境不支持弹出输出窗')
                  return
                }
                void api.popout(outputLines, activeScriptName || '').then((res) => {
                  if (res?.ok === false) {
                    toast.error(res.error || '弹出输出窗失败')
                    return
                  }
                  setOutputPoppedOut(true)
                  // 弹出后收起内嵌 dock，避免双份占屏
                  if (uiState.outputExpanded) setUiState(toggleScriptOutput)
                })
              }}
              onToggle={() => setUiState(toggleScriptOutput)}
            />
          </div>
        </div>
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
