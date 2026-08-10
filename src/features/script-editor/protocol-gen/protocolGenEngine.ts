/**
 * 协议生成会话 —— 纯逻辑核心（仿 rete/graphState.ts + graphHistoryCore.ts）。
 *
 * 设计参考 pi agent 的「纯 core 发事件、UI 订阅」模型，但不引入 EventEmitter /
 * useSyncExternalStore（本仓无此先例）。事件流在本仓的惯用做法是：状态里挂一个
 * transcript 数组，转移函数 append，UI 通过正常订阅（React state / Zustand）读取。
 *
 * 三层：
 * - 本文件：纯转移函数 (state, ...) => state，零 React / 零 IPC / 零 IO，Vitest 可测
 * - useProtocolGenSession.ts：React stateful 绑定（仿 useGraphHistory）
 * - protocolGenStore.ts：跨组件 ephemeral（仿 store.ts Zustand）
 *
 * pi agent 五要素落点：
 * - 三档介入：steeringQueue（下个安全边界改方向）/ followUpQueue（当前 run 结束后）/ aborted
 * - 会话树：branches 数组 + 每个分支 parentId，forkAt 创建分叉
 * - 工具全可观测：tool_call / tool_result 事件进 transcript，UI 折叠展开
 * - 统一中止：aborted 标志，docToDsl 的 async generator 每步检查
 * - thinking level：事件带 level: 'fast' | 'deep'，UI 边框/芯片反映
 */

import type { ProtocolDsl, ProtocolField } from '@shared/protocol-dsl'
import type { RoundTripResult } from '@/features/script-editor/dsl/roundTrip'

/** transcript 事件上限（对齐 HISTORY_LIMIT=100 的有限增长思路）。 */
export const TRANSCRIPT_LIMIT = 200

/** 思考深度档位（对齐 pi agent 的 thinking level）。 */
export type ThinkingLevel = 'fast' | 'deep'

/** 会话阶段。 */
export type ProtocolGenPhase =
  | 'idle'          // 初始，未提交协议描述
  | 'parsing'       // agent 正在解析（doc → DSL），可 steering/abort
  | 'awaiting-confirm' // 解析出 DSL，等用户确认/纠偏
  | 'validating'    // 往返验证中（可分叉并行验证）
  | 'ready'         // 验证通过，可应用
  | 'aborted'       // 用户中止

/** 介入消息（pi agent 的 steering / follow-up）。 */
export interface QueuedMessage {
  id: string
  text: string
  ts: number
}

/** 会话分叉（pi agent 的会话树节点）。 */
export interface ProtocolGenBranch {
  id: string
  /** 父分支 id（主干为 null）。 */
  parentId: string | null
  /** 人类可读解读标签（如 "uint 解读" / "tlv 解读"）。 */
  label: string
  /** 该分支的 DSL（fork 时可能为 null，验证后填充）。 */
  dsl: ProtocolDsl | null
  /** 该分支的往返验证结果。 */
  validation: { ok: boolean; result?: RoundTripResult } | null
  /** 是否验证通过（往返一致）。 */
  verified: boolean
  /** 创建该分支的事件 id（用于分叉树定位）。 */
  originEventId: string | null
}

/** transcript 事件（pi agent 的「core 发事件，UI 订阅」）。判别联合，UI 按类型渲染。 */
export type ProtocolGenEvent =
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'phase_change'; from: ProtocolGenPhase; to: ProtocolGenPhase }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'parse_start'; docText: string }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'tool_call'; tool: string; args: unknown }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'tool_result'; tool: string; result: unknown }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'field_detected'; field: ProtocolField }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'validation_step'; branchId: string; ok: boolean; mismatches: string[]; errors?: string[] }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'mismatch_found'; branchId: string; mismatches: string[] }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'branch_decision_needed'; reason: string; options: string[] }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'branch_created'; branchId: string; label: string }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'artifact_ready'; dsl: ProtocolDsl }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'user_steer'; message: string }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'user_followup'; message: string }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'aborted' }
  | { id: string; ts: number; parentId: string | null; level: ThinkingLevel; type: 'narrative'; text: string }

