import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  CaretDown as ChevronDown,
  TerminalWindow as TerminalSquare,
  Trash as Trash2
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import type { OutputLine } from '@/features/script-editor/store'

/** 展开默认高度；可拖顶部 grip 调整。 */
export const OUTPUT_DOCK_DEFAULT_HEIGHT = 168
export const OUTPUT_DOCK_MIN_HEIGHT = 96
export const OUTPUT_DOCK_MAX_HEIGHT = 520

interface ScriptOutputPanelProps {
  expanded: boolean
  lines: OutputLine[]
  /** 弹出独立窗时；未传则隐藏弹出按钮（如已在独立窗内）。 */
  onPopout?: () => void
  /** 输出已弹出时 host 侧可收起 dock 面板，只留提示。 */
  poppedOut?: boolean
  onClear: () => void
  onToggle: () => void
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

/** 输出 dock 高度限幅：不低于 MIN，不高于 MAX，且不超过 shell 的 72%。 */
export function clampOutputHeight(value: number, shellHeight: number): number {
  const maxByShell = shellHeight > 0
    ? Math.max(OUTPUT_DOCK_MIN_HEIGHT, Math.floor(shellHeight * 0.72))
    : OUTPUT_DOCK_MAX_HEIGHT
  const max = Math.min(OUTPUT_DOCK_MAX_HEIGHT, maxByShell)
  return Math.min(max, Math.max(OUTPUT_DOCK_MIN_HEIGHT, Math.round(value)))
}

/**
 * 底部输出 dock：叠在画布上，不占 dialog 纵向布局。
 * - 收起：右下角小按钮
 * - 展开：轻量底栏；顶部 grip 可拖高度
 * - 可弹出独立输出窗（onPopout）
 */
export function ScriptOutputPanel({
  expanded,
  lines,
  onPopout,
  poppedOut = false,
  onClear,
  onToggle
}: ScriptOutputPanelProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLElement | null>(null)
  const [height, setHeight] = useState(OUTPUT_DOCK_DEFAULT_HEIGHT)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const lineCount = lines.length
  const showPanel = expanded && !poppedOut

  useEffect(() => {
    if (!showPanel) return
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [showPanel, lineCount])

  useEffect(() => {
    if (!showPanel) return
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const shell = rootRef.current?.offsetParent as HTMLElement | null
      const next = clampOutputHeight(
        drag.startHeight + (drag.startY - event.clientY),
        shell?.clientHeight ?? 0
      )
      setHeight(next)
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [showPanel])

  return (
    <aside
      ref={rootRef}
      aria-label="脚本输出"
      className={showPanel ? 'script-editor-output-dock is-expanded' : 'script-editor-output-dock'}
      data-testid="script-output-dock"
      data-expanded={showPanel ? 'true' : 'false'}
      data-popped-out={poppedOut ? 'true' : 'false'}
      style={showPanel ? { height } : undefined}
    >
      <TooltipProvider delayDuration={180}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={showPanel ? '收起输出' : poppedOut ? '输出已弹出' : '展开输出'}
              aria-pressed={showPanel}
              className="script-editor-output-dock__handle"
              data-testid="script-output-handle"
              size="icon"
              title={showPanel ? '收起输出' : poppedOut ? '输出已弹出独立窗口' : '展开输出'}
              type="button"
              variant={showPanel || lineCount > 0 || poppedOut ? 'secondary' : 'outline'}
              onClick={() => {
                if (poppedOut) {
                  onPopout?.()
                  return
                }
                onToggle()
              }}
            >
              <TerminalSquare />
              {lineCount > 0 ? (
                <span className="script-editor-output-dock__badge" aria-hidden="true">
                  {lineCount > 99 ? '99+' : lineCount}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {poppedOut ? '聚焦输出独立窗口' : showPanel ? '收起输出' : '展开输出'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="script-editor-output-dock__panel" aria-hidden={!showPanel}>
        <div
          className="script-editor-output-dock__grip"
          data-testid="script-output-grip"
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整输出高度"
          title="拖动调整高度"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            event.stopPropagation()
            dragRef.current = { startY: event.clientY, startHeight: height }
            ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
          }}
        />
        <div className="script-editor-output-dock__header">
          <div className="script-editor-output-dock__title">
            <span>输出</span>
            {lineCount > 0 ? (
              <span className="script-editor-output-dock__count">{lineCount}</span>
            ) : null}
          </div>
          <div className="script-editor-output-dock__actions">
            {onPopout ? (
              <Button
                size="icon"
                title="弹出独立窗口"
                type="button"
                variant="ghost"
                data-testid="script-output-popout"
                onClick={onPopout}
              >
                <ArrowSquareOut />
              </Button>
            ) : null}
            <Button size="icon" title="清空" type="button" variant="ghost" onClick={onClear}>
              <Trash2 />
            </Button>
            <Button size="icon" title="收起" type="button" variant="ghost" onClick={onToggle}>
              <ChevronDown />
            </Button>
          </div>
        </div>
        <div className="script-editor-output-dock__body" data-testid="script-output-body" ref={bodyRef}>
          {lines.length === 0 ? (
            <div className="script-editor-output-dock__placeholder">运行脚本后显示输出...</div>
          ) : (
            lines.map((line, index) => {
              const isError = line.text.startsWith('[错误]')
              const isDone = line.text.startsWith('[完成]')
              return (
                <div className="script-editor-output-dock__line" key={`${index}-${line.ts}-${line.text}`}>
                  <span className="script-editor-output-dock__ts">{formatTs(line.ts)}</span>
                  {isError ? <Badge variant="destructive">错误</Badge> : null}
                  {isDone ? <Badge variant="secondary">完成</Badge> : null}
                  <span>{line.text}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </aside>
  )
}
