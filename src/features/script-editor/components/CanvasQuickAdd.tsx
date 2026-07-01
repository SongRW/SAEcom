import { Plus } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { PaletteGroup } from '@/features/script-editor/viewModel'

interface CanvasQuickAddProps {
  activeGroupKey: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onOpenPalette: () => void
  onSelectGroup: (key: string) => void
}

export function CanvasQuickAdd({
  activeGroupKey,
  groups,
  onAddNode,
  onOpenPalette,
  onSelectGroup
}: CanvasQuickAddProps) {
  const activeGroup = groups.find((group) => group.key === activeGroupKey) || groups[0]
  const firstNode = activeGroup?.nodes[0]

  return (
    <div className="script-editor-quick-add" aria-label="快速添加组件">
      <div className="script-editor-quick-add__groups">
        {groups.slice(0, 5).map((group) => (
          <button
            className={group.key === activeGroup?.key ? 'is-active' : ''}
            key={group.key}
            onClick={() => onSelectGroup(group.key)}
            type="button"
          >
            {group.name}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        title={firstNode ? `添加${firstNode.name}` : '打开组件'}
        onClick={() => {
          if (firstNode) onAddNode(firstNode.key)
          else onOpenPalette()
        }}
      >
        <Plus data-icon="inline-start" />
        添加到画布
      </Button>
      <Button size="sm" variant="outline" onClick={onOpenPalette}>
        全部组件
      </Button>
    </div>
  )
}
