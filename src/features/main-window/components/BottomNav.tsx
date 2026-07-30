import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Code } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useAppShell } from '@/shared/store/appShell'
import { getIPC } from '@/shared/ipc'
import type { ScriptEditorGraphPayload } from '@shared/types'
import { CommandsPage } from '@/features/commands/CommandsPage'
import { ActivePanelConfigPanel } from '@/features/main-window/components/ActivePanelConfigPanel'
import { ScriptEditorDialog } from '@/features/script-editor/ScriptEditorDialog'

/**
 * 主区底部内容面板。页面切换由 Sidebar Footer 驱动（appShell.activeTab）：
 * - serial：ActivePanelConfigPanel（当前选中面板的配置区，绑定 activeId）
 * - commands：CommandsPage
 * - script：脚本编辑器入口（ScriptEditorDialog 受控全屏对话框）
 * 「关于」已独立成单独窗口，不再在此。
 */
export function BottomNav() {
  const { t } = useTranslation()
  const activeTab = useAppShell((s) => s.activeTab)
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)
  // dock 回主窗时携带的图快照：存到 pendingGraphPayload，再把它作为 prop 交给重新挂载的
  // ScriptEditorDialog（挂载时消费一次，避免 dock 回后画布是空图、缩略图/拖动失效——问题2）。
  const [pendingGraphPayload, setPendingGraphPayload] = useState<ScriptEditorGraphPayload | null>(null)

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
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Code className="size-8" />
        <p className="text-sm">{t('mainWindow.bottomNav.scriptEditor')}</p>
        <Button variant="outline" size="sm" onClick={() => setScriptEditorOpen(true)}>
          {t('mainWindow.bottomNav.openScriptEditor')}
        </Button>
      </div>
    )
  } else {
    content = <ActivePanelConfigPanel />
  }

  return (
    <>
      <div className="h-full">{content}</div>
      <ScriptEditorDialog
        open={scriptEditorOpen}
        initialGraphPayload={pendingGraphPayload}
        onClose={() => setScriptEditorOpen(false)}
        onConsumedPayload={() => setPendingGraphPayload(null)}
      />
    </>
  )
}
