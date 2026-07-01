import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

type ScriptEditorDrawerPlacement = 'left' | 'right'

interface ScriptEditorDrawerProps {
  children: ReactNode
  open: boolean
  placement?: ScriptEditorDrawerPlacement
  subtitle?: string
  title: string
  onClose: () => void
}

export function ScriptEditorDrawer({
  children,
  open,
  placement = 'right',
  subtitle,
  title,
  onClose
}: ScriptEditorDrawerProps) {
  if (!open) return null

  return (
    <aside className={`script-editor-drawer script-editor-drawer--${placement}`} aria-label={title}>
      <div className="script-editor-drawer__header">
        <div>
          <div className="script-editor-drawer__title">{title}</div>
          {subtitle && <div className="script-editor-drawer__subtitle">{subtitle}</div>}
        </div>
        <Button size="icon" title="关闭" variant="ghost" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="script-editor-drawer__body">{children}</div>
    </aside>
  )
}
