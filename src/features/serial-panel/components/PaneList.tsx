import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Trash, Broom, PencilSimple, DotsThreeVertical, Check } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { PromptDialog } from '@/components/ui/prompt-dialog'
import { usePanelsStore } from '@/features/serial-panel/store'
import { formatUnread, displayName } from '@/features/serial-panel/paneViewModel'
import { exportPanelLog } from '@/features/serial-panel/exportLog'
import { PaneContextMenu } from '@/features/serial-panel/components/PaneContextMenu'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'

/**
 * 面板列表（Sidebar 内）。镜像 legacy refreshPanelList。
 * 每行：连接状态(点击开关) + 名称(点击聚焦/双击重命名) + 清空(确认) + 删除(确认) + 重命名。
 */
export function PaneList({ onNewPanel }: { onNewPanel: () => void }) {
  const panels = usePanelsStore(useShallow((s) => s.listOrder.map((id) => s.panels[id]).filter(Boolean)))
  const setActive = usePanelsStore((s) => s.setActive)
  const removePanel = usePanelsStore((s) => s.removePanel)
  const clearChunks = usePanelsStore((s) => s.clearChunks)
  const togglePanelOpen = usePanelsStore((s) => s.togglePanelOpen)
  const setNote = usePanelsStore((s) => s.setNote)
  const reorderList = usePanelsStore((s) => s.reorderList)
  const setHidden = usePanelsStore((s) => s.setHidden)
  const setAutoScroll = usePanelsStore((s) => s.setAutoScroll)
  const setLogging = usePanelsStore((s) => s.setLogging)
  const ipc = useIPC()
  const confirmClear = useSettingsStore((s) => s.confirmClear)
  const confirmDelete = useSettingsStore((s) => s.confirmDelete)

  const [confirm, setConfirm] = useState<{ type: 'clear' | 'delete'; id: string; name: string } | null>(null)
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function handleClear(id: string, name: string) {
    if (confirmClear) {
      setConfirm({ type: 'clear', id, name })
    } else {
      clearChunks(id)
    }
  }

  function handleDelete(id: string, name: string) {
    if (confirmDelete) {
      setConfirm({ type: 'delete', id, name })
    } else {
      removePanel(id)
    }
  }

  function handleRename(id: string, current: string) {
    setRename({ id, name: current })
  }

  /**
   * 点击面板名：toggle 显示/隐藏。
   * - 已显示：隐藏（与「点一下显示、再点一下取消显示」的旧交互一致）。
   * - 已隐藏：显示 + 置顶 + 滚到底（顺带清零未读）。setAutoScroll(true) 触发 DataDisplay
   *   既有滚动 effect：false→true 时 effect 重跑；从隐藏→显示时 FloatingPane 重挂载、
   *   DataDisplay 首次 effect 也会因 autoScroll=true 滚到底。
   * 隐藏入口不止此处：标题栏 Eye 按钮 / 右键菜单 亦可隐藏。
   */
  function handleToggle(id: string, hidden: boolean) {
    if (!hidden) {
      setHidden(id, true)
      return
    }
    setHidden(id, false)
    setActive(id)
    setAutoScroll(id, true)
  }

  function execConfirm() {
    if (!confirm) return
    if (confirm.type === 'clear') clearChunks(confirm.id)
    else removePanel(confirm.id)
    setConfirm(null)
  }

  if (panels.length === 0) {
    return (
      <div className="px-2 py-1 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onNewPanel}>
          （新建面板）
        </Button>
      </div>
    )
  }

  return (
    <>
      <ScrollArea className="h-full w-full min-w-0 overflow-hidden [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex w-full min-w-0 flex-col gap-0.5 p-1">
          {panels.map((p, idx) => (
            <PaneContextMenu
              key={p.id}
              panel={p}
              onToggleOpen={() => togglePanelOpen(p.id)}
              onToggleLogging={async () => {
                if (p.logging.active) {
                  setLogging(p.id, false, null)
                } else {
                  try {
                    const path = await ipc.logger.pickFile()
                    if (path) setLogging(p.id, true, path)
                  } catch {
                    /* web 预览无 ipc */
                  }
                }
              }}
              onExport={() => { void exportPanelLog(p) }}
              onPopout={() => {
                try {
                  ipc.panel.popout(
                    p.id,
                    p.name,
                    JSON.stringify(p.chunks),
                    p.pinned,
                    p.open,
                    p.viewMode,
                    JSON.stringify(p.options)
                  )
                  setHidden(p.id, true)
                } catch {
                  /* web 预览无 ipc */
                }
              }}
            >
            <div
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(idx)
              }}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== idx) reorderList(dragIndex, idx)
                setDragIndex(null)
                setOverIndex(null)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setOverIndex(null)
              }}
              className={`group flex w-full min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 py-1 text-sm hover:bg-accent ${p.hidden ? 'opacity-50' : ''} ${overIndex === idx && dragIndex !== null && dragIndex !== idx ? 'border-t-2 border-primary' : ''} ${dragIndex === idx ? 'opacity-40' : ''}`}
            >
              <button
                type="button"
                className={`grid size-4 shrink-0 place-items-center rounded-[4px] ${p.open ? 'bg-success' : 'bg-primary'}`}
                title={p.open ? '点击断开' : '点击连接'}
                onClick={() => togglePanelOpen(p.id)}
              >
                {p.open && <Check className="size-3 text-white" weight="bold" />}
              </button>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-start gap-1 text-left"
                title={displayName(p) + '（双击重命名）'}
                onClick={() => handleToggle(p.id, p.hidden)}
                onDoubleClick={() => handleRename(p.id, p.note)}
              >
                <span className="truncate">{displayName(p)}</span>
                {(() => {
                  const badge = formatUnread(p.unread)
                  return badge ? (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
                      {badge}
                    </span>
                  ) : null
                })()}
              </button>
              <div className="grid h-6 w-[80px] shrink-0 grid-cols-1 place-items-end overflow-hidden">
                {/* 默认态：淡色 ⋮（功能发现信号）。与下方按钮组叠在同一 grid 格内，靠 opacity 互斥；grid 而非 absolute，规避层叠/定位陷阱 */}
                <DotsThreeVertical
                  weight="bold"
                  className="row-start-1 col-start-1 pointer-events-none size-5 text-muted-foreground transition-opacity group-hover:opacity-0"
                />
                {/* hover 态：3 个操作按钮 */}
                <div className="row-start-1 col-start-1 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    title="添加备注"
                    onClick={() => handleRename(p.id, p.note)}
                  >
                    <PencilSimple className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    title="清空数据"
                    onClick={() => handleClear(p.id, displayName(p))}
                  >
                    <Broom className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-destructive hover:text-destructive"
                    title="删除面板"
                    onClick={() => handleDelete(p.id, displayName(p))}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            </PaneContextMenu>
          ))}
        </div>
      </ScrollArea>

      <PromptDialog
        open={!!rename}
        onOpenChange={(open) => !open && setRename(null)}
        title="备注"
        description="输入备注名（留空清除，≤15字）"
        defaultValue={rename?.name ?? ''}
        maxLength={15}
        onConfirm={(v) => {
          if (rename) setNote(rename.id, v)
          setRename(null)
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.type === 'delete' ? '删除面板' : '清空数据'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'delete'
                ? `确定删除面板「${confirm?.name}」吗？此操作不可撤销。`
                : `确定清空面板「${confirm?.name}」的所有数据吗？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={execConfirm}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
