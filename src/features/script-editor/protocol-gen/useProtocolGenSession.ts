/**
 * 协议生成会话 —— React stateful 绑定（仿 useGraphHistory.ts）。
 *
 * 持有 ProtocolGenState，暴露转移函数对应的 verbs。每次转移返回新 state
 * 触发重渲染（对齐 useGraphHistory 的 setPresent + tick 模式）。
 *
 * 与 useGraphHistory 的对应：
 * - present → state
 * - setGraphCommit/Replace/Transient → 各种 recordX/submitDoc/abort verbs
 * - tick → setState 即触发，transcript 变化自然重渲染
 *
 * 关键：verbs 用 useCallback，转移函数纯逻辑来自 protocolGenEngine.ts。
 */
import { useCallback, useRef, useState } from 'react'
import {
  createProtocolGenState,
  submitDoc,
  enqueueSteering,
  enqueueFollowUp,
  abortSession,
  drainSteering,
  drainFollowUp,
  recordNarrative,
  recordToolCall,
  recordToolResult,
  recordFieldDetected,
  recordBranchDecisionNeeded,
  forkBranches,
  selectBranch,
  recordValidation,
  recordArtifact,
  enterValidation,
  markReady,
  resetSession,
  setThinkingLevel,
  renameDsl,
  canApply,
  verifiedBranches,
  type ProtocolGenState,
  type ProtocolGenPhase,
  type ThinkingLevel,
  type QueuedMessage
} from './protocolGenEngine'
import type { ProtocolDsl, ProtocolField } from '@shared/protocol-dsl'
import type { RoundTripResult } from '@/features/script-editor/dsl/roundTrip'

