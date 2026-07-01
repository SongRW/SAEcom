import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ListPlus, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCommandsStore, type Command } from '@/features/commands/store'

interface CommandGridProps {
  onSend: (cmd: Command) => void
  onEdit: () => void
  /** 卡片是否处于重复发送态（高亮） */
  isRepeatActive?: (cmdId: string) => boolean
  /** 顶部插入的重复发送控制条（由 CommandsPage 传入） */
  repeatBar?: ReactNode
}

/** 计算可见命令（镜像 legacy getVisibleCommands） */
function selectVisibleCommands(state: { commands: Command[]; groupsMeta: { visible: string[] } }): Command[] {
  const visSet = new Set(state.groupsMeta.visible)
  return state.commands.filter((c) => visSet.has(c.group || '默认分组'))
}

/** 列数按容器宽度算，每列 ~308px，行数固定 4（对齐 legacy calcCmdLayout: renderer.js:3457-3464） */
function calcCols(width: number): number {
  return Math.max(1, Math.floor(width / (300 + 8)))
}
const ROWS = 4

/**
 * 命令卡片网格 + 翻页。镜像 legacy renderCmdGrid + calcCmdLayout + pageSlice。
 * - cols 由容器宽度算（ResizeObserver），rows 固定 4；pageSize = cols*rows。
 * - cmdPage 翻页（不持久化，切回回首页）。
 * - 卡片 isRepeatActive 时加 auto 高亮。
 * - 点击卡片发送；点击预览区（data）进入内联快速编辑（恢复 legacy buildPreview 点击编辑，
 *   renderer.js:3495-3513），即时持久化。
 */
export function CommandGrid({ onSend, onEdit, isRepeatActive, repeatBar }: CommandGridProps) {
  const commands = useCommandsStore(useShallow(selectVisibleCommands))
  const updateCommand = useCommandsStore((s) => s.updateCommand)
  const gridRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(4)
  const [page, setPage] = useState(0)
  // 内联快速编辑：editingId 命中时该卡片预览区切 <input>（恢复 legacy buildPreview 点击编辑）
  const [editingId, setEditingId] = useState<string | null>(null)
  // 进入编辑时的原始 data，供 Esc 还原（onChange 已即时持久化，否则 Esc 只是退出编辑不还原）
  const editStartRef = useRef<string>('')

  // 容器宽度变化 → 重算列数（镜像 legacy ResizeObserver / calcCmdLayout）
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => setCols(calcCols(el.clientWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pageSize = cols * ROWS
  const totalPages = Math.max(1, Math.ceil(commands.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * pageSize
  const pageItems = commands.slice(start, start + pageSize)

  // 命令总数变化导致页数收缩时，回正页码
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

  if (commands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <ListPlus className="size-8" />
        <p className="text-sm">暂无可见命令</p>
        <Button variant="outline" size="sm" onClick={onEdit}>
          打开命令编辑器
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm text-muted-foreground">
          共 {commands.length} 条 · 第 {safePage + 1}/{totalPages} 页 · 点击发送
        </span>
        <Button variant="outline" size="sm" onClick={onEdit}>
          编辑命令
        </Button>
      </div>
      {repeatBar && <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">{repeatBar}</div>}
      <ScrollArea className="min-h-0 flex-1">
        <div ref={gridRef} className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {pageItems.map((cmd) => {
            const repeating = isRepeatActive?.(cmd.id)
            const isEditing = editingId === cmd.id
            return (
              <div
                key={cmd.id}
                role="button"
                tabIndex={0}
                onClick={() => onSend(cmd)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSend(cmd)
                  }
                }}
                className={`group flex flex-col gap-1 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${repeating ? 'border-primary ring-2 ring-primary/40' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{cmd.name || '(未命名)'}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${cmd.mode === 'hex' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'}`}>
                    {cmd.mode === 'hex' ? 'HEX' : '文本'}
                  </span>
                </span>
                {isEditing ? (
                  <input
                    // autoFocus：每次切到编辑态自动聚焦（对齐 legacy input.focus()）
                    autoFocus
                    type="text"
                    defaultValue={cmd.data}
                    spellCheck={false}
                    title="回车保存，失焦保存，Esc 还原"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateCommand(cmd.id, { data: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') setEditingId(null)
                      else if (e.key === 'Escape') {
                        // 还原到进入编辑时的值（onChange 已即时持久化了中间输入）
                        updateCommand(cmd.id, { data: editStartRef.current })
                        setEditingId(null)
                      }
                    }}
                    className="min-w-0 rounded border border-input bg-transparent px-1.5 py-0.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                ) : (
                  <span
                    title="点击快速编辑"
                    onClick={(e) => {
                      e.stopPropagation()
                      editStartRef.current = cmd.data
                      setEditingId(cmd.id)
                    }}
                    className="min-w-0 truncate font-mono text-xs text-muted-foreground group-hover:text-foreground"
                  >
                    {cmd.data || '(空)'}
                  </span>
                )}
                {repeating && (
                  <span className="mt-auto text-[10px] text-primary">· 重复发送中</span>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t py-1.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)} title="上一页">
            <CaretLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{safePage + 1} / {totalPages}</span>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setPage((p) => (p + 1) % totalPages)} title="下一页">
            <CaretRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
