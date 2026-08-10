/**
 * 协议生成会话 —— 纯核心转移函数测试。
 *
 * 锁定 protocolGenEngine 的行为：
 * - 转移函数纯函数（输入→输出，不依赖外部状态）
 * - transcript 事件按类型正确 append
 * - 三档介入队列（steering / follow-up / aborted）入队与排空
 * - 会话分支树 forkBranches / selectBranch / recordValidation 的 verified 裁决
 * - phase 转移正确
 *
 * 全纯逻辑测试，不依赖 React / IPC。
 */
import { describe, it, expect } from 'vitest'
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
  renameDsl,
  canApply,
  verifiedBranches,
  TRANSCRIPT_LIMIT,
  type ProtocolGenState
} from '@/features/script-editor/protocol-gen/protocolGenEngine'
import type { ProtocolDsl } from '@shared/protocol-dsl'
import type { RoundTripResult } from '@/features/script-editor/dsl/roundTrip'

const simpleDsl: ProtocolDsl = {
  name: 'TestProtocol',
  fields: [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'uint', name: 'seq', width: 1, value: 1 }
  ]
}

const tlvDsl: ProtocolDsl = {
  name: 'TestTlv',
  fields: [
    { kind: 'const', name: 'magic', value: 'AA55', mode: 'hex' },
    { kind: 'tlv', name: 'data', entries: [{ type: 1, value: '01', mode: 'hex' }] }
  ]
}

function makeResult(ok: boolean): RoundTripResult {
  return {
    ok,
    sentFrames: ['AA5501'],
    parsed: null,
    fieldChecks: ok
      ? [{ field: 'magic', expected: 'AA55', actual: 'AA55', match: true }]
      : [{ field: 'magic', expected: 'AA55', actual: 'XXXX', match: false }],
    errors: []
  }
}

describe('protocolGenEngine — 初始状态', () => {
  it('createProtocolGenState 产出 idle 空状态', () => {
    const s = createProtocolGenState()
    expect(s.phase).toBe('idle')
    expect(s.docText).toBeNull()
    expect(s.currentDsl).toBeNull()
    expect(s.branches).toEqual([])
    expect(s.transcript).toEqual([])
    expect(s.steeringQueue).toEqual([])
    expect(s.followUpQueue).toEqual([])
    expect(s.aborted).toBe(false)
    expect(s.sessionId).toMatch(/^proto-/)
  })

  it('每次 createProtocolGenState 生成不同 sessionId', () => {
    const a = createProtocolGenState()
    const b = createProtocolGenState()
    expect(a.sessionId).not.toBe(b.sessionId)
  })
})

describe('protocolGenEngine — phase 转移', () => {
  it('submitDoc 进入 parsing 并记录事件', () => {
    const s = createProtocolGenState()
    const next = submitDoc(s, '帧头 AA55')
    expect(next.phase).toBe('parsing')
    expect(next.docText).toBe('帧头 AA55')
    const types = next.transcript.map((e) => e.type)
    expect(types).toContain('parse_start')
    expect(types).toContain('phase_change')
    const phaseChange = next.transcript.find((e) => e.type === 'phase_change')!
    expect(phaseChange.type === 'phase_change' && phaseChange.from).toBe('idle')
    expect(phaseChange.type === 'phase_change' && phaseChange.to).toBe('parsing')
  })

  it('enterValidation / markReady 链式转移', () => {
    let s = createProtocolGenState()
    s = recordArtifact(s, simpleDsl)
    expect(s.phase).toBe('awaiting-confirm')
    s = enterValidation(s)
    expect(s.phase).toBe('validating')
    s = markReady(s)
    expect(s.phase).toBe('ready')
  })

  it('recordArtifact 无分支时自动建主干', () => {
    const s = recordArtifact(createProtocolGenState(), simpleDsl)
    expect(s.branches).toHaveLength(1)
    expect(s.branches[0].parentId).toBeNull()
    expect(s.branches[0].dsl).toEqual(simpleDsl)
    expect(s.activeBranchId).toBe(s.branches[0].id)
    expect(s.currentDsl).toEqual(simpleDsl)
  })
})

