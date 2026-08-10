/**
 * 流式叙述区 —— 逐条渲染 transcript 事件（pi agent 的对话区）。
 *
 * 按事件类型分卡片渲染：
 * - narrative / phase_change / parse_start → 灰色叙述文本
 * - field_detected → 字段卡片（kind + name + value/width）
 * - tool_call / tool_result → 折叠工具日志（ToolLogFold）
 * - validation_step → 验证表（字段/期望/实际/状态）
 * - mismatch_found → 红色高亮
 * - branch_decision_needed → 黄色决策卡
 * - branch_created → 分支徽标
 * - artifact_ready → 绿色产物卡
 * - user_steer / user_followup → 用户消息气泡（右侧）
 * - aborted → 中止标记
 */
import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, WarningCircle, XCircle, GitBranch, Sparkle, ArrowBendUpLeft, ArrowRight, Stop } from '@phosphor-icons/react'
import type { ProtocolGenEvent } from '@/features/script-editor/protocol-gen/protocolGenEngine'
import type { ProtocolField } from '@shared/protocol-dsl'
import { ToolLogFold } from './ToolLogFold'

interface NarrativeStreamProps {
  transcript: ProtocolGenEvent[]
  /** 是否展开工具日志。 */
  toolLogExpanded: boolean
}

const PHASE_LABEL: Record<string, string> = {
  idle: '空闲',
  parsing: '解析中',
  'awaiting-confirm': '待确认',
  validating: '验证中',
  ready: '就绪',
  aborted: '已中止'
}

function fieldSummary(field: ProtocolField): string {
  switch (field.kind) {
    case 'const': return `${field.kind} · ${field.name} = ${field.value}${field.mode ? ` (${field.mode})` : ''}`
    case 'uint': return `${field.kind} · ${field.name} u${field.width * 8}${field.endian ? ` ${field.endian}` : ''}${field.value !== undefined ? ` = ${field.value}` : ''}`
    case 'text': return `${field.kind} · ${field.name} "${field.value}"${field.encoding ? ` (${field.encoding})` : ''}`
    case 'crc': return `${field.kind} · ${field.name} ${field.algorithm || 'CRC16'}${field.endian ? ` ${field.endian}` : ''}`
    case 'tlv': return `${field.kind} · ${field.name} (${field.entries?.length || 0} 条目)`
    case 'bitfield': return `${field.kind} · ${field.name} (${field.fields?.length || 0} 子域)`
    case 'length-prefix': return `${field.kind} · ${field.name} ${field.width || 'u8'}`
    case 'repeat-block': return `${field.kind} · ${field.name}`
    case 'optional': return `${field.kind} · ${field.name} (flag ${field.flagBit})`
    case 'custom': return `${field.kind} · ${field.name} [${field.componentKey}]`
    default: return JSON.stringify(field)
  }
}

