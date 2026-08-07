import {
  ArrowLeft,
  CaretDoubleRight,
  CaretDoubleLeft,
  Plus,
  Trash,
  X
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { CodeEditor } from '@/features/script-editor/components/CodeEditor'
import { GraphCanvas, type GraphCanvasHandle } from '@/features/script-editor/components/GraphCanvas'
import { NodePalette } from '@/features/script-editor/components/NodePalette'
import { ScriptEditorSidePanel } from '@/features/script-editor/components/ScriptEditorSidePanel'
import { groupNodesForPalette, getNextCanvasNodePosition, getNextPaletteNodePosition } from '@/features/script-editor/viewModel'
import { useGraphHistory } from '@/features/script-editor/useGraphHistory'
import { createEmptyGraphState, exportGraphState } from '@/features/script-editor/rete/graphState'
import { addGraphNode } from '@/features/script-editor/rete/graphState'
import type {
  CompositeComponentDescriptor,
  PortBinding
} from '@/features/script-editor/nodes/component/compositeComponent'
import {
  CompositeNodeComponent
} from '@/features/script-editor/nodes/component/compositeComponent'
import { normalizeReteGraph } from '@/features/script-editor/codegen/graph'
import type { EmitContext } from '@/features/script-editor/codegen/context'
import { NODE_CATEGORIES, nodeRegistry } from '@/features/script-editor/nodes/definitions'
import {
  loadAndRegisterCustomComponents
} from '@/features/script-editor/nodes/component/loadCustomComponents'
import {
  getAllSandboxApis
} from '@/features/script-editor/nodes/component/sandboxCatalog'
import {
  SANDBOX_API_DOCS
} from '@/features/script-editor/nodes/component/sandboxApiDocs'
import {
  UserNodeComponent,
  type UserComponentDescriptor,
  isValidUserComponentKey
} from '@/features/script-editor/nodes/component/userComponent'
import {
  validateCompositeDescriptor,
  validateUserDescriptor
} from '@/features/script-editor/nodes/component/validate'
import {
  cloneDescriptor,
  createEmptyDescriptor,
  mockControlValues,
  sandboxApisError,
  shouldResetForm
} from '@/features/script-editor/nodes/component/customComponentForm'
import { getIPC } from '@/shared/ipc'
import type {
  ControlSpec,
  ControlKind,
  NodeCategory,
  ReteGraphExport,
  ReteGraphNode,
  SocketKind,
  SocketSpec
} from '@shared/types'

const SOCKET_KINDS: SocketKind[] = ['dataSocket', 'boolSocket', 'flowSocket', 'triggerSocket']
const CONTROL_TYPES: ControlKind[] = ['text', 'number', 'select', 'boolean']

interface CustomComponentEditorProps {
  /**
   * 是否显示（画布壳内嵌视图，非 Dialog）。挂载时按 initialDescriptor 初始化表单。
   */
  open: boolean
  /** 编辑模式：传入文件名（含 .json）+ 已加载的 descriptor；create 模式均传 null。 */
  editFileName: string | null
  initialDescriptor: UserComponentDescriptor | null
  /** 已存在的文件名列表（用于重命名/冲突检测）。 */
  existingFileNames: string[]
  /** 关闭编辑器（返回画布）。保存成功后父组件负责刷新列表 + registry reload。 */
  onOpenChange: (open: boolean) => void
  /** 保存/删除/重命名成功后调用，触发父组件刷新列表 + registry reload。 */
  onMutated: () => void | Promise<void>
}

export function CustomComponentEditor({
  open,
  editFileName,
  initialDescriptor,
  existingFileNames,
  onOpenChange,
  onMutated
}: CustomComponentEditorProps) {
  const isEditMode = Boolean(editFileName)
  const [form, setForm] = useState<UserComponentDescriptor>(() => initialDescriptor ? cloneDescriptor(initialDescriptor) : createEmptyDescriptor())
  /** 右侧配置 drawer 展开/收起（画布壳内嵌，非弹窗）。 */
  const [configOpen, setConfigOpen] = useState(true)
  /** 沙箱 API 文档面板展开/收起 + 搜索。 */
  const [apiDocsOpen, setApiDocsOpen] = useState(false)
  const [apiDocSearch, setApiDocSearch] = useState('')
  /** 实现方式：emit 源码 | 组合连线（子画布，复用 GraphCanvas）。 */
  const [implMode, setImplMode] = useState<'emit' | 'compose'>('emit')
  /** 组合模式：独立的子图状态（本质就是个脚本，复用 useGraphHistory）。
   *  子图节点的添加/删除/连线/缩略图全部复用 GraphCanvas（画布逻辑零重复实现）。 */
  const subGraphHistory = useGraphHistory(createEmptyGraphState())
  const subGraph = subGraphHistory.graph
  const [subGraphRevision, setSubGraphRevision] = useState(0)
  const subGraphCanvasRef = useRef<GraphCanvasHandle | null>(null)
  /** 子图节点的端口绑定：每个节点可选「输入绑定（外部输入→本节点首输入）」「输出绑定（本节点首输出→外部输出）」。 */
  const [nodeInputBindings, setNodeInputBindings] = useState<Record<string, PortBinding | undefined>>({})
  const [nodeOutputBindings, setNodeOutputBindings] = useState<Record<string, PortBinding | undefined>>({})
  /** 子画布组件库侧栏（复用 NodePalette，开关由 GraphCanvas 右键「打开组件树」触发）。 */
  const subPaletteGroups = useMemo(() => groupNodesForPalette(), [])
  const [subPaletteOpen, setSubPaletteOpen] = useState(false)
  const [subActiveGroupKey, setSubActiveGroupKey] = useState<string>(subPaletteGroups[0]?.key || 'input')
  /** 派生 composite 草稿：subGraph（export）+ bindings（节点级 → PortBinding 数组）。 */
  const compositeDraft = useMemo<{
    subgraph: ReteGraphExport
    inputBindings: PortBinding[]
    outputBindings: PortBinding[]
  } | null>(() => {
    const exported = exportGraphState(subGraph)
    const inputBindings = Object.values(nodeInputBindings).filter((b): b is PortBinding => Boolean(b))
    const outputBindings = Object.values(nodeOutputBindings).filter((b): b is PortBinding => Boolean(b))
    return { subgraph: exported, inputBindings, outputBindings }
  }, [subGraph, nodeInputBindings, nodeOutputBindings])
  const filteredApiDocs = useMemo(() => {
    const q = apiDocSearch.trim().toLowerCase()
    if (!q) return SANDBOX_API_DOCS
    return SANDBOX_API_DOCS.filter((doc) =>
      doc.name.toLowerCase().includes(q) || doc.summary.toLowerCase().includes(q))
  }, [apiDocSearch])
  // 上一帧的 open / editFileName：仅在「打开边沿」或「切换编辑目标」时重置表单。
  // 不能依赖 initialDescriptor 的身份：create 模式下父层每次渲染都会产生新引用，
  // 若以此为依赖，父层 3 秒串口轮询重渲染会把用户输入清空（回归：P0）。
  const wasOpenRef = useRef(open)
  const prevEditFileNameRef = useRef(editFileName)

  useEffect(() => {
    if (shouldResetForm(open, wasOpenRef.current, editFileName, prevEditFileNameRef.current)) {
      setForm(initialDescriptor ? cloneDescriptor(initialDescriptor) : createEmptyDescriptor())
    }
    wasOpenRef.current = open
    prevEditFileNameRef.current = editFileName
    // initialDescriptor 仅在重置瞬间读取；不参与依赖，避免身份抖动触发重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editFileName])

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewCode, setPreviewCode] = useState('')

  // 实时校验（existingKeys = 内置 + 已加载用户）
  // 编辑模式：把自己的 key 从 existingKeys 拿掉，避免「冲突自身」误报
  //   注：按 key 排除不严谨（同名文件 key 可能改过），文件名冲突由下方 fileNameConflicts 兜底。
  const existingKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const c of nodeRegistry.all()) keys.add(c.key)
    if (isEditMode && form.key) keys.delete(form.key)
    return keys
  }, [isEditMode, form.key])

  // 判断当前编辑的 key 是否在磁盘已有同名文件（key.json）
  // 用 existingFileNames（文件名）做冲突检测——key 改了 → 新文件名可能冲突
  const targetFileName = `${form.key}.json`
  const fileNameConflicts = !isEditMode || targetFileName !== editFileName
    ? existingFileNames.includes(targetFileName)
    : false

  const validationResult = useMemo(
    () => validateUserDescriptor(form, [...existingKeys]),
    [form, existingKeys]
  )

  // 把诊断映射为 Monaco diagnostics（emit 字段相关 → 编辑器；其它 → 表单错误列表）
  const editorDiagnostics = useMemo<Array<{ message: string; severity: 'error' | 'warning' }>>(
    () => validationResult.errors
      .filter((e) => e.field === 'emit')
      .map((e) => ({ message: e.message, severity: e.severity === 'warning' ? 'warning' : 'error' })),
    [validationResult.errors]
  )

  const formErrors = useMemo(
    () => validationResult.errors.filter((e) => e.field !== 'emit'),
    [validationResult.errors]
  )

  // key 字段实时校验提示（独立于 validationResult，便于输入过程中显示）
  const keyFormatError = useMemo(() => {
    if (!form.key) return 'key 必填'
    if (!isValidUserComponentKey(form.key)) return "key 必须形如 'custom-xxx'（小写字母/数字/连字符）"
    if (existingKeys.has(form.key)) return `key '${form.key}' 已存在（内置或已注册）`
    if (fileNameConflicts) return `文件 ${targetFileName} 已存在，请改 key 或先重命名`
    return null
  }, [form.key, existingKeys, fileNameConflicts, targetFileName])

  function update<K extends keyof UserComponentDescriptor>(key: K, value: UserComponentDescriptor[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  // 端口/控件 CRUD（不可变更新）
  function updateInput(index: number, patch: Partial<SocketSpec>) {
    setForm((current) => ({
      ...current,
      inputs: current.inputs.map((it, i) => (i === index ? { ...it, ...patch } : it))
    }))
  }
  function addInput() {
    setForm((current) => ({
      ...current,
      inputs: [...current.inputs, { key: `in${current.inputs.length + 1}`, socket: 'dataSocket' }]
    }))
  }
  function removeInput(index: number) {
    setForm((current) => ({ ...current, inputs: current.inputs.filter((_, i) => i !== index) }))
  }
  function updateOutput(index: number, patch: Partial<SocketSpec>) {
    setForm((current) => ({
      ...current,
      outputs: current.outputs.map((it, i) => (i === index ? { ...it, ...patch } : it))
    }))
  }
  function addOutput() {
    setForm((current) => ({
      ...current,
      outputs: [...current.outputs, { key: `out${current.outputs.length + 1}`, socket: 'dataSocket' }]
    }))
  }
  function removeOutput(index: number) {
    setForm((current) => ({ ...current, outputs: current.outputs.filter((_, i) => i !== index) }))
  }
  function updateControl(index: number, patch: Partial<ControlSpec>) {
    setForm((current) => ({
      ...current,
      controls: current.controls.map((it, i) => (i === index ? { ...it, ...patch } : it))
    }))
  }
  function addControl() {
    setForm((current) => ({
      ...current,
      controls: [...current.controls, { key: `ctrl${current.controls.length + 1}`, type: 'text', label: '' }]
    }))
  }
  function removeControl(index: number) {
    setForm((current) => ({ ...current, controls: current.controls.filter((_, i) => i !== index) }))
  }

  // sandboxApis：逗号分隔 → 数组（防御：composite 等无此字段时为 undefined，兜底空数组）
  const sandboxApisText = (form.sandboxApis ?? []).join(', ')
  function updateSandboxApis(text: string) {
    const arr = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    update('sandboxApis', arr)
  }

  // 试编译：构造 UserNodeComponent（emit 模式）或 CompositeNodeComponent（组合模式）
  // 做一次 mock emit，把产出的代码展示在底部只读面板。
  function tryCompile() {
    // 组合模式：mock emitComposite 产出 IIFE 内联代码
    if (implMode === 'compose') {
      if (!compositeDraft || compositeDraft.subgraph.nodes.length === 0) {
        toast.error('组合子画布为空', { description: '请先添加节点并完成连线/绑定' })
        return
      }
      const compositeDescriptor: CompositeComponentDescriptor = {
        key: form.key || 'custom-preview-composite',
        name: form.name || '预览',
        description: form.description,
        category: form.category ?? 'custom',
        inputs: form.inputs,
        outputs: form.outputs,
        subgraph: compositeDraft.subgraph,
        inputBindings: compositeDraft.inputBindings,
        outputBindings: compositeDraft.outputBindings
      }
      try {
        const comp = new CompositeNodeComponent(compositeDescriptor)
        const mockNode: ReteGraphNode = { id: 'preview-composite', key: compositeDescriptor.key, data: {} }
        const ctx: EmitContext = {
          graph: normalizeReteGraph({ nodes: [mockNode], connections: [] }),
          registry: {},
          varMap: new Map(),
          processedNodes: new Set(),
          blockedNodes: new Set(),
          inListenerClosure: false,
          emitNode: () => ''
        }
        const code = comp.emit(ctx, mockNode, '  ')
        setPreviewCode(code)
        setPreviewOpen(true)
        toast.success('试编译通过（组合子图内联）')
      } catch (e) {
        toast.error(`试编译失败：${e instanceof Error ? e.message : String(e)}`)
      }
      return
    }

    const result = validateUserDescriptor(form, [...existingKeys])
    if (!result.ok || !result.descriptor) {
      toast.error('校验未通过，无法试编译', {
        description: result.errors.slice(0, 3).map((e) => e.message).join('\n')
      })
      return
    }
    try {
      const comp = new UserNodeComponent(result.descriptor)
      // mock ctx + node：emit 在编辑器进程执行，仅产出字符串，无副作用。
      // graph 必须用 normalizeReteGraph 构造（含 nodeMap/incomingByNode）：
      // helpers.getInputVar 依赖 incomingByNode 解析上游变量，裸 {nodes,connections}
      // 会让 `incomingByNode.get(...)` 抛 TypeError（回归：试编译对默认模板必失败）。
      const mockNode: ReteGraphNode = {
        id: 'preview-node',
        key: result.descriptor.key,
        data: mockControlValues(result.descriptor.controls)
      }
      const ctx: EmitContext = {
        graph: normalizeReteGraph({ nodes: [mockNode], connections: [] }),
        registry: {},
        varMap: new Map<string, string>(),
        processedNodes: new Set<string>(),
        blockedNodes: new Set<string>(),
        inListenerClosure: false,
        emitNode: () => ''
      }
      const code = comp.emit(ctx, mockNode, '  ')
      setPreviewCode(code)
      setPreviewOpen(true)
      const compileError = comp.getEmitCompileError()
      if (compileError) {
        toast.warning('emit 编译通过但运行有警告', { description: compileError })
      } else {
        toast.success('试编译通过')
      }
    } catch (e) {
      toast.error(`试编译失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleSave() {
    if (keyFormatError) {
      toast.error('key 不合法', { description: keyFormatError })
      return
    }

    const ipc = getIPC()
    // 组合模式：保存 composite 描述符（无 emit，逻辑在子图内）
    if (implMode === 'compose') {
      if (!compositeDraft || compositeDraft.subgraph.nodes.length === 0) {
        toast.error('组合子画布为空', { description: '请先添加至少一个节点并完成输入/输出绑定' })
        return
      }
      const compositeDescriptor: CompositeComponentDescriptor = {
        key: form.key,
        name: form.name,
        description: form.description,
        category: form.category ?? 'custom',
        inputs: form.inputs,
        outputs: form.outputs,
        subgraph: compositeDraft.subgraph,
        inputBindings: compositeDraft.inputBindings,
        outputBindings: compositeDraft.outputBindings
      }
      const cResult = validateCompositeDescriptor(compositeDescriptor, [...existingKeys])
      if (!cResult.ok) {
        toast.error('组合组件校验未通过', {
          description: cResult.errors.slice(0, 3).map((e) => e.message).join('\n')
        })
        return
      }
      const cName = `${compositeDescriptor.key}.json`
      if (isEditMode && cName !== editFileName && existingFileNames.includes(cName)) {
        toast.error(`目标文件 ${cName} 已存在，无法覆盖`)
        return
      }
      try {
        const writeRes = await ipc.customComponents.write(cName, JSON.stringify(compositeDescriptor, null, 2))
        if (!writeRes.ok) {
          toast.error(`保存失败：${writeRes.error || '未知错误'}`)
          return
        }
        if (isEditMode && cName !== editFileName && editFileName) {
          try { await ipc.customComponents.delete(editFileName) } catch { /* ignore */ }
        }
      } catch (e) {
        toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`)
        return
      }
      await loadAndRegisterCustomComponents()
      await onMutated()
      toast.success(`已保存：${cName}`)
      onOpenChange(false)
      return
    }

    const result = validateUserDescriptor(form, [...existingKeys])
    if (!result.ok || !result.descriptor) {
      toast.error('校验未通过，无法保存', {
        description: result.errors.slice(0, 3).map((e) => e.message).join('\n')
      })
      return
    }
    const descriptor = result.descriptor
    const newFileName = `${descriptor.key}.json`
    const content = JSON.stringify(descriptor, null, 2)

    // 编辑模式下 key 变更 → 文件名变更：若目标文件名已存在且非自身，提示冲突
    if (isEditMode && newFileName !== editFileName && existingFileNames.includes(newFileName)) {
      toast.error(`目标文件 ${newFileName} 已存在，无法覆盖`)
      return
    }

    try {
      const writeRes = await ipc.customComponents.write(newFileName, content)
      if (!writeRes.ok) {
        toast.error(`保存失败：${writeRes.error || '未知错误'}`)
        return
      }
      // 编辑模式下 key 变了（文件名也变了）→ 删除旧文件
      if (isEditMode && newFileName !== editFileName && editFileName) {
        try {
          await ipc.customComponents.delete(editFileName)
        } catch (e) {
          console.warn('[custom-components] 删除旧文件失败', e)
        }
      }
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`)
      return
    }

    await loadAndRegisterCustomComponents()
    await onMutated()
    toast.success(`已保存：${newFileName}`)
    onOpenChange(false)
  }

  return (
    <section
      className="custom-component-editor"
      aria-label={isEditMode ? `编辑组件：${form.name || editFileName}` : '新建 JS 组件'}
      data-testid="custom-component-editor"
    >
      {/* 上下文条：返回画布 / 标题 / 未保存点 / 试编译 / 保存 */}
      <div className="custom-component-editor__ctxbar">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="cc-back-canvas">
          <ArrowLeft weight="bold" />
          返回画布
        </Button>
        <span className="custom-component-editor__ctx-title">
          {/* 编辑模式显示组件名（form.name，如「转时间」），而非磁盘文件名 xxx.json */}
          {isEditMode ? `编辑组件：${form.name || editFileName}` : '新建 JS 组件'}
        </span>
        <span className="custom-component-editor__ctx-badge">{form.key}</span>
        <span className="custom-component-editor__ctx-unsaved">
          配置在右侧面板 · 与实现方式联动
        </span>
        <span className="custom-component-editor__ctx-spacer" />
        <Button variant="outline" size="sm" onClick={tryCompile} data-testid="cc-try-compile">
          试编译
        </Button>
        <Button
          size="sm"
          disabled={Boolean(keyFormatError) || !validationResult.ok}
          onClick={() => { void handleSave() }}
          data-testid="cc-save"
        >
          保存
        </Button>
      </div>

      <div className="custom-component-editor__body">
        {/* 主区：Monaco 编辑器 + 诊断（flex:1） */}
        <div className="custom-component-editor__code">
          <div className="custom-component-editor__code-header">
            {/* 实现方式切换：emit 源码 | 组合连线（子画布） */}
            <div className="custom-component-editor__seg" data-testid="cc-impl-seg">
              <button
                type="button"
                className={implMode === 'emit' ? 'is-active' : ''}
                onClick={() => setImplMode('emit')}
                data-testid="cc-mode-emit"
              >
                emit 源码
              </button>
              <button
                type="button"
                className={implMode === 'compose' ? 'is-active' : ''}
                onClick={() => setImplMode('compose')}
                data-testid="cc-mode-compose"
              >
                组合连线
              </button>
            </div>
            <button
              type="button"
              className="custom-component-editor__drawer-toggle"
              title={configOpen ? '收起配置' : '展开配置'}
              onClick={() => setConfigOpen((v) => !v)}
              data-testid="cc-toggle-config"
            >
              {configOpen ? <CaretDoubleRight /> : <CaretDoubleLeft />}
            </button>
          </div>
          {implMode === 'emit' ? (
            <CodeEditor
              diagnostics={editorDiagnostics}
              height="100%"
              language="javascript"
              onChange={(v) => update('emit', v)}
              value={form.emit}
            />
          ) : (
            /* 组合连线：复用现有 GraphCanvas（独立子图 state，本质就是个脚本）。
               节点添加/删除/连线/缩略图/排版全部复用画布逻辑，绑定在右侧 drawer 下拉。 */
            <div className="custom-component-editor__compose" data-testid="cc-compose-pane">
              {/* 组件库侧栏（复用 NodePalette，与主画布同款；右键画布「打开组件树」开关） */}
              {subPaletteOpen ? (
                <ScriptEditorSidePanel
                  title="组件库"
                  subtitle="选择组件添加到子画布"
                  onClose={() => setSubPaletteOpen(false)}
                >
                  <NodePalette
                    activeGroupKey={subActiveGroupKey}
                    groups={subPaletteGroups}
                    onAddNode={(key) => {
                      setSubGraphRevision((r) => r + 1)
                      subGraphHistory.setGraphCommit((current) =>
                        addGraphNode(current, key, getNextPaletteNodePosition(current), undefined, {}))
                    }}
                    onSelectGroup={setSubActiveGroupKey}
                  />
                </ScriptEditorSidePanel>
              ) : null}
              <GraphCanvas
                ref={subGraphCanvasRef}
                graph={subGraph}
                selectedNodeIds={[]}
                tool="select"
                zoom={1}
                graphRevision={subGraphRevision}
                minimapVisible
                onZoomChange={() => { /* 子画布 zoom 由 GraphCanvas 内部管理 */ }}
                onDeleteSelectedNodes={() => {}}
                onDeleteNodes={(next) => {
                  setSubGraphRevision((r) => r + 1)
                  subGraphHistory.setGraphCommit(() => next)
                }}
                onDropNode={(key, position) => {
                  setSubGraphRevision((r) => r + 1)
                  subGraphHistory.setGraphCommit((current) => {
                    const pos = typeof position === 'function' ? position(current) : position || getNextCanvasNodePosition(current)
                    return addGraphNode(current, key, pos, undefined, {})
                  })
                }}
                onDuplicateNode={(id) => {
                  setSubGraphRevision((r) => r + 1)
                  subGraphHistory.setGraphCommit((current) => {
                    // 复用主画布的 duplicateNode 简化：复制节点（无 connections）
                    const node = current.nodes.find((n) => n.id === id)
                    if (!node) return current
                    const newId = `n${Date.now()}`
                    return { ...current, nodes: [...current.nodes, { ...node, id: newId, position: { x: (node.position?.x ?? 0) + 40, y: (node.position?.y ?? 0) + 40 } }] }
                  })
                }}
                onGraphChange={subGraphHistory.setGraphTransient}
                onOpenNodes={() => setSubPaletteOpen((v) => !v)}
                onResetView={() => subGraphCanvasRef.current?.fitView()}
                onNodeDoubleClick={() => {}}
                onSelectNodes={() => {}}
              />
            </div>
          )}
          {formErrors.length > 0 ? (
            <ul className="custom-component-editor__errors">
              {formErrors.slice(0, 6).map((e, i) => (
                <li key={i} data-severity={e.severity}>
                  <span className="custom-component-editor__error-field">{e.field ?? ''}</span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* 右侧：可关闭配置 drawer（384px，收起到 0） */}
        <aside className={`custom-component-editor__drawer${configOpen ? '' : ' is-closed'}`} data-testid="cc-config-drawer">
          <div className="custom-component-editor__drawer-head">
            <span className="custom-component-editor__drawer-title">组件配置</span>
            <span className="custom-component-editor__drawer-sub">输入/输出端口 · 与实现方式联动</span>
            <button
              type="button"
              className="custom-component-editor__drawer-close"
              title="收起配置"
              onClick={() => setConfigOpen(false)}
            >
              <X />
            </button>
          </div>
          <div className="custom-component-editor__drawer-body">
            <FormField label="key（唯一标识）" error={keyFormatError ?? undefined}>
              <Input
                aria-invalid={Boolean(keyFormatError)}
                disabled={isEditMode}
                onChange={(e) => update('key', e.target.value)}
                placeholder="custom-my-component"
                value={form.key}
              />
              {isEditMode ? (
                <span className="custom-component-editor__hint">编辑模式下 key 不可修改（如需更改请新建）</span>
              ) : null}
            </FormField>

            <FormField label="显示名称">
              <Input
                onChange={(e) => update('name', e.target.value)}
                placeholder="例如：加前缀"
                value={form.name}
              />
            </FormField>

            <FormField label="描述（可选）">
              <Input
                onChange={(e) => update('description', e.target.value)}
                placeholder="组件用途说明"
                value={form.description ?? ''}
              />
            </FormField>

            <FormField label="分类">
              <Select
                onValueChange={(v) => update('category', v as NodeCategory)}
                value={form.category ?? 'custom'}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(NODE_CATEGORIES) as NodeCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {NODE_CATEGORIES[cat].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <PortsEditor
              title="输入端口"
              items={form.inputs}
              onAdd={addInput}
              onChange={updateInput}
              onRemove={removeInput}
            />
            <PortsEditor
              title="输出端口"
              items={form.outputs}
              onAdd={addOutput}
              onChange={updateOutput}
              onRemove={removeOutput}
            />

            <ControlsEditor
              controls={form.controls}
              onAdd={addControl}
              onChange={updateControl}
              onRemove={removeControl}
            />

            {/* 组合模式：子图节点的输入/输出端口绑定（stub→节点端口，复用画布后绑定回 drawer 下拉） */}
            {implMode === 'compose' && subGraph.nodes.length > 0 ? (
              <div className="custom-component-editor__section">
                <div className="custom-component-editor__section-header">
                  <span className="custom-component-editor__section-title">子图端口绑定</span>
                </div>
                <span className="custom-component-editor__hint">
                  为每个子图节点选择输入/输出绑定（对应外部输入/输出端口）
                </span>
                {subGraph.nodes.map((node) => (
                  <div key={node.id} className="custom-component-editor__binding-row">
                    <span className="custom-component-editor__binding-node">{node.label || node.key}</span>
                    <Select
                      value={nodeInputBindings[node.id]?.portKey ?? ''}
                      onValueChange={(v) => {
                        setNodeInputBindings((cur) => ({
                          ...cur,
                          [node.id]: v ? { portKey: v, nodeId: node.id, nodePortKey: 'in' } : undefined
                        }))
                      }}
                    >
                      <SelectTrigger className="custom-component-editor__binding-select" data-testid={`composite-in-${node.id}`}>
                        <SelectValue placeholder="输入绑定" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.inputs.map((p) => (
                          <SelectItem key={p.key} value={p.key}>外部 {p.key} → {node.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={nodeOutputBindings[node.id]?.portKey ?? ''}
                      onValueChange={(v) => {
                        setNodeOutputBindings((cur) => ({
                          ...cur,
                          [node.id]: v ? { portKey: v, nodeId: node.id, nodePortKey: 'out' } : undefined
                        }))
                      }}
                    >
                      <SelectTrigger className="custom-component-editor__binding-select" data-testid={`composite-out-${node.id}`}>
                        <SelectValue placeholder="输出绑定" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.outputs.map((p) => (
                          <SelectItem key={p.key} value={p.key}>{node.id} → 外部 {p.key}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            ) : null}

            <FormField
              label="sandboxApis（逗号分隔；emit 产出的代码可调用这些白名单 API）"
              error={sandboxApisError(form.sandboxApis)}
            >
              <Input
                onChange={(e) => updateSandboxApis(e.target.value)}
                placeholder="例如：send, sleep"
                value={sandboxApisText}
              />
              <span className="custom-component-editor__hint">
                {/* getAllSandboxApis 含插件运行时扩展 API；SANDBOX_API_CATALOG 仅内置。
                    用全量计数，让用户看到插件贡献的新 API 也声明可用。 */}
                可选 API：{getAllSandboxApis().slice(0, 8).join(', ')}……（共 {getAllSandboxApis().length} 个）
              </span>
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="custom-component-editor__api-docs-toggle"
                onClick={() => setApiDocsOpen((v) => !v)}
                data-testid="cc-toggle-api-docs"
              >
                {apiDocsOpen ? '收起 API 文档' : '查看 API 文档'}
              </Button>
            </FormField>

            {apiDocsOpen ? (
              <div className="custom-component-editor__api-docs" data-testid="cc-api-docs">
                <div className="custom-component-editor__api-docs-head">
                  <span>沙箱 API 文档</span>
                  <span className="custom-component-editor__api-docs-cnt">
                    {SANDBOX_API_DOCS.length} 个 · 与运行白名单一致
                  </span>
                </div>
                <input
                  className="custom-component-editor__api-docs-search"
                  placeholder="搜索 API…"
                  value={apiDocSearch}
                  onChange={(e) => setApiDocSearch(e.target.value)}
                />
                {filteredApiDocs.map((doc) => (
                  <details
                    key={doc.name}
                    className="custom-component-editor__api-doc"
                    data-testid={`cc-api-doc-${doc.name}`}
                  >
                    <summary>
                      <code>{doc.name}()</code>
                      <span>{doc.summary}</span>
                    </summary>
                    <div className="custom-component-editor__api-doc-body">
                      <pre className="custom-component-editor__api-doc-sig">{doc.signature}</pre>
                      {doc.params && doc.params.length > 0 ? (
                        <dl className="custom-component-editor__api-doc-params">
                          {doc.params.map((p) => (
                            <div key={p.name}>
                              <dt>{p.name}</dt>
                              <dd>{p.desc}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {doc.returns ? (
                        <p className="custom-component-editor__api-doc-returns">返回：{doc.returns}</p>
                      ) : null}
                      {doc.example ? (
                        <pre className="custom-component-editor__api-doc-example">{doc.example}</pre>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {/* 试编译结果：底部可折叠面板（替代弹窗） */}
      {previewOpen ? (
        <div className="custom-component-editor__preview" data-testid="cc-preview-panel">
          <div className="custom-component-editor__preview-head">
            <span className="custom-component-editor__preview-title">
              试编译结果{implMode === 'compose' ? '（组合子图内联 IIFE）' : '（mock emit 产出）'}
            </span>
            <span className="custom-component-editor__preview-ok">✓ 试编译通过</span>
            <span className="custom-component-editor__ctx-spacer" />
            <button
              type="button"
              className="custom-component-editor__drawer-close"
              title="关闭"
              onClick={() => setPreviewOpen(false)}
            >
              <X />
            </button>
          </div>
          <div className="custom-component-editor__preview-body">
            <CodeEditor
              height={220}
              language="javascript"
              onChange={() => undefined}
              readOnly
              value={previewCode}
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function FormField({
  label,
  error,
  hint,
  children
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="custom-component-editor__field">
      <Label>{label}</Label>
      {children}
      {error ? (
        <span className="custom-component-editor__error">{error}</span>
      ) : hint ? (
        <span className="custom-component-editor__hint">{hint}</span>
      ) : null}
    </div>
  )
}

function PortsEditor({
  title,
  items,
  onAdd,
  onChange,
  onRemove
}: {
  title: string
  items: SocketSpec[]
  onAdd: () => void
  onChange: (index: number, patch: Partial<SocketSpec>) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="custom-component-editor__section">
      <div className="custom-component-editor__section-header">
        <Label>{title}</Label>
        <Button onClick={onAdd} size="xs" variant="outline" type="button">
          <Plus /> 添加
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="custom-component-editor__hint">无</div>
      ) : (
        <div className="custom-component-editor__rows">
          {items.map((item, i) => (
            <div className="custom-component-editor__row" key={i}>
              <Input
                aria-label={`${title} key`}
                className="custom-component-editor__row-key"
                onChange={(e) => onChange(i, { key: e.target.value })}
                placeholder="key"
                value={item.key}
              />
              <Select
                onValueChange={(v) => onChange(i, { socket: v as SocketKind })}
                value={item.socket}
              >
                <SelectTrigger className="custom-component-editor__row-select" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOCKET_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={`${title} label`}
                className="custom-component-editor__row-label"
                onChange={(e) => onChange(i, { label: e.target.value })}
                placeholder="显示名（可选）"
                value={item.label ?? ''}
              />
              <Button
                aria-label={`删除${title}`}
                onClick={() => onRemove(i)}
                size="icon-sm"
                variant="ghost"
                type="button"
              >
                <Trash />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ControlsEditor({
  controls,
  onAdd,
  onChange,
  onRemove
}: {
  controls: ControlSpec[]
  onAdd: () => void
  onChange: (index: number, patch: Partial<ControlSpec>) => void
  onRemove: (index: number) => void
}) {
  return (
    <div className="custom-component-editor__section">
      <div className="custom-component-editor__section-header">
        <Label>控件（Controls）</Label>
        <Button onClick={onAdd} size="xs" variant="outline" type="button">
          <Plus /> 添加
        </Button>
      </div>
      {controls.length === 0 ? (
        <div className="custom-component-editor__hint">无</div>
      ) : (
        <div className="custom-component-editor__rows">
          {controls.map((ctrl, i) => (
            <div className="custom-component-editor__control-row" key={i}>
              <div className="custom-component-editor__row">
                <Input
                  aria-label="控件 key"
                  className="custom-component-editor__row-key"
                  onChange={(e) => onChange(i, { key: e.target.value })}
                  placeholder="key"
                  value={ctrl.key}
                />
                <Select
                  onValueChange={(v) => onChange(i, { type: v as ControlKind })}
                  value={ctrl.type}
                >
                  <SelectTrigger className="custom-component-editor__row-select" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTROL_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="控件 label"
                  className="custom-component-editor__row-label"
                  onChange={(e) => onChange(i, { label: e.target.value })}
                  placeholder="显示名"
                  value={ctrl.label}
                />
                <Button
                  aria-label="删除控件"
                  onClick={() => onRemove(i)}
                  size="icon-sm"
                  variant="ghost"
                  type="button"
                >
                  <Trash />
                </Button>
              </div>
              <div className="custom-component-editor__row">
                <Input
                  aria-label="控件默认值"
                  className="custom-component-editor__row-default"
                  onChange={(e) => onChange(i, { default: e.target.value })}
                  placeholder="默认值（可选）"
                  value={typeof ctrl.default === 'string' ? ctrl.default : ''}
                />
                {ctrl.type === 'select' ? (
                  <Input
                    aria-label="控件 options（逗号分隔）"
                    className="custom-component-editor__row-options"
                    onChange={(e) =>
                      onChange(i, {
                        options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                      })
                    }
                    placeholder="选项（逗号分隔）"
                    value={ctrl.options?.join(', ') ?? ''}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