describe('protocolGenEngine — 三档介入队列', () => {
  it('enqueueSteering 入队并 emit user_steer', () => {
    const s = enqueueSteering(createProtocolGenState(), '设备名是 GBK')
    expect(s.steeringQueue).toHaveLength(1)
    expect(s.steeringQueue[0].text).toBe('设备名是 GBK')
    expect(s.transcript[s.transcript.length - 1].type).toBe('user_steer')
  })

  it('enqueueFollowUp 入队并 emit user_followup', () => {
    const s = enqueueFollowUp(createProtocolGenState(), '再解释下 T12')
    expect(s.followUpQueue).toHaveLength(1)
    expect(s.transcript[s.transcript.length - 1].type).toBe('user_followup')
  })

  it('abortSession 设置 aborted 并 emit aborted', () => {
    const s = abortSession(createProtocolGenState())
    expect(s.aborted).toBe(true)
    expect(s.phase).toBe('aborted')
    expect(s.transcript[s.transcript.length - 1].type).toBe('aborted')
  })

  it('abortSession 幂等（重复调用 no-op）', () => {
    const aborted = abortSession(createProtocolGenState())
    const again = abortSession(aborted)
    expect(again).toBe(aborted)
  })

  it('drainSteering 排空并返回消息', () => {
    const queued = enqueueSteering(createProtocolGenState(), '纠偏')
    const { state, messages } = drainSteering(queued)
    expect(state.steeringQueue).toEqual([])
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('纠偏')
  })

  it('drainSteering 空队列返回空', () => {
    const { state, messages } = drainSteering(createProtocolGenState())
    expect(messages).toEqual([])
    expect(state).toBe(state)
  })

  it('drainFollowUp 排空并返回消息', () => {
    const queued = enqueueFollowUp(createProtocolGenState(), '追问')
    const { state, messages } = drainFollowUp(queued)
    expect(state.followUpQueue).toEqual([])
    expect(messages).toHaveLength(1)
  })
})

describe('protocolGenEngine — 会话分支树 + 往返裁决', () => {
  it('forkBranches 为每种解读创建分支', () => {
    const s = forkBranches(createProtocolGenState(), [
      { label: 'uint 解读', dsl: simpleDsl },
      { label: 'tlv 解读', dsl: tlvDsl }
    ])
    expect(s.branches).toHaveLength(2)
    expect(s.branches[0].label).toBe('uint 解读')
    expect(s.branches[1].label).toBe('tlv 解读')
    expect(s.branches.every((b) => !b.verified)).toBe(true)
    expect(s.transcript.some((e) => e.type === 'branch_created')).toBe(true)
  })

  it('forkBranches 空解读列表 no-op', () => {
    const s = createProtocolGenState()
    expect(forkBranches(s, [])).toBe(s)
  })

  it('recordValidation 通过则标 verified', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'uint', dsl: simpleDsl }
    ])
    const branchId = s.branches[0].id
    s = recordValidation(s, branchId, makeResult(true))
    expect(s.branches[0].verified).toBe(true)
    expect(s.branches[0].validation?.ok).toBe(true)
    expect(s.transcript.some((e) => e.type === 'validation_step')).toBe(true)
  })

  it('recordValidation 失败标未 verified 并 emit mismatch_found', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'uint', dsl: simpleDsl }
    ])
    const branchId = s.branches[0].id
    s = recordValidation(s, branchId, makeResult(false))
    expect(s.branches[0].verified).toBe(false)
    expect(s.transcript.some((e) => e.type === 'mismatch_found')).toBe(true)
  })

  it('selectBranch 切换活动分支并更新 currentDsl', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'uint', dsl: simpleDsl },
      { label: 'tlv', dsl: tlvDsl }
    ])
    const secondId = s.branches[1].id
    s = selectBranch(s, secondId)
    expect(s.activeBranchId).toBe(secondId)
    expect(s.currentDsl).toEqual(tlvDsl)
  })

  it('verifiedBranches 只返回通过验证的分支', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'uint', dsl: simpleDsl },
      { label: 'tlv', dsl: tlvDsl }
    ])
    s = recordValidation(s, s.branches[0].id, makeResult(true))
    s = recordValidation(s, s.branches[1].id, makeResult(false))
    const verified = verifiedBranches(s)
    expect(verified).toHaveLength(1)
    expect(verified[0].label).toBe('uint')
  })
})

