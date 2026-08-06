import { CaretDown as ChevronDown, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PaletteGroup } from '@/features/script-editor/viewModel'
import { filterPaletteGroups, findMatchRanges } from '@/features/script-editor/viewModel'

interface NodePaletteProps {
  activeGroupKey?: string
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  onSelectGroup?: (key: string) => void
}

const SEARCH_DEBOUNCE_MS = 150

export function NodePalette({ activeGroupKey, groups, onAddNode, onSelectGroup }: NodePaletteProps) {
  const defaultOpen = useMemo(() => new Set([activeGroupKey || groups[0]?.key || 'input']), [activeGroupKey, groups])
  const [openGroups, setOpenGroups] = useState(defaultOpen)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!activeGroupKey) return
    setOpenGroups((current) => {
      if (current.has(activeGroupKey)) return current
      const next = new Set(current)
      next.add(activeGroupKey)
      return next
    })
  }, [activeGroupKey])

  // 防抖搜索：输入停止 150ms 后才应用 query，避免每次按键都重算过滤
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [queryInput])

  const isSearching = query.trim().length > 0
  const displayedGroups = useMemo(
    () => filterPaletteGroups(groups, query),
    [groups, query]
  )

  function toggleGroup(key: string, open: boolean) {
    setOpenGroups((current) => {
      const next = new Set(current)
      if (open) next.add(key)
      else next.delete(key)
      return next
    })
    if (open) onSelectGroup?.(key)
  }

  function clearSearch() {
    setQueryInput('')
    setQuery('')
  }

  return (
    <div className="script-editor-palette" aria-label="节点面板">
      <div className="script-editor-palette__search">
        <MagnifyingGlass className="script-editor-palette__search-icon" />
        <Input
          aria-label="搜索组件"
          className="script-editor-palette__search-input"
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="搜索组件（名称 / key / 描述）"
          value={queryInput}
        />
        {queryInput && (
          <button
            aria-label="清除搜索"
            className="script-editor-palette__search-clear"
            onClick={clearSearch}
            type="button"
          >
            <X />
          </button>
        )}
      </div>
      <ScrollArea className="script-editor-palette__scroll">
        <div className="script-editor-palette__tree">
          {isSearching ? (
            <SearchResults groups={displayedGroups} onAddNode={onAddNode} query={query} />
          ) : (
            displayedGroups.map((group) => (
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
                  <NodeList group={group} onAddNode={onAddNode} />
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SearchResults({
  groups, onAddNode, query
}: {
  groups: PaletteGroup[]
  onAddNode: (key: string) => void
  query: string
}) {
  const nodes = groups[0]?.nodes ?? []
  if (nodes.length === 0) {
    return (
      <div className="script-editor-palette__empty">
        <div>未找到匹配的组件</div>
        <div className="script-editor-palette__empty-hint">试试其他关键词，或清除搜索</div>
      </div>
    )
  }
  return (
    <Collapsible open>
      <CollapsibleTrigger className="script-editor-palette__heading" type="button">
        <ChevronDown />
        <span className="script-editor-palette__swatch" style={{ background: groups[0].color }} />
        <span>搜索结果</span>
        <Badge variant="secondary">{nodes.length}</Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <NodeList group={{ ...groups[0], nodes }} onAddNode={onAddNode} query={query} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function NodeList({
  group, onAddNode, query
}: {
  group: PaletteGroup
  onAddNode: (key: string) => void
  query?: string
}) {
  return (
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
          <span className="script-editor-node-template__name">
            <HighlightedText text={node.name} query={query} />
          </span>
          <span className="script-editor-node-template__ports">
            {node.inputs.length}/{node.outputs.length}
          </span>
        </button>
      ))}
    </div>
  )
}

/** 命中片段 <mark> 高亮（query 为空时原样返回）。 */
function HighlightedText({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>
  const ranges = findMatchRanges(text, query)
  if (!ranges) return <>{text}</>
  const parts: Array<React.ReactNode> = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (cursor < start) parts.push(text.slice(cursor, start))
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>)
    cursor = end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}
