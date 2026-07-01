import { CaretDown as ChevronDown, CaretUp as ChevronUp, Trash as Trash2 } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ScriptOutputPanelProps {
  expanded: boolean
  lines: string[]
  onClear: () => void
  onToggle: () => void
}

export function ScriptOutputPanel({ expanded, lines, onClear, onToggle }: ScriptOutputPanelProps) {
  return (
    <section className={expanded ? 'script-editor-output is-expanded' : 'script-editor-output'} aria-label="脚本输出">
      <button className="script-editor-output__handle" onClick={onToggle} type="button" />
      <div className="script-editor-output__header">
        <span>输出</span>
        <div className="script-editor-output__actions">
          <Button size="icon" variant="ghost" title={expanded ? '收起' : '展开'} onClick={onToggle}>
            {expanded ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button size="icon" variant="ghost" title="清空" onClick={onClear}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="script-editor-output__body">
          {lines.length === 0 ? (
            <div className="script-editor-output__placeholder">运行脚本后显示输出...</div>
          ) : (
            lines.map((line, index) => {
              const isError = line.startsWith('[错误]')
              const isDone = line.startsWith('[完成]')
              return (
                <div className="script-editor-output__line" key={`${index}-${line}`}>
                  {isError ? <Badge variant="destructive">错误</Badge> : null}
                  {isDone ? <Badge variant="secondary">完成</Badge> : null}
                  <span>{line}</span>
                </div>
              )
            })
          )}
        </div>
      )}
    </section>
  )
}
