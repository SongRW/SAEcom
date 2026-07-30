import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import '@/shared/i18n'
import '@/styles/globals.css'
import '@/features/script-editor/script-editor.css'
import { ScriptEditorDialog } from '@/features/script-editor/ScriptEditorDialog'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'

/**
 * 脚本编辑器弹出独立窗 renderer。
 * - 全屏铺满（is-popout 模式无 backdrop、无内窗圆角）
 * - 复用主窗同一套 ScriptEditorDialog 组件树（画布/调色板/节点配置/输出/工具栏）
 * - 跨进程运行时（scripts/serial/config）经 preload 共享，全功能独立
 * - 主题跟随主窗：独立窗不共享主窗 zustand store，挂载时按本地设置初始化
 *   .dark/.theme-dark，并监听主窗广播的 theme:apply 实时切换（否则深色模式下
 *   --card/--background 不进入 dark 变量，输出栏等 var(--card) 会渲染成白色块）。
 */
function ScriptEditorPopout() {
  const ipc = useIPC()

  useEffect(() => {
    const apply = (dark: boolean) => {
      const el = document.documentElement
      el.classList.toggle('dark', dark)
      el.classList.toggle('theme-dark', dark)
    }
    apply(useSettingsStore.getState().dark)
    const handler = ({ dark }: { dark: boolean }) => apply(!!dark)
    return ipc.theme.onApply(handler)
  }, [ipc])

  return (
    <div className="h-screen w-screen">
      <ScriptEditorDialog isPopout open onClose={() => window.close()} />
    </div>
  )
}

class ScriptEditorPopoutErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ScriptEditorPopout] render crashed:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>脚本编辑器渲染失败：</div>
          {String(this.state.error?.message || this.state.error)}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ScriptEditorPopoutErrorBoundary>
      <ScriptEditorPopout />
    </ScriptEditorPopoutErrorBoundary>
  </React.StrictMode>
)
