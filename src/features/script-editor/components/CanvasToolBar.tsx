import {
  Code as CodeIcon,
  Hand,
  MapTrifold as Map,
  Cursor as MousePointer2,
  Selection as SquareDashedMousePointer,
  TreeStructure
} from '@phosphor-icons/react'
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
  onArrangeLayout?: () => void
  /** 当前脚本带 legacy 源码（纯代码脚本）；为 true 时显示「查看源码」按钮 */
  hasLegacyCode?: boolean
  onShowCode?: () => void
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

export function CanvasToolBar({
  value,
  minimapVisible,
  onChange,
  onToggleMinimap,
  onArrangeLayout,
  hasLegacyCode = false,
  onShowCode
}: CanvasToolBarProps) {
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
              className="script-editor-canvas-tools__minimap"
              aria-label="自动排版"
              title="自动排版"
              data-testid="auto-arrange"
              onClick={() => onArrangeLayout?.()}
            >
              <TreeStructure />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">自动排版</TooltipContent>
        </Tooltip>
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
        {hasLegacyCode && onShowCode ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="script-editor-canvas-tools__minimap"
                aria-label="查看源码"
                title="查看源码"
                data-testid="show-code-view"
                onClick={onShowCode}
              >
                <CodeIcon />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">查看源码</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
