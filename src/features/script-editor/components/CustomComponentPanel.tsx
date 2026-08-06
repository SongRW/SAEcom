import { DownloadSimple, MagnifyingGlass, PencilSimple, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  loadAndRegisterCustomComponents
} from '@/features/script-editor/nodes/component/loadCustomComponents'
import { findMatchRanges } from '@/features/script-editor/viewModel'
import { getIPC } from '@/shared/ipc'

const SEARCH_DEBOUNCE_MS = 150

/** 列表里展示的条目：文件名 + 解析出的 descriptor 元数据。 */
export interface CustomComponentListItem {
  /** 磁盘上的文件名（含 .json）。 */
  fileName: string
  /** descriptor.key（解析失败时为 null）。 */
  key: string | null
  /** descriptor.name（解析失败时为 fileName 去后缀）。 */
  name: string
  /** descriptor.description。 */
  description?: string
  /** 实现方式：js（emit 源码）| composite（组合子图）。 */
  kind?: 'js' | 'composite'
  /** 解析失败的错误原因（有值则条目禁用编辑，仅允许删除/重命名）。 */
  parseError?: string
}

interface CustomComponentPanelProps {
  /** 当前选中的文件名（用于高亮）。 */
  activeFileName: string | null
  /** 是否正在加载。 */
  loading: boolean
  /** 加载错误（整体 list 失败时）。 */
  error: string | null
  /** 列表条目。 */
  items: CustomComponentListItem[]
  /** 选中（点击条目）：打开编辑器编辑模式。 */
  onSelect: (item: CustomComponentListItem) => void
  /** 点击「新建 JS 组件」。 */
  onCreate: () => void
  /** 点击「导入组件」。 */
  onImport: () => void
  /** 右键/操作：重命名。 */
  onRename: (item: CustomComponentListItem) => void
  /** 右键/操作：删除。 */
  onDelete: (item: CustomComponentListItem) => void
  /** 右键/操作：导出。 */
  onExport: (item: CustomComponentListItem) => void
}

