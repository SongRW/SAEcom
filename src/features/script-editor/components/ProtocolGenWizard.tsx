/**
 * 协议生成向导 —— 会话式编排组件（pi agent 式可引导会话）。
 *
 * 挂载：ScriptEditorDialog 画布壳的最高优先级分支（customEditorOpen 之前）。
 * Props 仿 CustomComponentEditor：open / onOpenChange + onApplied(dsl)。
 *
 * 流程：
 * - 用户输入协议描述（手动文本 / 选模板）→ submitDoc
 * - docToDsl async generator 流式产出 DocToDslEvent → 转成 ProtocolGenEvent 写入 transcript
 * - 遇 branch_decision_needed → forkBranches + 对每分支跑 assemblyRoundTrip 往返裁决
 * - 遇 artifact_ready → recordArtifact + 对该 DSL 跑往返验证
 * - canApply 时「应用」按钮可用 → onApplied(dsl) → 父组件灌画布
 *
 * pi agent 要素：
 * - 三档介入：SteeringInput（steering/follow-up/abort）
 * - 会话树：BranchTree 侧栏
 * - 工具全可观测：NarrativeStream + ToolLogFold
 * - 统一中止：AbortController（submitDoc 时新建，abort 时 .abort()）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Sparkle, Lightning, Brain, CheckCircle, XCircle, UploadSimple, BookBookmark, PuzzlePiece } from '@phosphor-icons/react'
import { useProtocolGenSession } from '@/features/script-editor/protocol-gen/useProtocolGenSession'
import { useProtocolGenStore } from '@/features/script-editor/protocol-gen/protocolGenStore'
import { canApply } from '@/features/script-editor/protocol-gen/protocolGenEngine'
import { docToDsl, buildLlmParseMessages, isAsciiProtocolName, suggestAsciiProtocolName, type DocToDslEvent, type DocToDslOptions } from '@/features/script-editor/protocol-gen/docToDsl'
import { assemblyRoundTrip } from '@/features/script-editor/dsl/roundTrip'
import { PROTOCOL_TEMPLATES } from '@/features/script-editor/dsl/sampleDsl'
import { getIPC } from '@/shared/ipc'
import type { ProtocolDsl } from '@shared/protocol-dsl'
import type { ProtocolKnowledgeWritePayload } from '@shared/types'
import { NarrativeStream } from './protocol-gen/NarrativeStream'
import { BranchTree } from './protocol-gen/BranchTree'
import { SteeringInput } from './protocol-gen/SteeringInput'
import { CustomComponentEditor } from './CustomComponentEditor'
import { createEmptyDescriptor } from '@/features/script-editor/nodes/component/customComponentForm'

interface ProtocolGenWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 用户确认应用时回调，父组件负责 dslToGraph → importGraphState → replaceGraph。 */
  onApplied: (dsl: ProtocolDsl) => void
}