export function NarrativeStream({ transcript, toolLogExpanded }: NarrativeStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // 自动滚动到底部（流式新事件）
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript.length])

  // 合并相邻的 tool_call/tool_result 对
  const items: Array<{ events: ProtocolGenEvent[]; key: string }> = []
  let i = 0
  while (i < transcript.length) {
    const ev = transcript[i]
    if (ev.type === 'tool_call') {
      const group: ProtocolGenEvent[] = [ev]
      // 收集后续同工具的 tool_result
      let j = i + 1
      while (j < transcript.length && transcript[j].type === 'tool_result') {
        group.push(transcript[j])
        j++
      }
      items.push({ events: group, key: ev.id })
      i = j
    } else {
      items.push({ events: [ev], key: ev.id })
      i++
    }
  }

  return (
    <div className="protocol-gen-wizard__stream" ref={scrollRef} data-testid="protocol-gen-stream">
      {items.map(({ events, key }) => {
        const ev = events[0]
        switch (ev.type) {
          case 'narrative':
            return (
              <div key={key} className="protocol-gen-wizard__narrative">
                <Sparkle size={13} weight="bold" />
                <span>{ev.text}</span>
              </div>
            )
          case 'phase_change':
            return (
              <div key={key} className="protocol-gen-wizard__phase">
                <ArrowRight size={12} weight="bold" />
                <span>{PHASE_LABEL[ev.from] || ev.from} → {PHASE_LABEL[ev.to] || ev.to}</span>
              </div>
            )
          case 'parse_start':
            return (
              <div key={key} className="protocol-gen-wizard__narrative">
                <Sparkle size={13} weight="bold" />
                <span>解析输入：{ev.docText.slice(0, 80)}{ev.docText.length > 80 ? '…' : ''}</span>
              </div>
            )
          case 'field_detected':
            return (
              <div key={key} className="protocol-gen-wizard__field-card" data-testid={`field-${ev.field.name}`}>
                <Badge variant="secondary">{ev.field.kind}</Badge>
                <span className="protocol-gen-wizard__field-summary">{fieldSummary(ev.field)}</span>
              </div>
            )
          case 'tool_call':
          case 'tool_result':
            return <ToolLogFold key={key} events={events} defaultOpen={toolLogExpanded} />
          case 'validation_step':
            return (
              <div key={key} className={`protocol-gen-wizard__validation ${ev.ok ? 'is-ok' : 'is-fail'}`} data-testid={`validation-${ev.branchId}`}>
                {ev.ok ? <CheckCircle size={14} weight="bold" /> : <XCircle size={14} weight="bold" />}
                <span>分支 {ev.branchId} 往返验证{ev.ok ? '通过' : '失败'}</span>
                {ev.mismatches.length > 0 && (
                  <ul className="protocol-gen-wizard__mismatch-list">
                    {ev.mismatches.map((mm, idx) => <li key={idx}>{mm}</li>)}
                  </ul>
                )}
                {ev.errors && ev.errors.length > 0 && (
                  <ul className="protocol-gen-wizard__mismatch-list">
                    {ev.errors.map((er, idx) => <li key={`err-${idx}`}>错误：{er}</li>)}
                  </ul>
                )}
              </div>
            )
          case 'mismatch_found':
            return (
              <div key={key} className="protocol-gen-wizard__mismatch" data-testid={`mismatch-${ev.branchId}`}>
                <WarningCircle size={14} weight="bold" />
                <span>分支 {ev.branchId} 字段不一致（{ev.mismatches.length} 处）</span>
              </div>
            )
          case 'branch_decision_needed':
            return (
              <div key={key} className="protocol-gen-wizard__decision">
                <GitBranch size={14} weight="bold" />
                <div>
                  <div className="protocol-gen-wizard__decision-title">检测到歧义，已自动分叉</div>
                  <div className="protocol-gen-wizard__decision-reason">{ev.reason}</div>
                </div>
              </div>
            )
          case 'branch_created':
            return (
              <div key={key} className="protocol-gen-wizard__branch-tag">
                <GitBranch size={12} weight="bold" />
                <span>分支 {ev.branchId}：{ev.label}</span>
              </div>
            )
          case 'artifact_ready':
            return (
              <div key={key} className="protocol-gen-wizard__artifact" data-testid="artifact-ready">
                <CheckCircle size={14} weight="bold" />
                <span>生成 DSL：{ev.dsl.name}（{ev.dsl.fields?.length || ev.dsl.messages?.length || 0} 字段）</span>
              </div>
            )
          case 'user_steer':
          case 'user_followup':
            return (
              <div key={key} className={`protocol-gen-wizard__user-msg ${ev.type === 'user_steer' ? 'is-steer' : 'is-followup'}`}>
                <ArrowBendUpLeft size={12} weight="bold" />
                <span>{ev.type === 'user_steer' ? '纠偏' : '追问'}：{ev.message}</span>
              </div>
            )
          case 'aborted':
            return (
              <div key={key} className="protocol-gen-wizard__aborted">
                <Stop size={14} weight="bold" />
                <span>已中止</span>
              </div>
            )
          default:
            return null
        }
      })}
      {transcript.length === 0 && (
        <div className="protocol-gen-wizard__empty">提交协议描述后开始解析</div>
      )}
    </div>
  )
}
