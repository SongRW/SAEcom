import { Button } from '@/components/ui/button'

interface ScriptListProps {
  scripts: string[]
  activeScriptName: string | null
  loading: boolean
  error: string | null
  onSelect: (name: string) => void
}

export function ScriptList({ scripts, activeScriptName, loading, error, onSelect }: ScriptListProps) {
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
          <Button
            key={name}
            variant={name === activeScriptName ? 'secondary' : 'ghost'}
            className="script-editor-list__item justify-start"
            onClick={() => onSelect(name)}
          >
            {name}
          </Button>
        ))}
      </div>
    </div>
  )
}
