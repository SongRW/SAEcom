import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

interface ScriptListProps {
  scripts: string[]
  activeScriptName: string | null
  loading: boolean
  error: string | null
  onSelect: (name: string) => void
  onRename: (name: string) => void
  onDelete: (name: string) => void
  onExport: (name: string) => void
}

export function ScriptList({ scripts, activeScriptName, loading, error, onSelect, onRename, onDelete, onExport }: ScriptListProps) {
  return (
    <div className="script-editor-list" aria-label="脚本列表">
      <div className="script-editor-list__heading">脚本列表</div>
      {loading && <div className="script-editor-list__meta">加载中...</div>}
      {error && <div className="script-editor-list__error">{error}</div>}
      {!loading && !error && scripts.length === 0 && (
        <div className="script-editor-list__meta">暂无脚本</div>
      )}
      <div className="script-editor-list__items">
        {scripts.map((name) => (
          <ContextMenu key={name}>
            <ContextMenuTrigger asChild>
              <Button
                variant={name === activeScriptName ? 'secondary' : 'ghost'}
                className="script-editor-list__item justify-start w-full"
                onClick={() => onSelect(name)}
              >
                {name}
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onRename(name)}>重命名</ContextMenuItem>
              <ContextMenuItem onClick={() => onExport(name)}>导出</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={() => onDelete(name)}>删除</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    </div>
  )
}
