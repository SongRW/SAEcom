import { Hand, MapTrifold as Map, Cursor as MousePointer2, Selection as SquareDashedMousePointer } from '@phosphor-icons/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CanvasTool } from '@/features/script-editor/uiState'

interface CanvasToolBarProps {
  value: CanvasTool
  minimapVisible: boolean
  onChange: (tool: CanvasTool) => void
  onToggleMinimap: () => void
}

const tools: Array<{
  value: CanvasTool
  label: string
  icon: typeof MousePointer2
}> = [
  { value: 'pointer', label: '指针', icon: MousePointer2 },
  { value: 'select', label: '选择', icon: SquareDashedMousePointer },
  { value: 'pan', label: '拖动画布', icon: Hand }
]

export function CanvasToolBar({ value, minimapVisible, onChange, onToggleMinimap }: CanvasToolBarProps) {
  return (
    <TooltipProvider delayDuration={180}>
      <div className="script-editor-canvas-tools" aria-label="鼠标操作">
        <ToggleGroup
          type="single"
          value={value}
          variant="outline"
          size="sm"
          onValueChange={(next) => {
            if (next) onChange(next as CanvasTool)
          }}
        >
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <Tooltip key={tool.value}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem aria-label={tool.label} value={tool.value}>
                    <Icon />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="bottom">{tool.label}</TooltipContent>
              </Tooltip>
            )
          })}
        </ToggleGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`script-editor-canvas-tools__minimap ${minimapVisible ? 'is-active' : ''}`}
              aria-pressed={minimapVisible}
              aria-label="缩略图"
              onClick={onToggleMinimap}
            >
              <Map />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">缩略图</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
