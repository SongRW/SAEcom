import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { ArrowSquareIn, Trash as Trash2 } from '@phosphor-icons/react'
import '@/shared/i18n'
import '@/styles/globals.css'
import '@/features/script-editor/script-editor.css'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TitleBarChrome } from '@/features/titlebar/TitleBarChrome'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import type { ScriptOutputLine } from '@shared/types'

function formatTs(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${hh}:${mm}:${ss}.${ms}`
}

/**
 * 脚本输出独立窗。
 * - 日志 source of truth 在 host（脚本编辑器）；本窗只显示 + 请求 clear/close
 * - 主题：挂载读 settings，并听 theme:apply
 */
function ScriptOutputPopout() {
  const ipc = useIPC()
  const [lines, setLines] = useState<ScriptOutputLine[]>([])
  const [scriptName, setScriptName] = useState('')
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const lineCount = lines.length

  useEffect(() => {
    const apply = (dark: boolean) => {
      const el = document.documentElement
      el.classList.toggle('dark', dark)
      el.classList.toggle('theme-dark', dark)
    }
    apply(useSettingsStore.getState().dark)
    return ipc.theme.onApply(({ dark }) => apply(!!dark))
  }, [ipc])

  useEffect(() => {
    const applyPayload = (payload: { lines?: ScriptOutputLine[]; scriptName?: string }) => {
      setLines(Array.isArray(payload?.lines) ? payload.lines : [])
      if (typeof payload?.scriptName === 'string') setScriptName(payload.scriptName)
    }
    const offPayload = ipc.scriptOutput.onPopoutPayload(applyPayload)
    const offSync = ipc.scriptOutput.onSync(applyPayload)
    // listener 已注册后主动拉取当前快照：main 的 did-finish-load 推送早于 React
    // mount，首包会落在未注册的 listener 上而丢失。这里在注册完成后请求一次，
    // main 回复走 onPopoutPayload（同一通道），保证初始内容（弹出前的日志）必达。
    ipc.scriptOutput.requestPayload()
    return () => {
      offPayload()
      offSync()
    }
  }, [ipc])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lineCount])

  const title = scriptName ? `脚本输出 · ${scriptName}` : '脚本输出'

  return (
    <div className="script-output-popout" data-testid="script-output-popout">
      <TitleBarChrome
        title={title}
        right={
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              title="清空"
              type="button"
              onClick={() => ipc.scriptOutput.requestClear()}
            >
              <Trash2 />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="嵌回编辑器"
              type="button"
              onClick={() => ipc.scriptOutput.requestClose()}
            >
              <ArrowSquareIn />
            </Button>
          </div>
        }
      />
      <div className="script-output-popout__body" data-testid="script-output-popout-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="script-editor-output-dock__placeholder">运行脚本后显示输出...</div>
        ) : (
          lines.map((line, index) => {
            const isError = line.text.startsWith('[错误]') || line.text.startsWith('[ERROR]')
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
  )
}

class ScriptOutputPopoutErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ScriptOutputPopout] render crashed:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>输出窗渲染失败：</div>
          {String(this.state.error?.message || this.state.error)}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ScriptOutputPopoutErrorBoundary>
      <ScriptOutputPopout />
    </ScriptOutputPopoutErrorBoundary>
  </React.StrictMode>
)
