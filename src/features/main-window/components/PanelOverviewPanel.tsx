import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Circle, Plugs } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePanelsStore } from '@/features/serial-panel/store'

/**
 * 串口 tab 概览面板（只读 + 聚焦）。
 * 与侧栏 PaneList 互补：侧栏可折叠为图标，这里始终列出全部面板做概览。
 * 仅聚焦（setActive 写入活跃面板唯一真相源 activeId），不重复增删改。
 */
export function PanelOverviewPanel() {
  const { t } = useTranslation()
  const panels = usePanelsStore(useShallow((s) => s.listOrder.map((id) => s.panels[id]).filter(Boolean)))
  const activeId = usePanelsStore((s) => s.activeId)
  const setActive = usePanelsStore((s) => s.setActive)

  if (panels.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Plugs className="size-8" />
        <p className="text-sm">{t('mainWindow.panelOverview.empty')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b px-3 py-2 text-sm text-muted-foreground">
        {t('mainWindow.panelOverview.count', { count: panels.length })}
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {panels.map((p) => {
            const isActive = activeId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(p.id)}
                className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-accent ${isActive ? 'border-primary ring-1 ring-primary/30' : ''} ${p.hidden ? 'opacity-50' : ''}`}
              >
                <span className={p.open ? 'text-success' : 'text-muted-foreground'}>
                  <Circle className="size-3" weight={p.open ? 'fill' : 'regular'} />
                </span>
                <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{p.type}</span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