export function useProtocolGenSession() {
  const [state, setState] = useState<ProtocolGenState>(() => createProtocolGenState())
  /** 始终指向最新 state 的 ref（供 async 流程在 transition 后读取最新值，绕过闭包陈旧）。 */
  const stateRef = useRef<ProtocolGenState>(state)
  stateRef.current = state
  /** 中止信号（pi agent 统一 AbortSignal 的 React 侧载体）。每次 submitDoc 新建。 */
  const abortRef = useRef<AbortController | null>(null)

  const transition = useCallback(
    (fn: (prev: ProtocolGenState) => ProtocolGenState) => {
      // 同步更新 stateRef（绕过 setState 的异步批处理），让同一 tick 内后续的
      // getState() 能读到最新值。setState 仍负责触发 React 重渲染。
      // 注意：fn 必须是纯函数（输入 state → 输出 state），这里对 stateRef.current
      // 调用是幂等的——setState 的 updater 会对 React 的 prev 再调一次 fn，结果一致。
      stateRef.current = fn(stateRef.current)
      setState(stateRef.current)
    },
    []
  )

  /** 读取最新 state（绕过闭包陈旧，供 async 流程在多次 transition 后取当前值）。 */
  const getState = useCallback(() => stateRef.current, [])

  const handleSubmitDoc = useCallback(
    (docText: string) => {
      abortRef.current = new AbortController()
      transition((prev) => submitDoc(prev, docText))
    },
    [transition]
  )

  const handleSteer = useCallback(
    (text: string) => transition((prev) => enqueueSteering(prev, text)),
    [transition]
  )

  const handleFollowUp = useCallback(
    (text: string) => transition((prev) => enqueueFollowUp(prev, text)),
    [transition]
  )

  const handleAbort = useCallback(() => {
    abortRef.current?.abort()
    transition((prev) => abortSession(prev))
  }, [transition])

  const handleDrainSteering = useCallback(():
    | { drained: QueuedMessage[] }
    | null => {
    let drained: QueuedMessage[] = []
    setState((prev) => {
      const { state: next, messages } = drainSteering(prev)
      drained = messages
      return next
    })
    return drained.length > 0 ? { drained } : null
  }, [])

  const handleDrainFollowUp = useCallback(():
    | { drained: QueuedMessage[] }
    | null => {
    let drained: QueuedMessage[] = []
    setState((prev) => {
      const { state: next, messages } = drainFollowUp(prev)
      drained = messages
      return next
    })
    return drained.length > 0 ? { drained } : null
  }, [])

  const handleNarrative = useCallback(
    (text: string) => transition((prev) => recordNarrative(prev, text)),
    [transition]
  )

  const handleToolCall = useCallback(
    (tool: string, args: unknown) => transition((prev) => recordToolCall(prev, tool, args)),
    [transition]
  )

  const handleToolResult = useCallback(
    (tool: string, result: unknown) => transition((prev) => recordToolResult(prev, tool, result)),
    [transition]
  )

  const handleFieldDetected = useCallback(
    (field: ProtocolField) => transition((prev) => recordFieldDetected(prev, field)),
    [transition]
  )

  const handleBranchDecisionNeeded = useCallback(
    (reason: string, options: string[]) =>
      transition((prev) => recordBranchDecisionNeeded(prev, reason, options)),
    [transition]
  )

  const handleForkBranches = useCallback(
    (interpretations: Array<{ label: string; dsl: ProtocolDsl }>) =>
      transition((prev) => forkBranches(prev, interpretations)),
    [transition]
  )

  const handleSelectBranch = useCallback(
    (branchId: string) => transition((prev) => selectBranch(prev, branchId)),
    [transition]
  )

  const handleRecordValidation = useCallback(
    (branchId: string, result: RoundTripResult) =>
      transition((prev) => recordValidation(prev, branchId, result)),
    [transition]
  )

  const handleRecordArtifact = useCallback(
    (dsl: ProtocolDsl) => transition((prev) => recordArtifact(prev, dsl)),
    [transition]
  )

  const handleEnterValidation = useCallback(
    () => transition((prev) => enterValidation(prev)),
    [transition]
  )

  const handleMarkReady = useCallback(
    () => transition((prev) => markReady(prev)),
    [transition]
  )

  const handleReset = useCallback(
    (keepSessionId = false) => transition((prev) => resetSession(prev, keepSessionId)),
    [transition]
  )

  const handleSetThinkingLevel = useCallback(
    (level: ThinkingLevel) => transition((prev) => setThinkingLevel(prev, level)),
    [transition]
  )

  const handleRenameDsl = useCallback(
    (name: string) => transition((prev) => renameDsl(prev, name)),
    [transition]
  )

  return {
    state,
    getState,
    phase: state.phase,
    transcript: state.transcript,
    branches: state.branches,
    activeBranchId: state.activeBranchId,
    currentDsl: state.currentDsl,
    aborted: state.aborted,
    thinkingLevel: state.thinkingLevel,
    steeringQueue: state.steeringQueue,
    followUpQueue: state.followUpQueue,
    canApply: canApply(state),
    verifiedBranches: verifiedBranches(state),
    signal: () => abortRef.current?.signal ?? null,
    submitDoc: handleSubmitDoc,
    steer: handleSteer,
    followUp: handleFollowUp,
    abort: handleAbort,
    drainSteering: handleDrainSteering,
    drainFollowUp: handleDrainFollowUp,
    narrative: handleNarrative,
    toolCall: handleToolCall,
    toolResult: handleToolResult,
    fieldDetected: handleFieldDetected,
    branchDecisionNeeded: handleBranchDecisionNeeded,
    forkBranches: handleForkBranches,
    selectBranch: handleSelectBranch,
    recordValidation: handleRecordValidation,
    recordArtifact: handleRecordArtifact,
    enterValidation: handleEnterValidation,
    markReady: handleMarkReady,
    reset: handleReset,
    setThinkingLevel: handleSetThinkingLevel,
    renameDsl: handleRenameDsl
  }
}

export type ProtocolGenSession = ReturnType<typeof useProtocolGenSession>
export type { ProtocolGenPhase, ThinkingLevel, QueuedMessage }
