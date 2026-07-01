import {
  ArrowsInCardinal,
  ArrowsOutCardinal,
  FilePlus as FilePlus2,
  FloppyDisk as Save,
  FrameCorners,
  Minus,
  Play,
  PushPin,
  Stop as Square,
  Trash as Trash2,
  X,
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ScriptEditorWindowMode } from '@/features/script-editor/uiState'

interface ToolbarProps {
  activeScriptName: string | null
  running: boolean
  windowMode: ScriptEditorWindowMode
  isPopout: boolean
  /** 图形损坏（如 JSON 解析失败）时禁用保存，避免空图覆盖原文件。 */
  saveDisabled?: boolean
  onNew: () => void
  onSave: () => void
  onDelete: () => void
  onRun: () => void
  onStop: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onOpenScripts: () => void
  onToggleMaximize: () => void
  onMinimize: () => void
  onPopout: () => void
  onDock: () => void
  onClose: () => void
}

export function Toolbar({
  activeScriptName,
  running,
  windowMode,
  isPopout,
  saveDisabled,
  onNew,
  onSave,
  onDelete,
  onRun,
  onStop,
  onZoomIn,
  onZoomOut,
  onOpenScripts,
  onToggleMaximize,
  onMinimize,
  onPopout,
  onDock,
  onClose
}: ToolbarProps) {
  return (
    <div className="script-editor-toolbar">
      <button className="script-editor-toolbar__title" onClick={onOpenScripts} type="button">
        <span className="script-editor-title">脚本页</span>
        <span className="script-editor-current">{activeScriptName || '未选中'}</span>
      </button>
      <div className="script-editor-toolbar__actions">
        <Button size="sm" variant="outline" title="新建" onClick={onNew}>
          <FilePlus2 data-icon="inline-start" />
          新建
        </Button>
        <Button size="sm" variant="outline" title="保存" onClick={onSave} disabled={saveDisabled}>
          <Save data-icon="inline-start" />
          保存
        </Button>
        <Button size="sm" variant="outline" title="删除" onClick={onDelete} disabled={!activeScriptName}>
          <Trash2 data-icon="inline-start" />
          删除
        </Button>
        <span className="script-editor-separator" />
        <Button size="sm" title="运行" onClick={onRun} disabled={running}>
          <Play data-icon="inline-start" />
          运行
        </Button>
        <Button size="sm" variant="destructive" title="停止" onClick={onStop} disabled={!running}>
          <Square data-icon="inline-start" />
          停止
        </Button>
        <span className="script-editor-window-controls">
          <Button size="icon" variant="ghost" title="缩小" onClick={onZoomOut}>
            <ZoomOut />
          </Button>
          <Button size="icon" variant="ghost" title="放大" onClick={onZoomIn}>
            <ZoomIn />
          </Button>
          {isPopout ? (
            <Button size="icon" variant="ghost" title="回到主窗口" onClick={onDock}>
              <ArrowsInCardinal />
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                title={windowMode === 'maximized' ? '还原' : '最大化'}
                onClick={onToggleMaximize}
              >
                {windowMode === 'maximized' ? <ArrowsInCardinal /> : <ArrowsOutCardinal />}
              </Button>
              <Button size="icon" variant="ghost" title="最小化" onClick={onMinimize}>
                <Minus />
              </Button>
              <Button size="icon" variant="ghost" title="弹出为独立窗口" onClick={onPopout}>
                <PushPin />
              </Button>
              <Button size="icon" variant="ghost" title="关闭" onClick={onClose}>
                <X />
              </Button>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