/** 协议生成会话状态。纯数据，转移函数返回新状态。 */
export interface ProtocolGenState {
  sessionId: string
  phase: ProtocolGenPhase
  /** 用户提交的协议描述文本（手动输入或文档提取后的纯文本）。 */
  docText: string | null
  /** 当前工作 DSL（活动分支的 DSL）。 */
  currentDsl: ProtocolDsl | null
  /** 会话分支树。branches[0] 是主干（parentId: null）。 */
  branches: ProtocolGenBranch[]
  /** 当前活动分支 id。 */
  activeBranchId: string | null
  /** 事件日志（上限 TRANSCRIPT_LIMIT）。 */
  transcript: ProtocolGenEvent[]
  /** steering 队列：下个安全边界注入，改方向（pi agent Enter）。 */
  steeringQueue: QueuedMessage[]
  /** follow-up 队列：当前 run 结束后开新轮（pi agent Alt+Enter）。 */
  followUpQueue: QueuedMessage[]
  /** 中止标志（pi agent Esc）。 */
  aborted: boolean
  /** 当前思考深度。 */
  thinkingLevel: ThinkingLevel
  /** 单调递增计数器，用于生成 id。 */
  seq: number
}

// ═══════════════════════════════════════════════════════════
// 内部工具（纯函数，无副作用）
// ═══════════════════════════════════════════════════════════

function genId(state: ProtocolGenState, prefix: string): string {
  return `${prefix}-${state.seq}`
}