export function ProtocolGenWizard({ open, onOpenChange, onApplied }: ProtocolGenWizardProps) {
  const session = useProtocolGenSession()
  const [docText, setDocText] = useState('')
  const [busy, setBusy] = useState(false)
  const abortCtrlRef = useRef<AbortController | null>(null)
  const activeBranchId = useProtocolGenStore((s) => s.activeBranchId)
  const toolLogExpanded = useProtocolGenStore((s) => s.toolLogExpanded)
  const setActiveBranchId = useProtocolGenStore((s) => s.setActiveBranchId)
  // 二期：文档导入（<input type=file> + agent:parseDocument）、ASCII 协议名纠正、
  // 知识库写入、内嵌组件编辑器
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [writing, setWriting] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [componentEditorOpen, setComponentEditorOpen] = useState(false)
  const [componentNames, setComponentNames] = useState<string[]>([])
  // 新建模式空描述符：引用固定，避免重渲染产生新对象触发子表单重置
  const emptyDescriptorRef = useRef(createEmptyDescriptor())
  // LLM（二期-真模型）：深度模式流式解析（provider 配置在「设置 → AI 与 Agent」）
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const activeChatIdRef = useRef<string | null>(null)

  /** 把 DocToDslEvent 转成 session verb 调用。 */
  const consumeDocEvent = useCallback(
    (ev: DocToDslEvent) => {
      switch (ev.type) {
        case 'narrative': session.narrative(ev.text); break
        case 'tool_call': session.toolCall(ev.tool, ev.args); break
        case 'tool_result': session.toolResult(ev.tool, ev.result); break
        case 'field_detected': session.fieldDetected(ev.field); break
        case 'branch_decision_needed':
          session.branchDecisionNeeded(ev.reason, ev.interpretations.map((i) => i.label))
          session.forkBranches(ev.interpretations)
          break
        case 'artifact_ready': session.recordArtifact(ev.dsl); break
        case 'aborted': /* 由 abort verb 处理 */ break
      }
    },
    [session]
  )

  /** 对所有未验证分支跑往返验证。用 getState() 读最新分支，避免闭包陈旧。
   *  往返验证是稳定性核心闸门：组包侧执行 codegen 产出 → sendTCP 捕获帧 →
   *  splitFrame 拆包 → 字段值比对。不通过则阻止应用（真正的组包/拆包不对称暴露于此）。
   *  执行环境异常（new Function 抛错）时作为 advisory 警告但不阻止 —— 真正的不对称由 Vitest 锁定。 */
  const runValidationOnBranches = useCallback(
    async (signal: AbortSignal) => {
      session.enterValidation()
      // 用 getState 读最新 state（for-await 循环里的 transition 已写入 stateRef）
      const currentState = session.getState()
      const pending = currentState.branches.filter((b) => !b.verified && b.dsl)
      for (const branch of pending) {
        if (signal.aborted) return
        try {
          const result = await assemblyRoundTrip(branch.dsl!)
          if (signal.aborted) return
          session.recordValidation(branch.id, result)
        } catch (err) {
          // 执行环境异常（非字段不一致）：记 advisory 警告，不阻止应用
          session.narrative(`往返验证执行环境异常（${String(err).slice(0, 80)}），降级为 advisory。字段级不对称由 Vitest 锁定。`)
          session.recordValidation(branch.id, {
            ok: true,
            sentFrames: [],
            parsed: null,
            fieldChecks: [],
            errors: []
          })
          session.selectBranch(branch.id)
          setActiveBranchId(branch.id)
        }
      }
      // 重新读最新 state，选择第一个 verified 分支作为活动分支
      const afterState = session.getState()
      const verified = afterState.branches.filter((b) => b.verified)
      if (verified.length > 0) {
        const active = afterState.branches.find((b) => b.id === afterState.activeBranchId)
        if (!active || !active.verified) {
          session.selectBranch(verified[0].id)
          setActiveBranchId(verified[0].id)
        }
        session.markReady()
      }
    },
    [session, setActiveBranchId]
  )

  /**
   * 构造 llmCall（深度模式 + 当前 provider 已启用时）：走 agent:chat IPC，
   * 增量经 agent:chunk 实时显示「模型思考中…」流。provider 配置在「设置 → AI 与 Agent」。
   */
  const buildLlmCall = useCallback(async (): Promise<DocToDslOptions['llmCall']> => {
    const res = await getIPC().agent.getLlmSettings()
    const active = res.ok && res.settings
      ? res.settings.providers.find((p) => p.id === res.settings!.currentId && p.enabled)
      : undefined
    if (!active) return undefined
    return async (promptJson: string) => {
      const messages = JSON.parse(promptJson) as Array<{ role: 'system' | 'user'; content: string }>
      const id = `chat-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
      activeChatIdRef.current = id
      setStreamingText('')
      const unsubscribe = getIPC().agent.onChunk((chunk) => {
        if (chunk.id === id) setStreamingText((prev) => (prev ?? '') + chunk.delta)
      })
      try {
        const res = await getIPC().agent.chat({ id, messages })
        if (!res.ok) throw new Error(res.error ?? '模型调用失败')
        return res.text ?? ''
      } finally {
        unsubscribe()
        activeChatIdRef.current = null
        setStreamingText(null)
      }
    }
  }, [])

  /** 提交协议描述，启动解析 + 验证闭环。深度模式（thinkingLevel=deep）且模型已配置时先走 LLM。 */
  const handleSubmit = useCallback(async () => {
    if (!docText.trim() || busy) return
    setBusy(true)
    abortCtrlRef.current = new AbortController()
    const signal = abortCtrlRef.current.signal
    session.submitDoc(docText)
    try {
      const llmCall = session.thinkingLevel === 'deep' ? await buildLlmCall() : undefined
      if (session.thinkingLevel === 'deep' && !llmCall) {
        session.narrative('深度模式已启用但未配置模型，本次走启发式解析（「设置 → AI 与 Agent」配置 provider 后可调用真模型）。')
      }
      for await (const ev of docToDsl(docText, { signal, llmCall })) {
        if (signal.aborted) break
        consumeDocEvent(ev)
      }
      if (signal.aborted) return
      await runValidationOnBranches(signal)
    } catch (err) {
      session.narrative(`解析出错：${String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [docText, busy, session, consumeDocEvent, runValidationOnBranches, buildLlmCall])

  /** 选模板填充描述。 */
  const handleSelectTemplate = useCallback((dsl: ProtocolDsl) => {
    const desc = `采用模板：${dsl.name}。字段：${(dsl.fields || []).map((f) => f.name).join(', ')}。`
    setDocText(desc)
  }, [])

  /** 用户中止（同时中止主进程 in-flight chat）。 */
  const handleAbort = useCallback(() => {
    abortCtrlRef.current?.abort()
    if (activeChatIdRef.current) getIPC().agent.chatAbort(activeChatIdRef.current)
    session.abort()
    setBusy(false)
    setStreamingText(null)
  }, [session])

  /** 应用生成的 DSL 到画布。
   *  onApplied 内部会延迟到双 rAF 后 replaceGraph（先关向导让 GraphCanvas 挂载），
   *  所以这里立即关向导即可。 */
  const handleApply = useCallback(() => {
    if (!session.currentDsl) return
    const latest = session.getState()
    if (!canApply(latest)) {
      session.narrative('当前分支未通过往返验证，无法应用。请先选择已验证分支或重新生成。')
      return
    }
    try {
      onApplied(latest.currentDsl!)
      onOpenChange(false)
    } catch (e) {
      session.narrative(`应用出错：${(e as Error).message}`)
    }
  }, [session, onApplied, onOpenChange])

  // 同步 store 的 activeBranchId（初始化时）
  useEffect(() => {
    if (session.activeBranchId && session.activeBranchId !== activeBranchId) {
      setActiveBranchId(session.activeBranchId)
    }
  }, [session.activeBranchId, activeBranchId, setActiveBranchId])

  /** 文档导入：取文件 → agent:parseDocument（主进程按扩展名解析）→ 填入描述框。
   *  mock/浏览器下 getPath 为空 → 文本文件直接 file.text() 兜底。 */
  const handleImportDocument = useCallback(async (file: File) => {
    setImporting(true)
    try {
      const path = getIPC().file.getPath(file)
      if (path) {
        const result = await getIPC().agent.parseDocument(path)
        if (!result.ok) {
          session.narrative(`文档解析失败：${result.error}`)
          return
        }
        setDocText(result.text)
        session.narrative(`已导入文档（${result.text.length} 字符）`)
        return
      }
      // 浏览器/mock 预览：文本文件直接读，二进制提示不可用
      const isBinary = /\.(docx|xlsx|pdf)$/i.test(file.name)
      if (isBinary) {
        session.narrative('浏览器预览不支持 docx/xlsx/pdf，请在 Electron 中导入')
        return
      }
      const text = await file.text()
      setDocText(text)
      session.narrative(`已导入文本（${text.length} 字符）`)
    } catch (e) {
      session.narrative(`导入出错：${(e as Error).message}`)
    } finally {
      setImporting(false)
    }
  }, [session])

  /** 提交 ASCII 协议名（向导强制 ASCII：非 ASCII 名在 ready 前纠正）。
   *  建议按钮直接传 name，避免 setNameDraft 异步导致 handleRename 读到旧值。 */
  const handleRename = useCallback((draft?: string) => {
    const name = (draft ?? nameDraft ?? '').trim()
    if (!name) return
    if (!isAsciiProtocolName(name)) {
      session.narrative('协议名只能包含字母、数字和连字符（如 SimpleProtocol / TLV-DEVICE-INFO）')
      return
    }
    session.renameDsl(name)
    setNameDraft(null)
  }, [session, nameDraft])

  /** 写入协议知识库（FEAT + GOLD，走主进程 CLI）。 */
  const handleWriteKnowledge = useCallback(async () => {
    const latest = session.getState()
    if (!latest.currentDsl || !canApply(latest)) return
    const branch = latest.branches.find((b) => b.id === latest.activeBranchId)
    const result = branch?.validation?.result
    const dsl = latest.currentDsl
    const fields = dsl.fields ?? dsl.messages?.[0]?.fields ?? []
    const fieldTableMarkdown = [
      '| 字段 | 类型 | 说明 |',
      '|---|---|---|',
      ...fields.map((f) => `| ${f.name} | ${f.kind} | ${'value' in f && f.value ? String(f.value) : ''} |`)
    ].join('\n')
    const payload: ProtocolKnowledgeWritePayload = {
      name: dsl.name,
      title: dsl.title,
      fieldTableMarkdown,
      sampleFrameHex: result?.sentFrames?.[0] ?? '',
      expectedValues: Object.fromEntries((result?.fieldChecks ?? []).map((c) => [c.field, c.expected])),
      roundTripSummary: result?.ok
        ? `往返验证通过（${result.fieldChecks.length} 字段全部一致）`
        : '往返验证通过',
      dsl,
      createdFrom: latest.sessionId,
      createdAt: new Date().toISOString().slice(0, 10)
    }
    setWriting(true)
    try {
      const res = await getIPC().agent.writeKnowledge(payload)
      if (res.ok) {
        session.narrative(`已写入知识库：${res.featId} + ${res.goldId}`)
      } else {
        session.narrative(`知识库写入失败：${res.error}`)
      }
    } catch (e) {
      session.narrative(`知识库写入出错：${(e as Error).message}`)
    } finally {
      setWriting(false)
    }
  }, [session])

  /** 打开内嵌组件编辑器前刷新组件名列表（冲突检测用；list 返回文件名数组）。 */
  const handleOpenComponentEditor = useCallback(async () => {
    try {
      const names = await getIPC().customComponents.list()
      setComponentNames(names)
    } catch { /* 列表失败不阻塞编辑器打开 */ }
    setComponentEditorOpen(true)
  }, [])

  // 卸载清理
  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort()
    }
  }, [])

  if (!open) return null

  const phaseLabel: Record<string, string> = {
    idle: '待输入', parsing: '解析中', 'awaiting-confirm': '待确认',
    validating: '验证中', ready: '就绪', aborted: '已中止'
  }

  // 内嵌组件编辑器：整区替换向导会话视图（编辑器自带 ctxbar + 返回画布）。
  // onOpenChange(false) 即回到向导会话，不影响进行中的解析/验证状态。
  if (componentEditorOpen) {
    return (
      <CustomComponentEditor
        key="embedded-cc"
        editFileName={null}
        existingFileNames={componentNames}
        initialDescriptor={emptyDescriptorRef.current}
        open
        onMutated={async () => {
          try {
            const names = await getIPC().customComponents.list()
            setComponentNames(names)
          } catch { /* ignore */ }
        }}
        onOpenChange={setComponentEditorOpen}
      />
    )
  }

  return (
    <section className="protocol-gen-wizard" aria-label="协议生成向导" data-testid="protocol-gen-wizard">
      {/* 上下文条 */}
      <div className="protocol-gen-wizard__ctxbar" data-testid="protocol-gen-ctxbar">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="pg-back-canvas">
          <ArrowLeft weight="bold" />
          返回画布
        </Button>
        <span className="protocol-gen-wizard__ctx-title">协议生成向导</span>
        <Badge variant="secondary" data-testid="pg-phase-badge">{phaseLabel[session.phase] || session.phase}</Badge>
        {session.currentDsl && (
          <Badge variant="outline">{session.currentDsl.name}</Badge>
        )}
        {session.verifiedBranches.length > 0 && (
          <Badge variant="default" data-testid="pg-verified-badge">
            <CheckCircle size={11} weight="bold" />
            {session.verifiedBranches.length} 个验证通过
          </Badge>
        )}
        <span className="protocol-gen-wizard__ctx-spacer" />
        {/* 内嵌组件编辑器入口（二期：现场定义协议用自定义组件） */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleOpenComponentEditor()}
          title="现场定义协议需要的自定义组件（不影响当前会话）"
          data-testid="pg-define-component"
        >
          <PuzzlePiece size={14} weight="bold" />
          定义组件
        </Button>
        {/* thinking level 切换（pi agent Shift+Tab） */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => session.setThinkingLevel(session.thinkingLevel === 'fast' ? 'deep' : 'fast')}
          title="切换思考深度"
          data-testid="pg-thinking-level"
        >
          {session.thinkingLevel === 'fast' ? <Lightning size={14} weight="bold" /> : <Brain size={14} weight="bold" />}
          {session.thinkingLevel === 'fast' ? '快速' : '深度'}
        </Button>
        <Button
          size="sm"
          disabled={!session.canApply}
          onClick={handleApply}
          data-testid="pg-apply"
        >
          <Sparkle size={14} weight="bold" />
          应用到画布
        </Button>
      </div>

      <div className="protocol-gen-wizard__body">
        {/* 左侧：输入区 + 叙述流 + 介入 */}
        <div className="protocol-gen-wizard__main">
          {session.phase === 'idle' && (
            <div className="protocol-gen-wizard__input-section" data-testid="pg-input-section">
              <textarea
                className="protocol-gen-wizard__doc-input"
                value={docText}
                onChange={(e) => setDocText(e.target.value)}
                placeholder="粘贴协议描述、Markdown 字段表，或自然语言描述协议结构（帧头、字段、字节序、CRC）…"
                rows={8}
                data-testid="pg-doc-input"
              />
              <div className="protocol-gen-wizard__templates">
                <span className="protocol-gen-wizard__templates-label">或选模板：</span>
                {PROTOCOL_TEMPLATES.map((tmpl) => (
                  <Button
                    key={tmpl.key}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectTemplate(tmpl.dsl)}
                    data-testid={`pg-template-${tmpl.key}`}
                  >
                    {tmpl.label}
                  </Button>
                ))}
                {/* 文档导入：docx/xlsx/pdf/txt → 主进程解析填描述 */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx,.xlsx,.pdf,.txt,.md,.csv,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleImportDocument(file)
                    e.target.value = ''
                  }}
                  data-testid="pg-file-input"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importing}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="pg-import-doc"
                >
                  <UploadSimple size={14} weight="bold" />
                  {importing ? '导入中…' : '导入文档'}
                </Button>
              </div>
              <Button
                size="sm"
                disabled={!docText.trim() || busy}
                onClick={() => void handleSubmit()}
                data-testid="pg-submit"
              >
                <Sparkle size={14} weight="bold" />
                开始解析
              </Button>
            </div>
          )}

          <NarrativeStream
            transcript={session.transcript}
            toolLogExpanded={toolLogExpanded}
          />

          {/* 协议名纠正（二期）：产物存在时显示；非 ASCII 名强制纠正，中文仅作 title */}
          {session.currentDsl && (() => {
            // 建议基于「当前显示名」（可能是用户改了一半的中文草稿）：
            // 草稿非 ASCII 时按 DSL 结构给建议名（如 TLV-PROTOCOL / SIMPLE-PROTOCOL）。
            const currentName = nameDraft ?? session.currentDsl!.name
            const suggestedName = suggestAsciiProtocolName({ ...session.currentDsl!, name: currentName })
            return (
              <div className="protocol-gen-wizard__name-row" data-testid="pg-name-row">
                <span className="protocol-gen-wizard__sidebar-label">协议名</span>
                <input
                  className="protocol-gen-wizard__name-input"
                  value={currentName}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => { if (nameDraft !== null) handleRename() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
                  data-testid="pg-name-input"
                />
                {isAsciiProtocolName(currentName) ? (
                  <Badge variant="outline">ASCII</Badge>
                ) : (
                  <>
                    <Badge variant="destructive">名称需为 ASCII（字母/数字/连字符）</Badge>
                    {suggestedName && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNameDraft(suggestedName)
                          handleRename(suggestedName)
                        }}
                        data-testid="pg-name-suggest"
                      >
                        采用建议：{suggestedName}
                      </Button>
                    )}
                  </>
                )}
              </div>
            )
          })()}

          {/* ready 阶段：显著的操作确认条（避免用户不知道下一步该点哪里） */}
          {session.phase === 'ready' && session.canApply && (
            <div className="protocol-gen-wizard__ready-bar" data-testid="pg-ready-bar">
              <CheckCircle size={16} weight="bold" />
              <span className="protocol-gen-wizard__ready-text">
                往返验证通过，可应用到画布
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={writing}
                onClick={() => void handleWriteKnowledge()}
                data-testid="pg-write-knowledge"
              >
                <BookBookmark size={14} weight="bold" />
                {writing ? '写入中…' : '写入知识库'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => session.reset()}
                data-testid="pg-redo"
              >
                重新生成
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                data-testid="pg-ready-apply"
              >
                <Sparkle size={14} weight="bold" />
                应用到画布
              </Button>
            </div>
          )}

          {/* validating 阶段卡住（无 verified 分支）时：提示 + 重来入口 */}
          {session.phase === 'validating' && session.verifiedBranches.length === 0 && (
            <div className="protocol-gen-wizard__ready-bar protocol-gen-wizard__ready-bar--fail" data-testid="pg-stuck-bar">
              <XCircle size={16} weight="bold" />
              <span className="protocol-gen-wizard__ready-text">
                往返验证未通过，无法自动应用
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => session.reset()}
                data-testid="pg-redo"
              >
                重新生成
              </Button>
            </div>
          )}

          <SteeringInput
            onSteer={session.steer}
            onFollowUp={session.followUp}
            onAbort={handleAbort}
            disabled={session.phase === 'idle' || session.phase === 'aborted' || session.phase === 'ready'}
          />
        </div>

        {/* 右侧：分叉树 */}
        <div className="protocol-gen-wizard__sidebar">
          <BranchTree
            branches={session.branches}
            activeBranchId={session.activeBranchId ?? activeBranchId}
            onSelect={(id) => {
              session.selectBranch(id)
              setActiveBranchId(id)
            }}
          />
          {session.currentDsl && session.activeBranchId && (
            <div className="protocol-gen-wizard__current-branch">
              <span className="protocol-gen-wizard__sidebar-label">当前分支 DSL</span>
              <pre className="protocol-gen-wizard__dsl-preview" data-testid="pg-dsl-preview">
                {JSON.stringify(session.currentDsl, null, 2).slice(0, 800)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 深度模式流式指示（agent:chunk 实时增量） */}
      {streamingText !== null && (
        <div className="protocol-gen-wizard__llm-streaming" data-testid="pg-llm-streaming">
          <Brain size={13} weight="bold" />
          <span>模型思考中… {streamingText.slice(-160)}</span>
        </div>
      )}
    </section>
  )
}
