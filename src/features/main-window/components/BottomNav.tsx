import { useEffect, useState } from 'react'
import { useAppShell } from '@/shared/store/appShell'
import { getIPC } from '@/shared/ipc'
import type { ScriptEditorGraphPayload } from '@shared/types'
import { CommandsPage } from '@/features/commands/CommandsPage'
import { ActivePanelConfigPanel } from '@/features/main-window/components/ActivePanelConfigPanel'
import { ScriptHub } from '@/features/main-window/components/ScriptHub'
import type { ScriptEditorSidePanel } from '@/features/script-editor/uiState'
import { ScriptEditorDialog } from '@/features/script-editor/ScriptEditorDialog'

/**
 * 主区底部内容面板。页面切换由 Sidebar Footer 驱动（appShell.activeTab）：
 * - serial：ActivePanelConfigPanel（当前选中面板的配置区，绑定 activeId）
 * - commands：CommandsPage
 * - script：ScriptHub（脚本功能区启动台 + 概览），点击其主操作打开 ScriptEditorDialog
 * 注：settings 页由 MainWindow 顶层整区渲染（完整覆盖工作区），不在此面板内。
 * 「关于」已独立成单独窗口，不再在此。
 */
export function BottomNav() {
  const activeTab = useAppShell((s) => s.activeTab)
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)
  /** 主页脚本列表的单次打开请求；由 ScriptEditorDialog 完整加载后消费。 */
  const [initialScriptName, setInitialScriptName] = useState<string | null>(null)
  /** 主页组件库入口的单次侧栏请求；由 ScriptEditorDialog 初始化后消费。 */
  const [initialSidePanel, setInitialSidePanel] = useState<ScriptEditorSidePanel | null>(null)
  // dock 回主窗时携带的图快照：存到 pendingGraphPayload，再把它作为 prop 交给重新挂载的
  // ScriptEditorDialog（挂载时消费一次，避免 dock 回后画布是空图、缩略图/拖动失效——问题2）。
  const [pendingGraphPayload, setPendingGraphPayload] = useState<ScriptEditorGraphPayload | null>(null)
  /** 编辑器关闭计数：每次关闭自增，驱动 ScriptHub 重新拉取列表（脚本/组件增删后主页刷新）。 */
  const [editorClosedTick, setEditorClosedTick] = useState(0)

  // 弹出窗 dock 回主窗：收到 script-editor:dock（携带弹窗带回的图快照）时重新显示内嵌弹层。
  useEffect(() => {
    const ipc = getIPC()
    if (!ipc.scriptEditor?.onDock) return
    return ipc.scriptEditor.onDock((payload) => {
      setPendingGraphPayload(payload || null)
      setScriptEditorOpen(true)
    })
  }, [])

  let content: React.ReactNode
  if (activeTab === 'commands') {
    content = <CommandsPage />
  } else if (activeTab === 'script') {
    content = <ScriptHub
      refreshKey={editorClosedTick}
      onOpenEditor={(options) => {
        setInitialScriptName(options?.initialScriptName || null)
        setInitialSidePanel(options?.initialSidePanel || null)
        setScriptEditorOpen(true)
      }} />
  } else {
    content = <ActivePanelConfigPanel />
  }

  return (
    <>
      <div className="h-full">{content}</div>
      <ScriptEditorDialog
        open={scriptEditorOpen}
        initialGraphPayload={pendingGraphPayload}
        initialScriptName={initialScriptName}
        initialSidePanel={initialSidePanel}
        onClose={() => { setScriptEditorOpen(false); setEditorClosedTick((t) => t + 1) }}
        onConsumedInitialScript={() => setInitialScriptName(null)}
        onConsumedInitialSidePanel={() => setInitialSidePanel(null)}
        onConsumedPayload={() => setPendingGraphPayload(null)}
      />
    </>
  )
}