function genSessionId(): string {
  return `proto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** append 事件到 transcript，超过上限丢弃最旧（对齐 HISTORY_LIMIT 有限增长）。
 *  入参是已有 transcript 数组（不是 state），便于链式 append。 */
function appendEvent(transcript: ProtocolGenEvent[], event: ProtocolGenEvent): ProtocolGenEvent[] {
  const next = [...transcript, event]
  if (next.length > TRANSCRIPT_LIMIT) next.splice(0, next.length - TRANSCRIPT_LIMIT)
  return next
}

/** 最后一个事件的 id（用作新事件的 parentId）。 */
function lastEventId(state: ProtocolGenState): string | null {
  const last = state.transcript[state.transcript.length - 1]
  return last ? last.id : null
}

// ═══════════════════════════════════════════════════════════
// 纯转移函数：(state, ...) => state
// ═══════════════════════════════════════════════════════════

/** 创建初始会话状态。 */
export function createProtocolGenState(): ProtocolGenState {
  return {
    sessionId: genSessionId(),
    phase: 'idle',
    docText: null,
    currentDsl: null,
    branches: [],
    activeBranchId: null,
    transcript: [],
    steeringQueue: [],
    followUpQueue: [],
    aborted: false,
    thinkingLevel: 'fast',
    seq: 0
  }
}

/** 切换思考深度（pi agent Shift+Tab）。 */
export function setThinkingLevel(state: ProtocolGenState, level: ThinkingLevel): ProtocolGenState {
  return { ...state, thinkingLevel: level }
}

/** 提交协议描述，进入 parsing 阶段。 */
export function submitDoc(state: ProtocolGenState, docText: string): ProtocolGenState {
  const from = state.phase
  const to: ProtocolGenPhase = 'parsing'
  const seq = state.seq + 1
  const parseEvent: ProtocolGenEvent = {
    id: genId({ ...state, seq }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'parse_start',
    docText
  }
  const phaseEvent: ProtocolGenEvent = {
    id: genId({ ...state, seq: seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: parseEvent.id,
    level: state.thinkingLevel,
    type: 'phase_change',
    from,
    to
  }
  return {
    ...state,
    seq: seq + 2,
    phase: to,
    docText,
    aborted: false,
    steeringQueue: [],
    followUpQueue: [],
    transcript: appendEvent(appendEvent(state.transcript, parseEvent), phaseEvent)
  }
}

/** steering 入队（pi agent Enter：下个安全边界注入，改方向）。 */
export function enqueueSteering(state: ProtocolGenState, text: string): ProtocolGenState {
  const msg: QueuedMessage = { id: `steer-${state.seq + 1}`, text, ts: Date.now() }
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'user_steer',
    message: text
  }
  return {
    ...state,
    seq: state.seq + 2,
    steeringQueue: [...state.steeringQueue, msg],
    transcript: appendEvent(state.transcript, event)
  }
}

/** follow-up 入队（pi agent Alt+Enter：当前 run 结束后开新轮）。 */
export function enqueueFollowUp(state: ProtocolGenState, text: string): ProtocolGenState {
  const msg: QueuedMessage = { id: `fu-${state.seq + 1}`, text, ts: Date.now() }
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'user_followup',
    message: text
  }
  return {
    ...state,
    seq: state.seq + 2,
    followUpQueue: [...state.followUpQueue, msg],
    transcript: appendEvent(state.transcript, event)
  }
}

/** 中止（pi agent Esc）。 */
export function abortSession(state: ProtocolGenState): ProtocolGenState {
  if (state.aborted) return state
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'aborted'
  }
  return {
    ...state,
    seq: state.seq + 2,
    aborted: true,
    phase: 'aborted',
    transcript: appendEvent(state.transcript, event)
  }
}

/**
 * 排空 steering 队列（在安全边界调用）。
 * 返回新 state + 排出的消息，供编排层（hook）注入到 agent 上下文。
 */
export function drainSteering(state: ProtocolGenState): { state: ProtocolGenState; messages: QueuedMessage[] } {
  if (state.steeringQueue.length === 0) return { state, messages: [] }
  return {
    state: { ...state, steeringQueue: [] },
    messages: [...state.steeringQueue]
  }
}

/** 排空 follow-up 队列（当前 run 结束后调用）。 */
export function drainFollowUp(state: ProtocolGenState): { state: ProtocolGenState; messages: QueuedMessage[] } {
  if (state.followUpQueue.length === 0) return { state, messages: [] }
  return {
    state: { ...state, followUpQueue: [] },
    messages: [...state.followUpQueue]
  }
}

/** 记录 agent 的叙述文本（pi agent 的流式叙述）。 */
export function recordNarrative(state: ProtocolGenState, text: string): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'narrative',
    text
  }
  return { ...state, seq: state.seq + 2, transcript: appendEvent(state.transcript, event) }
}

/** 记录工具调用（pi agent 的工具全可观测）。 */
export function recordToolCall(state: ProtocolGenState, tool: string, args: unknown): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'tool_call',
    tool,
    args
  }
  return { ...state, seq: state.seq + 2, transcript: appendEvent(state.transcript, event) }
}

/** 记录工具结果。 */
export function recordToolResult(state: ProtocolGenState, tool: string, result: unknown): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'tool_result',
    tool,
    result
  }
  return { ...state, seq: state.seq + 2, transcript: appendEvent(state.transcript, event) }
}

/** 记录检测到的字段。 */
export function recordFieldDetected(state: ProtocolGenState, field: ProtocolField): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'field_detected',
    field
  }
  return { ...state, seq: state.seq + 2, transcript: appendEvent(state.transcript, event) }
}

/** 标记需要分叉决策（歧义点）。 */
export function recordBranchDecisionNeeded(state: ProtocolGenState, reason: string, options: string[]): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'branch_decision_needed',
    reason,
    options
  }
  return { ...state, seq: state.seq + 2, transcript: appendEvent(state.transcript, event) }
}

/**
 * 在指定事件处分叉，为每种解读创建一个分支（pi agent 会话树）。
 * @param interpretations 分支解读列表（label + 对应 DSL）
 */
export function forkBranches(
  state: ProtocolGenState,
  interpretations: Array<{ label: string; dsl: ProtocolDsl }>
): ProtocolGenState {
  if (interpretations.length === 0) return state
  const originEventId = lastEventId(state)
  let seq = state.seq
  let transcript = state.transcript
  const parentBranchId = state.activeBranchId
  const newBranches: ProtocolGenBranch[] = interpretations.map((interp) => {
    seq += 1
    const branchId = `br-${seq}`
    const event: ProtocolGenEvent = {
      id: genId({ ...state, seq }, 'ev'),
      ts: Date.now(),
      parentId: originEventId,
      level: state.thinkingLevel,
      type: 'branch_created',
      branchId,
      label: interp.label
    }
    seq += 1
    transcript = appendEvent(transcript, event)
    return {
      id: branchId,
      parentId: parentBranchId,
      label: interp.label,
      dsl: interp.dsl,
      validation: null,
      verified: false,
      originEventId
    }
  })
  return {
    ...state,
    seq: seq + 1,
    branches: [...state.branches, ...newBranches],
    transcript
  }
}

/** 选择活动分支（用户在分叉树侧栏点击）。 */
export function selectBranch(state: ProtocolGenState, branchId: string): ProtocolGenState {
  const branch = state.branches.find((b) => b.id === branchId)
  if (!branch) return state
  return {
    ...state,
    activeBranchId: branchId,
    currentDsl: branch.dsl
  }
}

/**
 * 记录某分支的往返验证结果（自动分叉 + 往返裁决核心）。
 * 通过 → 标 verified；失败 → emit mismatch_found。
 */
export function recordValidation(
  state: ProtocolGenState,
  branchId: string,
  result: RoundTripResult
): ProtocolGenState {
  const branch = state.branches.find((b) => b.id === branchId)
  if (!branch) return state
  const ok = result.ok
  const mismatches = result.fieldChecks.filter((c) => !c.match).map((c) => `${c.field}: 期望 ${c.expected} 实际 ${c.actual}`)
  const validationEvent: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'validation_step',
    branchId,
    ok,
    mismatches,
    errors: result.errors.length > 0 ? result.errors : undefined
  }
  let nextTranscript = appendEvent(state.transcript, validationEvent)
  let nextState: ProtocolGenState = { ...state, seq: state.seq + 2, transcript: nextTranscript }
  if (!ok) {
    const mismatchEvent: ProtocolGenEvent = {
      id: genId(nextState, 'ev'),
      ts: Date.now(),
      parentId: validationEvent.id,
      level: state.thinkingLevel,
      type: 'mismatch_found',
      branchId,
      mismatches
    }
    nextTranscript = appendEvent(nextTranscript, mismatchEvent)
    nextState = { ...nextState, seq: nextState.seq + 2, transcript: nextTranscript }
  }
  const branches = nextState.branches.map((b) =>
    b.id === branchId ? { ...b, validation: { ok, result }, verified: ok } : b
  )
  return { ...nextState, branches }
}

/**
 * 设置当前 DSL 并进入 awaiting-confirm（解析完成的产物）。
 * 若无分支，自动创建主干分支承载此 DSL。
 */
export function recordArtifact(state: ProtocolGenState, dsl: ProtocolDsl): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'artifact_ready',
    dsl
  }
  let branches = state.branches
  let activeBranchId = state.activeBranchId
  if (branches.length === 0) {
    const mainBranch: ProtocolGenBranch = {
      id: `br-${state.seq + 2}`,
      parentId: null,
      label: '主干',
      dsl,
      validation: null,
      verified: false,
      originEventId: event.id
    }
    branches = [mainBranch]
    activeBranchId = mainBranch.id
  } else if (activeBranchId) {
    branches = branches.map((b) => (b.id === activeBranchId ? { ...b, dsl } : b))
  }
  const phaseEvent: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 2 }, 'ev'),
    ts: Date.now(),
    parentId: event.id,
    level: state.thinkingLevel,
    type: 'phase_change',
    from: state.phase,
    to: 'awaiting-confirm'
  }
  return {
    ...state,
    seq: state.seq + 3,
    phase: 'awaiting-confirm',
    currentDsl: dsl,
    branches,
    activeBranchId,
    transcript: appendEvent(appendEvent(state.transcript, event), phaseEvent)
  }
}

/** 进入验证阶段。 */
export function enterValidation(state: ProtocolGenState): ProtocolGenState {
  if (state.phase === 'validating') return state
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'phase_change',
    from: state.phase,
    to: 'validating'
  }
  return {
    ...state,
    seq: state.seq + 2,
    phase: 'validating',
    transcript: appendEvent(state.transcript, event)
  }
}

/** 验证通过，进入 ready（可应用）。 */
export function markReady(state: ProtocolGenState): ProtocolGenState {
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'phase_change',
    from: state.phase,
    to: 'ready'
  }
  return { ...state, seq: state.seq + 2, phase: 'ready', transcript: appendEvent(state.transcript, event) }
}

/**
 * 重命名当前分支协议（向导 ASCII 名纠正）。
 * 只改 activeBranch 的 dsl.name + currentDsl，不动已验证状态（重命名不影响往返验证结果）。
 */
export function renameDsl(state: ProtocolGenState, name: string): ProtocolGenState {
  const trimmed = name.trim()
  if (!trimmed || !state.activeBranchId || !state.currentDsl) return state
  if (state.currentDsl.name === trimmed) return state
  const event: ProtocolGenEvent = {
    id: genId({ ...state, seq: state.seq + 1 }, 'ev'),
    ts: Date.now(),
    parentId: lastEventId(state),
    level: state.thinkingLevel,
    type: 'user_steer',
    message: `协议名改为「${trimmed}」`
  }
  const branches = state.branches.map((b) =>
    b.id === state.activeBranchId && b.dsl ? { ...b, dsl: { ...b.dsl, name: trimmed } } : b)
  return {
    ...state,
    seq: state.seq + 2,
    currentDsl: { ...state.currentDsl, name: trimmed },
    branches,
    transcript: appendEvent(state.transcript, event)
  }
}

/** 重置会话（保留 sessionId 或生成新的）。 */
export function resetSession(state: ProtocolGenState, keepSessionId = false): ProtocolGenState {
  const fresh = createProtocolGenState()
  return keepSessionId ? { ...fresh, sessionId: state.sessionId } : fresh
}

/** 派生：是否可应用（验证通过的活动分支）。 */
export function canApply(state: ProtocolGenState): boolean {
  if (!state.currentDsl || state.aborted) return false
  const branch = state.branches.find((b) => b.id === state.activeBranchId)
  return !!branch?.verified
}

/** 派生：所有已验证分支（供分叉树侧栏标记）。 */
export function verifiedBranches(state: ProtocolGenState): ProtocolGenBranch[] {
  return state.branches.filter((b) => b.verified)
}
