/**
 * 介入输入框（pi agent 的 Enter/Alt+Enter/Esc 三档）。
 *
 * - Enter → steering（下个安全边界注入，改方向）
 * - Shift+Enter → follow-up（当前 run 结束后开新轮）
 * - Esc → abort（中止）
 *
 * 也提供按钮入口，便于无键盘和 E2E 点击。
 */
import { useState, useCallback, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowBendUpLeft, ArrowRight, Stop } from '@phosphor-icons/react'

interface SteeringInputProps {
  onSteer: (text: string) => void
  onFollowUp: (text: string) => void
  onAbort: () => void
  disabled?: boolean
}

export function SteeringInput({ onSteer, onFollowUp, onAbort, disabled }: SteeringInputProps) {
  const [value, setValue] = useState('')

  const submitSteer = useCallback(() => {
    const text = value.trim()
    if (!text) return
    onSteer(text)
    setValue('')
  }, [value, onSteer])

  const submitFollowUp = useCallback(() => {
    const text = value.trim()
    if (!text) return
    onFollowUp(text)
    setValue('')
  }, [value, onFollowUp])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault()
      submitSteer()
    } else if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      submitFollowUp()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onAbort()
    }
  }, [submitSteer, submitFollowUp, onAbort])

  return (
    <div className="protocol-gen-wizard__steering" data-testid="steering-input">
      <textarea
        className="protocol-gen-wizard__steering-textarea"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? '解析完成后可介入…' : '纠偏/追问（Enter=纠偏 · Alt+Enter=追问 · Esc=中止）'}
        disabled={disabled}
        rows={2}
        data-testid="steering-textarea"
      />
      <div className="protocol-gen-wizard__steering-actions">
        <Button size="sm" variant="outline" onClick={submitSteer} disabled={disabled || !value.trim()} data-testid="steer-btn">
          <ArrowBendUpLeft size={14} weight="bold" />
          纠偏
        </Button>
        <Button size="sm" variant="ghost" onClick={submitFollowUp} disabled={disabled || !value.trim()} data-testid="followup-btn">
          <ArrowRight size={14} weight="bold" />
          追问
        </Button>
        <Button size="sm" variant="destructive" onClick={onAbort} disabled={disabled} data-testid="abort-btn">
          <Stop size={14} weight="bold" />
          中止
        </Button>
      </div>
    </div>
  )
}
