/**
 * 折叠工具日志（pi agent 的工具全可观测）。
 *
 * 一对 tool_call + tool_result 渲染为一个折叠块：
 * - 折叠态：显示工具名 + 一行结果摘要
 * - 展开态：显示完整 args / result JSON
 */
import { useState } from 'react'
import { CaretDown, CaretRight, Wrench } from '@phosphor-icons/react'
import type { ProtocolGenEvent } from '@/features/script-editor/protocol-gen/protocolGenEngine'

interface ToolLogFoldProps {
  events: ProtocolGenEvent[]
  defaultOpen?: boolean
}

function summarize(result: unknown): string {
  if (result === null || result === undefined) return ''
  if (typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if ('count' in obj) return `count=${obj.count}`
    if ('fields' in obj) return `fields=${obj.fields}`
    if ('matched' in obj) return `matched=${obj.matched}`
    return JSON.stringify(result).slice(0, 60)
  }
  return String(result).slice(0, 60)
}

export function ToolLogFold({ events, defaultOpen = false }: ToolLogFoldProps) {
  const [open, setOpen] = useState(defaultOpen)
  const call = events.find((e) => e.type === 'tool_call')
  const result = events.find((e) => e.type === 'tool_result')
  if (!call || call.type !== 'tool_call') return null
  const toolName = call.tool
  const resultText = result && result.type === 'tool_result' ? summarize(result.result) : ''

  return (
    <div className="protocol-gen-wizard__tool-log" data-testid={`tool-${toolName}`}>
      <button
        type="button"
        className="protocol-gen-wizard__tool-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" />}
        <Wrench size={11} weight="bold" />
        <span className="protocol-gen-wizard__tool-name">{toolName}</span>
        {resultText && <span className="protocol-gen-wizard__tool-summary">→ {resultText}</span>}
      </button>
      {open && (
        <div className="protocol-gen-wizard__tool-body">
          {call.args !== undefined && (
            <div>
              <span className="protocol-gen-wizard__tool-label">args:</span>
              <pre>{JSON.stringify(call.args, null, 2)}</pre>
            </div>
          )}
          {result && result.type === 'tool_result' && (
            <div>
              <span className="protocol-gen-wizard__tool-label">result:</span>
              <pre>{JSON.stringify(result.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
