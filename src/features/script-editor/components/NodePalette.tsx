import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PaletteGroup } from '@/features/script-editor/viewModel'

interface NodePaletteProps {
  activeGroupKey?: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onSelectGroup?: (key: string) => void
}

export function NodePalette({ activeGroupKey, groups, onAddNode, onSelectGroup }: NodePaletteProps) {
  const defaultOpen = useMemo(() => new Set([activeGroupKey || groups[0]?.key || 'input']), [activeGroupKey, groups])
  const [openGroups, setOpenGroups] = useState(defaultOpen)

  useEffect(() => {
    if (!activeGroupKey) return
    setOpenGroups((current) => {
      if (current.has(activeGroupKey)) return current
      const next = new Set(current)
      next.add(activeGroupKey)
      return next
    })
  }, [activeGroupKey])

  function toggleGroup(key: string, open: boolean) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
    if (open) onSelectGroup?.(key)
  }

  return (
    <div className="script-editor-palette" aria-label="节点面板">
      <ScrollArea className="script-editor-palette__scroll">
        <div className="script-editor-palette__tree">
          {groups.map((group) => (
            <Collapsible
              key={group.key}
              open={openGroups.has(group.key)}
              onOpenChange={(open) => toggleGroup(group.key, open)}
            >
              <CollapsibleTrigger className="script-editor-palette__heading" type="button">
                <ChevronDown />
                <span className="script-editor-palette__swatch" style={{ background: group.color }} />
                <span>{group.name}</span>
                <Badge variant="secondary">{group.nodes.length}</Badge>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="script-editor-palette__nodes">
                  {group.nodes.map((node) => (
                    <button
                      className="script-editor-node-template"
                      data-node-key={node.key}
                      draggable
                      key={node.key}
                      onClick={() => onAddNode(node.key)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/x-saecom-node', node.key)
                        event.dataTransfer.effectAllowed = 'copy'
                      }}
                      style={{ borderLeftColor: node.color || group.color }}
                      type="button"
                    >
                      <span className="script-editor-node-template__name">{node.name}</span>
                      <span className="script-editor-node-template__ports">
                        {node.inputs.length}/{node.outputs.length}
                      </span>
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
