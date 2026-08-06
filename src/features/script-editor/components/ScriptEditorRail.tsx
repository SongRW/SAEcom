import { SquaresFour as Blocks, FileText, PuzzlePiece, SidebarSimple as PanelBottom, TerminalWindow as TerminalSquare } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import type { ScriptEditorSidePanel } from '@/features/script-editor/uiState'

interface ScriptEditorRailProps {
  sidePanel: ScriptEditorSidePanel | null
  outputExpanded: boolean
  onSelectPanel: (panel: ScriptEditorSidePanel) => void
  onToggleOutput: () => void
}

export function ScriptEditorRail({
  sidePanel,
  outputExpanded,
  onSelectPanel,
  onToggleOutput
}: ScriptEditorRailProps) {
  return (
    <nav className="script-editor-rail" aria-label="脚本编辑器工具">
      <TooltipProvider delayDuration={180}>
        <RailButton
          active={sidePanel === 'components'}
          description="组件库：浏览并添加组件"
          icon={Blocks}
          label="组件"
          onClick={() => onSelectPanel('components')}
        />
        <RailButton
          active={sidePanel === 'scripts'}
          description="脚本：切换和管理脚本文件"
          icon={FileText}
          label="脚本"
          onClick={() => onSelectPanel('scripts')}
        />
        <RailButton
          active={sidePanel === 'custom'}
          description="自定义：创建、导入和管理自定义组件"
          icon={PuzzlePiece}
          label="自定义"
          onClick={() => onSelectPanel('custom')}
        />
        <RailButton
          active={outputExpanded}
          description="展开或收起底部输出 dock"
          icon={TerminalSquare}
          label="输出"
          onClick={onToggleOutput}
        />
        <RailButton
          active={false}
          description="节点配置：双击画布节点打开"
          disabled
          icon={PanelBottom}
          label="配置"
          onClick={() => undefined}
        />
      </TooltipProvider>
    </nav>
  )
}

function RailButton({
  active,
  description,
  disabled,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  description: string
  disabled?: boolean
  icon: typeof Blocks
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className={active ? 'is-active' : ''}
          disabled={disabled}
          size="icon"
          title={label}
          variant="ghost"
          onClick={onClick}
        >
          <Icon />
          <span>{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{description}</TooltipContent>
    </Tooltip>
  )
}
