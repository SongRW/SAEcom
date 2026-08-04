import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphEditorState } from '@/features/script-editor/rete/graphState'

interface NodeSearchBoxProps {
  graph: GraphEditorState
  onSelect: (nodeId: string) => void
  onClose: () => void
}

/**
 * 节点搜索框（Ctrl/Cmd+F 触发）。
 *
 * 按节点名称（label）或备注（node.data.note）做大小写不敏感的子串匹配，
 * 点击结果会选中该节点并居中定位（focusNode），然后关闭搜索框。
 *
 * 搜索是只读操作：仅消费 graph.nodes 做过滤，不写入 GraphEditorState、
 * 不影响代码生成或执行（遵守 CONV-GRAPH-CANONICAL-STATE）。
 * 选中/定位/相机均为瞬态，由父组件通过回调驱动。
 */
export function NodeSearchBox({ graph, onSelect, onClose }: NodeSearchBoxProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 挂载即聚焦输入框，便于直接键入查询。
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return graph.nodes.filter((n) => {
      const inLabel = n.label.toLowerCase().includes(q)
      const note = typeof n.data.note === 'string' ? n.data.note : ''
      const inNote = note.toLowerCase().includes(q)
      return inLabel || inNote
    })
  }, [query, graph])

  return (
    <div className="script-editor-search-box" role="search">
      <div className="script-editor-search-box__bar">
        <input
          ref={inputRef}
          className="script-editor-search-box__input"
          type="text"
          placeholder="搜索节点名称或备注…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            } else if (e.key === 'Enter' && results.length > 0) {
              e.preventDefault()
              onSelect(results[0].id)
            }
          }}
          aria-label="搜索节点"
        />
        <span className="script-editor-search-box__count">
          {query.trim() ? (results.length > 0 ? `${results.length} 个匹配` : '无匹配') : 'Esc 关闭'}
        </span>
      </div>
      {results.length > 0 && (
        <div className="script-editor-search-box__results">
          {results.map((node) => (
            <button
              key={node.id}
              type="button"
              className="script-editor-search-box__result"
              onClick={() => onSelect(node.id)}
            >
              <span className="script-editor-search-box__result-name">{node.label}</span>
              {typeof node.data.note === 'string' && node.data.note && (
                <span className="script-editor-search-box__result-note">{node.data.note}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && (
        <div className="script-editor-search-box__empty">无匹配节点</div>
      )}
    </div>
  )
}
