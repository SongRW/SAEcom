import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/shared/i18n'
import '@/styles/globals.css'
import '@/features/script-editor/script-editor.css'
import { ScriptEditorDialog } from '@/features/script-editor/ScriptEditorDialog'

/**
 * 脚本编辑器弹出独立窗 renderer。
 * - 全屏铺满（is-popout 模式无 backdrop、无内窗圆角）
 * - 复用主窗同一套 ScriptEditorDialog 组件树（画布/调色板/节点配置/输出/工具栏）
 * - 跨进程运行时（scripts/serial/config）经 preload 共享，全功能独立
 */
function ScriptEditorPopout() {
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
