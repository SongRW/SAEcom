import { PushPin, PushPinSlash, ArrowsOutCardinal, Eye, EyeSlash, Power, Code, TextAa, NotePencil, DownloadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { Panel } from '@/features/serial-panel/types'
import { displayName } from '@/features/serial-panel/paneViewModel'

interface PaneHeaderProps {
  panel: Panel
  onToggleOpen: () => void
  onToggleHex: () => void
  onTogglePin: () => void
  onHide: () => void
  onPopout: () => void
  onToggleLogging: () => void
  onExport: () => void
}

/**
 * 面板标题栏。镜像 legacy .title 按钮 + 名称。
 * 按钮：pin / 打开 / 文本HEX / 日志 / 导出 / 弹出 / 隐藏。
 * data-pane-header-drag 标识拖拽 handle（usePaneDrag 仅标题栏可拖）。
 */
export function PaneHeader({ panel, onToggleOpen, onToggleHex, onTogglePin, onHide, onPopout, onToggleLogging, onExport }: PaneHeaderProps) {
  return (
    <div className="flex h-8 items-center gap-1 border-b bg-muted/40 px-2">
      <span className="flex-1 truncate text-sm font-medium select-none" data-pane-header-drag>
        {displayName(panel)}
      </span>
      <Button variant="ghost" size="icon" className="size-7" onClick={onTogglePin} title={panel.pinned ? '取消置顶' : '置顶'}>
        {panel.pinned ? <PushPinSlash className="size-4" weight="fill" /> : <PushPin className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`size-7 ${panel.open ? 'text-success' : 'text-muted-foreground'}`}
        onClick={onToggleOpen}
        title={panel.open ? '关闭' : '打开'}
      >
        <Power className="size-4" weight={panel.open ? 'fill' : 'regular'} />
      </Button>
      <Button variant="ghost" size="icon" className="size-7" onClick={onToggleHex} title="文本/HEX 切换">
        {panel.viewMode === 'hex' ? <Code className="size-4" /> : <TextAa className="size-4" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={`size-7 ${panel.logging.active ? 'text-primary' : 'text-muted-foreground'}`}
        onClick={onToggleLogging}
        title={panel.logging.active ? '停止记录日志' : '记录日志到文件'}
      >
        <NotePencil className="size-4" weight={panel.logging.active ? 'fill' : 'regular'} />
      </Button>
      <Button variant="ghost" size="icon" className="size-7" onClick={onExport} title="导出数据">
        <DownloadSimple className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="size-7" onClick={onPopout} title="弹出独立窗口">
        <ArrowsOutCardinal className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="size-7" onClick={onHide} title="隐藏">
        {panel.hidden ? <Eye className="size-4" /> : <EyeSlash className="size-4" />}
      </Button>
    </div>
  )
}
