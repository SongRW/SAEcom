import { useState, type ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
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
import { useSettingsStore } from '@/shared/store/settings'
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
import { chunksToPlainText, displayName } from '@/features/serial-panel/paneViewModel'
import type { Panel } from '@/features/serial-panel/types'

/** 归一化保留条数输入（对齐 legacy renderer.js:196 showLimitDialog onConfirm）：<=0 → 1000，<10 → 10 */
function normalizeLimitCount(raw: string): number {
  let val = parseInt(raw, 10)
  if (isNaN(val) || val <= 0) val = 1000
  if (val < 10) val = 10
  return val
}

interface PaneContextMenuProps {
  panel: Panel
  children: ReactNode
  /** 复用 FloatingPane 已有的 handlers，避免重复实现 */
  onToggleOpen: () => void
  onToggleLogging: () => void
  onExport: () => void
  onPopout: () => void
}

/**
 * 工作区面板右键菜单。对齐老项目 renderer.js:4845-4919 的 .pane 右键菜单。
 * ContextMenuTrigger 包裹面板内容；菜单项回调复用 FloatingPane 既有 handlers + store actions。
 * 清空/删除按 settings.confirmClear/confirmDelete 决定是否二次确认（与 PaneList 一致）。
 */
export function PaneContextMenu({ panel, children, onToggleOpen, onToggleLogging, onExport, onPopout }: PaneContextMenuProps) {
  const setHidden = usePanelsStore((s) => s.setHidden)
  const clearChunks = usePanelsStore((s) => s.clearChunks)
  const removePanel = usePanelsStore((s) => s.removePanel)
  const setNote = usePanelsStore((s) => s.setNote)
  const setLimit = usePanelsStore((s) => s.setLimit)
  const confirmClear = useSettingsStore((s) => s.confirmClear)
  const confirmDelete = useSettingsStore((s) => s.confirmDelete)
  const openScopePane = useOscilloscopeStore((s) => s.openPane)

  const [confirm, setConfirm] = useState<{ type: 'clear' | 'delete' } | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [limitOpen, setLimitOpen] = useState(false)

  function handleCopySelection() {
    const sel = window.getSelection?.()?.toString() || ''
    if (sel) navigator.clipboard?.writeText(sel).catch(() => {})
  }

  /** 复制全部：虚拟化滚动下跨行选择不可靠、非可视区不渲染，故提供全量复制通道 */
  function handleCopyAll() {
    const text = chunksToPlainText(panel.chunks, panel.viewMode)
    if (text) navigator.clipboard?.writeText(text).catch(() => {})
  }

  function handleRename() {
    setRenameOpen(true)
  }

  function handleClear() {
    if (confirmClear) setConfirm({ type: 'clear' })
    else clearChunks(panel.id)
  }

  function handleDelete() {
    if (confirmDelete) setConfirm({ type: 'delete' })
    else removePanel(panel.id)
  }

  function execConfirm() {
    if (!confirm) return
    if (confirm.type === 'clear') clearChunks(panel.id)
    else removePanel(panel.id)
    setConfirm(null)
  }

  const isOpen = panel.open
  const toggleText = isOpen ? (panel.type === 'tcp' ? '关闭连接' : '关闭串口') : (panel.type === 'tcp' ? '打开连接' : '打开串口')

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={onToggleLogging}>
            {panel.logging.active ? '停止记录实时数据' : '开始记录实时数据'}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => setLimitOpen(true)}>
            设置保留条数
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={handleCopySelection}>复制选中内容</ContextMenuItem>
          <ContextMenuItem onClick={handleCopyAll}>复制全部内容</ContextMenuItem>
          <ContextMenuItem onClick={onExport}>保存面板数据</ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={() => setHidden(panel.id, true)}>隐藏面板</ContextMenuItem>
          <ContextMenuItem onClick={onToggleOpen}>{toggleText}</ContextMenuItem>
          <ContextMenuItem onClick={onPopout}>弹出面板</ContextMenuItem>
          <ContextMenuItem onClick={handleClear}>清空面板</ContextMenuItem>
          <ContextMenuItem onClick={handleDelete} variant="destructive">删除面板</ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={handleRename}>添加备注</ContextMenuItem>
          <ContextMenuItem onClick={() => openScopePane(panel.id)}>
            打开示波器
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <PromptDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="备注"
        description="输入备注名（留空清除，≤15字）"
        defaultValue={panel.note || ''}
        maxLength={15}
        onConfirm={(v) => setNote(panel.id, v)}
      />

      <PromptDialog
        open={limitOpen}
        onOpenChange={setLimitOpen}
        title="设置数据保留条数"
        description="请输入要保留的最新数据行数：(录制日志时，此设置优先级高于默认的100条限制)"
        defaultValue={String(panel.limitCount)}
        onConfirm={(v) => setLimit(panel.id, true, normalizeLimitCount(v))}
        {...(panel.limitView
          ? {
              extraAction: {
                text: '关闭限制',
                onAction: () => {
                  setLimitOpen(false)
                  setLimit(panel.id, false, panel.limitCount)
                }
              }
            }
          : {})}
      />

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.type === 'delete' ? '删除面板' : '清空数据'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'delete'
                ? `确定删除面板「${displayName(panel)}」吗？此操作不可撤销。`
                : `确定清空面板「${displayName(panel)}」的所有数据吗？`}
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
