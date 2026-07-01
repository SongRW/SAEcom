import type { ReactNode } from 'react'
import { SidebarSimple as PanelLeftClose } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface ScriptEditorSidePanelProps {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
}

export function ScriptEditorSidePanel({ title, subtitle, children, onClose }: ScriptEditorSidePanelProps) {
  return (
    <aside className="script-editor-sidepanel" aria-label={title}>
      <div className="script-editor-sidepanel__header">
        <div>
          <div className="script-editor-drawer__title">{title}</div>
          {subtitle ? <div className="script-editor-drawer__subtitle">{subtitle}</div> : null}
        </div>
        <Button size="icon" variant="ghost" title="收起" type="button" onClick={onClose}>
          <PanelLeftClose />
        </Button>
      </div>
      <div className="script-editor-sidepanel__body">{children}</div>
    </aside>
  )
}