export function CustomComponentPanel({
  activeFileName,
  loading,
  error,
  items,
  onSelect,
  onCreate,
  onImport,
  onRename,
  onDelete,
  onExport
}: CustomComponentPanelProps) {
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')

  // 防抖搜索：150ms 后才应用 query（对齐 NodePalette）
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [queryInput])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const hay = `${item.name} ${item.key ?? ''} ${item.description ?? ''} ${item.fileName}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  function clearSearch() {
    setQueryInput('')
    setQuery('')
  }

  return (
    <div className="script-editor-list" aria-label="自定义组件列表">
      <div className="script-editor-list__heading">自定义组件</div>
      <div className="script-editor-palette__search">
        <MagnifyingGlass className="script-editor-palette__search-icon" />
        <Input
          aria-label="搜索自定义组件"
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
      <div className="script-editor-custom-panel__actions">
        <Button variant="outline" size="sm" type="button" onClick={onCreate}>
          <Plus /> 新建 JS 组件
        </Button>
        <Button variant="outline" size="sm" type="button" onClick={onImport}>
          <UploadSimple /> 导入组件
        </Button>
      </div>
      {loading && <div className="script-editor-list__meta">加载中...</div>}
      {error && <div className="script-editor-list__error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="script-editor-palette__empty">
          <div>{query ? '未找到匹配的组件' : '暂无自定义组件'}</div>
          <div className="script-editor-palette__empty-hint">
            {query ? '试试其他关键词，或清除搜索' : '点击「新建」或「导入」开始'}
          </div>
        </div>
      )}
      <ScrollArea className="script-editor-palette__scroll">
        <div className="script-editor-list__items">
          {filtered.map((item) => (
            <ContextMenu key={item.fileName}>
              <ContextMenuTrigger asChild>
                <Button
                  variant={item.fileName === activeFileName ? 'secondary' : 'ghost'}
                  className="script-editor-list__item script-editor-custom-panel__item justify-start w-full"
                  onClick={() => onSelect(item)}
                  disabled={Boolean(item.parseError)}
                >
                  <span className="script-editor-custom-panel__item-name">
                    <HighlightedText text={item.name} query={query} />
                  </span>
                  {item.kind === 'composite' ? (
                    <span className="script-editor-custom-panel__item-kind" title="组合组件（子图）">组合</span>
                  ) : null}
                  {item.key ? (
                    <span className="script-editor-custom-panel__item-key">{item.key}</span>
                  ) : null}
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={Boolean(item.parseError)}
                  onClick={() => onSelect(item)}
                >
                  <PencilSimple /> 编辑
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onRename(item)}>
                  重命名
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onExport(item)}>
                  <DownloadSimple /> 导出
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onClick={() => onDelete(item)}>
                  <Trash /> 删除
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

/** 命中片段 <mark> 高亮（query 为空时原样返回）。对齐 NodePalette。 */
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

/**
 * 拉取磁盘自定义组件列表 + 解析每个文件为列表条目（不注册到 registry）。
 * 注册由 loadAndRegisterCustomComponents 单独负责（避免重复扫描）。
 */
export async function fetchCustomComponentList(): Promise<CustomComponentListItem[]> {
  const ipc = getIPC()
  const names = await ipc.customComponents.list()
  const items: CustomComponentListItem[] = []
  for (const fileName of names) {
    const item = await readListItem(fileName)
    items.push(item)
  }
  return items
}

async function readListItem(fileName: string): Promise<CustomComponentListItem> {
  const ipc = getIPC()
  const stripped = stripJsonExtension(fileName)
  let raw: string
  try {
    raw = await ipc.customComponents.read(fileName)
  } catch (e) {
    return {
      fileName,
      key: null,
      name: stripped,
      parseError: e instanceof Error ? e.message : String(e)
    }
  }
  try {
    const d = JSON.parse(raw) as { key?: unknown; name?: unknown; description?: unknown; subgraph?: unknown }
    return {
      fileName,
      key: typeof d.key === 'string' ? d.key : null,
      name: typeof d.name === 'string' && d.name.trim() ? d.name : stripped,
      description: typeof d.description === 'string' ? d.description : undefined,
      // 组合组件（含 subgraph 字段）→ kind='composite'（列表徽标）
      kind: d.subgraph !== undefined ? 'composite' : 'js'
    }
  } catch (e) {
    return {
      fileName,
      key: null,
      name: stripped,
      parseError: e instanceof Error ? e.message : 'JSON 解析失败'
    }
  }
}

/** 去掉 .json 后缀用于展示。 */
export function stripJsonExtension(name: string): string {
  return name.replace(/\.json$/i, '')
}

/**
 * 把用户输入规范化为合法的组件文件名（强制 .json 后缀；剥离非法字符）。
 */
export function normalizeComponentFileName(name: string): string | null {
  const trimmed = name
    .trim()
    .replace(/[/\\<>:"|?*]/g, '')
    .replace(/[\x00-\x1f]/g, '')
  if (!trimmed || trimmed === '.' || trimmed === '..') return null
  return trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`
}

/**
 * 执行导入流程：调用 IPC + toast 汇总 + 重新加载注册表 + 返回是否成功。
 * 供 CustomComponentPanel 与 ScriptEditorDialog 复用。
 */
export async function importCustomComponentsAndRefresh(): Promise<boolean> {
  const ipc = getIPC()
  const result = await ipc.customComponents.importComponents()
  if (!result.ok) {
    if (!result.canceled) {
      toast.error(`导入失败：${'error' in result ? result.error || '未知错误' : '未知错误'}`)
    }
    return false
  }
  const summary = result.summary
  if (summary) {
    const importedCount = summary.imported.length
    const rejectedCount = summary.rejected.length
    if (importedCount > 0 && rejectedCount === 0) {
      toast.success(`已导入 ${importedCount} 个组件`)
    } else if (importedCount > 0 && rejectedCount > 0) {
      toast.warning(`导入完成：${importedCount} 个成功，${rejectedCount} 个被拒绝`, {
        description: summary.rejected
          .map((r) => `${r.name}: ${r.error}`)
          .slice(0, 3)
          .join('\n')
      })
    } else if (importedCount === 0 && rejectedCount > 0) {
      toast.error(`导入失败：${rejectedCount} 个组件全部被拒绝`, {
        description: summary.rejected
          .map((r) => `${r.name}: ${r.error}`)
          .slice(0, 3)
          .join('\n')
      })
    } else {
      toast.message('未选择文件或无新组件导入')
    }
  } else {
    toast.success('导入完成')
  }
  await loadAndRegisterCustomComponents()
  return true
}