describe('protocolGenEngine — 工具可观测性', () => {
  it('recordToolCall + recordToolResult 成对 append', () => {
    let s = createProtocolGenState()
    s = recordToolCall(s, 'textToHex', { text: 'AB' })
    s = recordToolResult(s, 'textToHex', { hex: '4142' })
    const types = s.transcript.map((e) => e.type)
    expect(types).toEqual(['tool_call', 'tool_result'])
  })

  it('recordFieldDetected emit field_detected', () => {
    const s = recordFieldDetected(createProtocolGenState(), {
      kind: 'const',
      name: 'magic',
      value: 'AA55',
      mode: 'hex'
    })
    expect(s.transcript[s.transcript.length - 1].type).toBe('field_detected')
  })

  it('recordNarrative emit narrative', () => {
    const s = recordNarrative(createProtocolGenState(), '解析到帧头')
    expect(s.transcript[s.transcript.length - 1].type).toBe('narrative')
  })
})

describe('protocolGenEngine — canApply 派生', () => {
  it('未验证不可 apply', () => {
    const s = recordArtifact(createProtocolGenState(), simpleDsl)
    expect(canApply(s)).toBe(false)
  })

  it('验证通过且为活动分支可 apply', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'main', dsl: simpleDsl }
    ])
    s = selectBranch(s, s.branches[0].id)
    s = recordValidation(s, s.branches[0].id, makeResult(true))
    expect(canApply(s)).toBe(true)
  })

  it('aborted 不可 apply', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'main', dsl: simpleDsl }
    ])
    s = recordValidation(s, s.branches[0].id, makeResult(true))
    s = selectBranch(s, s.branches[0].id)
    s = abortSession(s)
    expect(canApply(s)).toBe(false)
  })
})

describe('protocolGenEngine — transcript 有限增长', () => {
  it('超过 TRANSCRIPT_LIMIT 丢弃最旧', () => {
    let s: ProtocolGenState = createProtocolGenState()
    for (let i = 0; i < TRANSCRIPT_LIMIT + 50; i++) {
      s = recordNarrative(s, `line-${i}`)
    }
    expect(s.transcript.length).toBe(TRANSCRIPT_LIMIT)
    // 保留最新的，丢弃最旧的
    const last = s.transcript[s.transcript.length - 1]
    expect(last.type === 'narrative' && last.text).toBe(`line-${TRANSCRIPT_LIMIT + 49}`)
  })
})

describe('protocolGenEngine — renameDsl（ASCII 名纠正）', () => {
  it('重命名活动分支 DSL 的 name + currentDsl，emit user_steer', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'main', dsl: { ...simpleDsl, name: '中文协议' } }
    ])
    s = selectBranch(s, s.branches[0].id)
    s = renameDsl(s, 'TLV-DEVICE-INFO')
    expect(s.currentDsl?.name).toBe('TLV-DEVICE-INFO')
    expect(s.branches[0].dsl?.name).toBe('TLV-DEVICE-INFO')
    const last = s.transcript[s.transcript.length - 1]
    expect(last.type).toBe('user_steer')
    if (last.type === 'user_steer') expect(last.message).toContain('TLV-DEVICE-INFO')
  })

  it('空名 / 同名 / 无活动分支时不改变状态', () => {
    let s = forkBranches(createProtocolGenState(), [{ label: 'main', dsl: simpleDsl }])
    s = selectBranch(s, s.branches[0].id)
    const before = s.transcript.length
    expect(renameDsl(s, '  ').transcript.length).toBe(before)
    expect(renameDsl(s, simpleDsl.name).transcript.length).toBe(before)
    expect(renameDsl(createProtocolGenState(), 'NewName').transcript.length).toBe(0)
  })

  it('重命名不影响已验证状态（验证结果绑定字段而非名称）', () => {
    let s = forkBranches(createProtocolGenState(), [
      { label: 'main', dsl: simpleDsl }
    ])
    s = selectBranch(s, s.branches[0].id)
    s = recordValidation(s, s.branches[0].id, makeResult(true))
    s = renameDsl(s, 'Renamed')
    expect(canApply(s)).toBe(true)
  })
})
