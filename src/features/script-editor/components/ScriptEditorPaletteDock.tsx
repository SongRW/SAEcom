import type { ReactNode } from 'react'
import { SquaresFour as Blocks, SidebarSimple as PanelLeftClose, PushPin as Pin, PushPinSlash as PinOff, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader
} from '@/components/ui/card'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'

interface ScriptEditorPaletteDockProps {
  children: ReactNode
  autoCollapseOnConfigOpen: boolean
  expanded: boolean
  onToggleAutoCollapse: () => void
  onToggle: () => void
}

export function ScriptEditorPaletteDock({
  autoCollapseOnConfigOpen,
  children,
  expanded,
  onToggleAutoCollapse,
  onToggle
}: ScriptEditorPaletteDockProps) {
  return (
    <aside
      aria-label="组件库"
      className={expanded ? 'script-editor-palette-dock is-expanded' : 'script-editor-palette-dock'}
    >
      <TooltipProvider delayDuration={180}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={expanded ? '收起组件库' : '展开组件库'}
              aria-pressed={expanded}
              className="script-editor-palette-dock__handle"
              size="icon"
              title={expanded ? '收起组件库' : '展开组件库'}
              type="button"
              variant={expanded ? 'secondary' : 'outline'}
              onClick={onToggle}
            >
              <Blocks />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{expanded ? '收起组件库' : '展开组件库'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Card className="script-editor-palette-dock__panel" aria-hidden={!expanded}>
        <CardHeader className="script-editor-palette-dock__header">
          <div>
            <div className="script-editor-drawer__title">组件</div>
            <div className="script-editor-drawer__subtitle">选择或拖拽组件到画布</div>
          </div>
          <div className="script-editor-palette-dock__actions">
            <TooltipProvider delayDuration={180}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    aria-label="打开配置时自动收起组件库"
                    aria-pressed={autoCollapseOnConfigOpen}
                    pressed={autoCollapseOnConfigOpen}
                    size="sm"
                    title="打开配置时自动收起组件库"
                    type="button"
                    variant="outline"
                    onPressedChange={onToggleAutoCollapse}
                  >
                    {autoCollapseOnConfigOpen ? <PinOff /> : <Pin />}
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {autoCollapseOnConfigOpen ? '配置打开时自动收起：开' : '配置打开时自动收起：关'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button size="icon" title="收起" type="button" variant="ghost" onClick={onToggle}>
              <PanelLeftClose />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="script-editor-palette-dock__body">{children}</CardContent>
      </Card>
    </aside>
  )
}
