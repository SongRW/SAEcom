import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DotsSixVertical, Trash, Plus, ArrowsOutCardinal, Copy } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { useCommandsStore, type Command } from '@/features/commands/store'
import { useSettingsStore } from '@/shared/store/settings'
import { GroupManager } from '@/features/commands/components/GroupManager'
import { SelectGroupDialog } from '@/features/commands/components/SelectGroupDialog'

/** 计算可见命令（镜像 legacy getVisibleCommands） */
function selectVisibleCommands(state: { commands: Command[]; groupsMeta: { visible: string[] } }): Command[] {
  const visSet = new Set(state.groupsMeta.visible)
  return state.commands.filter((c) => visSet.has(c.group || '默认分组'))
}

interface CommandEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** 可拖拽命令行：选择框 + 拖拽手柄 + 名称/数据/模式输入 + 删除 */
function SortableRow({
  cmd,
  selected,
  onToggleSelected,
  onRequestDelete
}: {
  cmd: Command
  selected: boolean
  onToggleSelected: (id: string) => void
  /** 请求删除（由父组件按 confirmDelete 决定是否二次确认） */
  onRequestDelete: (cmd: Command) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cmd.id })
  const updateCommand = useCommandsStore((s) => s.updateCommand)
  const longCommandThreshold = useSettingsStore((s) => s.longCommandThreshold)
  const isLong = cmd.data.length > longCommandThreshold

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggleSelected(cmd.id)}
        aria-label="选中该命令"
        className="shrink-0"
      />
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="拖拽排序"
      >
        <DotsSixVertical className="size-4 shrink-0" />
      </button>
      <Input
        value={cmd.name}
        placeholder="名称"
        onChange={(e) => updateCommand(cmd.id, { name: e.target.value })}
        className="h-8 w-28 shrink-0"
      />
      {/*
        始终渲染同一个 <textarea>，仅按长度切换高度样式。
        原先 Input↔textarea 二选一会在跨过阈值瞬间卸载/重挂元素 → 焦点与光标丢失。
        保持元素类型恒定后，跨阈值只改 class，不再丢焦点。
      */}
      <textarea
        value={cmd.data}
        placeholder="数据"
        onChange={(e) => updateCommand(cmd.id, { data: e.target.value })}
        spellCheck={false}
        className={
          isLong
            ? 'min-h-[64px] max-h-[160px] flex-1 resize-y rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
            : 'h-8 max-h-8 flex-1 resize-none rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
        }
      />
      <Select value={cmd.mode} onValueChange={(v) => updateCommand(cmd.id, { mode: v as Command['mode'] })}>
        <SelectTrigger className="h-8 w-24 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="text">文本</SelectItem>
          <SelectItem value="hex">HEX</SelectItem>
        </SelectContent>
      </Select>
      <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onRequestDelete(cmd)}>
        <Trash className="size-4" />
      </Button>
    </div>
  )
}

/**
 * 命令编辑器。镜像 legacy #dlgCmdEdit（renderer.js:3604-3860）。
 * 上方分组管理 + 批量工具栏（全选/删除选中/移动到分组/复制到分组，对齐 legacy
 * cmdSelectAll/cmdDeleteSel/cmdMoveSel/cmdCopySel）+ 下方可拖拽排序的命令列表（dnd-kit）。
 * 删除按 settings.confirmDelete 决定是否二次确认（批量删除始终确认，与 legacy 一致）。
 *
 * 编辑即时持久化（与主页 CommandGrid 内联编辑一致）：删除/改名/拖拽/批量移动都立即落盘，
 * 无「放弃本次修改」二次确认——legacy 那条回滚依赖「编辑期间不落盘」的草稿模型，
 * 而 React 走即时持久化（主网格内联编辑也依赖它），两者不兼容，故不再在关闭时弹放弃确认。
 */
export function CommandEditor({ open, onOpenChange }: CommandEditorProps) {
  const visibleCommands = useCommandsStore(useShallow(selectVisibleCommands))
  const groupsMeta = useCommandsStore((s) => s.groupsMeta)
  const addCommand = useCommandsStore((s) => s.addCommand)
  const moveCommand = useCommandsStore((s) => s.moveCommand)
  const removeCommand = useCommandsStore((s) => s.removeCommand)
  const removeCommands = useCommandsStore((s) => s.removeCommands)
  const moveCommandsToGroup = useCommandsStore((s) => s.moveCommandsToGroup)
  const copyCommandsToGroup = useCommandsStore((s) => s.copyCommandsToGroup)
  const confirmDelete = useSettingsStore((s) => s.confirmDelete)

  const [showGroupMgr, setShowGroupMgr] = useState(false)
  // 选择态：以 id 集合保存，便于跨翻页/可见集合变化保持
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 删除确认：type 区分单条/批量；单条时 pendingCmd 记录目标
  const [confirm, setConfirm] = useState<{ type: 'single' | 'batch'; cmd?: Command } | null>(null)
  // 移动/复制目标分组弹窗
  const [groupDialog, setGroupDialog] = useState<{ mode: 'move' | 'copy' } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const visibleIds = visibleCommands.map((c) => c.id)
  const visibleSelectedCount = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length
  // 仅当存在不止一个分组时，「移动/复制」才有意义（对齐 legacy candidates 过滤当前分组）
  const canMoveCopy = groupsMeta.groups.length > 1

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      // 当前已全选 → 清空；否则选中所有可见
      if (allVisibleSelected) {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      }
      const next = new Set(prev)
      visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = visibleCommands.map((c) => c.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    moveCommand(from, to)
  }

  /** 请求删除单条：按 confirmDelete 决定是否弹确认（对齐 legacy renderer.js:3664） */
  function requestDeleteSingle(cmd: Command) {
    if (confirmDelete) setConfirm({ type: 'single', cmd })
    else removeCommand(cmd.id)
  }

  /** 批量删除：始终确认（对齐 legacy cmdDeleteSel，renderer.js:4342） */
  function requestDeleteBatch() {
    if (visibleSelectedCount === 0) return
    setConfirm({ type: 'batch' })
  }

  function execConfirm() {
    if (!confirm) return
    if (confirm.type === 'single' && confirm.cmd) {
      removeCommand(confirm.cmd.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(confirm.cmd!.id)
        return next
      })
    } else if (confirm.type === 'batch') {
      const ids = visibleIds.filter((id) => selectedIds.has(id))
      removeCommands(ids)
      clearSelection()
    }
    setConfirm(null)
  }

  /** 打开移动/复制分组选择弹窗（仅当前分组之外可选） */
  function openGroupDialog(mode: 'move' | 'copy') {
    if (visibleSelectedCount === 0) {
      toast.warning('请先选中命令')
      return
    }
    if (!canMoveCopy) {
      toast.warning('当前只有一个分组，请先新建分组')
      return
    }
    setGroupDialog({ mode })
  }

  function confirmGroupDialog(target: string) {
    if (!groupDialog) return
    const ids = visibleIds.filter((id) => selectedIds.has(id))
    if (groupDialog.mode === 'move') {
      moveCommandsToGroup(ids, target)
      toast.success(`已移动 ${ids.length} 条命令到「${target}」`)
      clearSelection()
    } else {
      const n = copyCommandsToGroup(ids, target)
      toast.success(`已复制 ${n} 条命令到「${target}」`)
      clearSelection()
    }
    setGroupDialog(null)
  }

  const selectedCount = visibleSelectedCount
  const groupCandidates = groupsMeta.groups.filter((g) => g !== groupsMeta.active)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-[95vw] max-w-5xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>命令编辑器</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Label className="text-muted-foreground">当前分组:</Label>
            <span className="font-medium">{groupsMeta.active}</span>
            <span className="text-muted-foreground">· 可见 {visibleCommands.length} 条</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowGroupMgr((v) => !v)}>
            {showGroupMgr ? '收起分组管理' : '分组管理'}
          </Button>
        </div>

        {showGroupMgr && <GroupManager />}

        <Separator />

        {/* 批量工具栏：全选 + 删除选中 + 移动选中 + 复制选中（对齐 legacy cmdSelectAll/cmdDeleteSel/cmdMoveSel/cmdCopySel） */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={toggleSelectAll}
            aria-label="全选可见命令"
            disabled={visibleCommands.length === 0}
          />
          <span className="text-muted-foreground">已选 {selectedCount}</span>
          <span className="mx-1 h-3 w-px bg-border" />
          <Button variant="outline" size="sm" className="h-7" disabled={selectedCount === 0} onClick={requestDeleteBatch}>
            <Trash data-icon="inline-start" />
            删除选中
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0 || !canMoveCopy}
            title={canMoveCopy ? '把选中命令移动到其他分组' : '当前只有一个分组'}
            onClick={() => openGroupDialog('move')}
          >
            <ArrowsOutCardinal data-icon="inline-start" />
            移动选中
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={selectedCount === 0 || !canMoveCopy}
            title={canMoveCopy ? '把选中命令复制到其他分组' : '当前只有一个分组'}
            onClick={() => openGroupDialog('copy')}
          >
            <Copy data-icon="inline-start" />
            复制选中
          </Button>
        </div>

        <ScrollArea className="h-[45vh]">
          <div className="flex flex-col gap-1.5 pr-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleCommands.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {visibleCommands.map((cmd) => (
                  <SortableRow
                    key={cmd.id}
                    cmd={cmd}
                    selected={selectedIds.has(cmd.id)}
                    onToggleSelected={toggleSelected}
                    onRequestDelete={requestDeleteSingle}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => addCommand()}>
            <Plus data-icon="inline-start" />
            新建命令
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* 移动/复制到分组：选择目标分组弹窗（对齐 legacy uiSelect） */}
      <SelectGroupDialog
        open={!!groupDialog}
        onOpenChange={(o) => !o && setGroupDialog(null)}
        title={groupDialog?.mode === 'move' ? '移动选中的命令' : '复制选中的命令'}
        description={
          groupDialog?.mode === 'move'
            ? `选择要移动到的分组（当前：${groupsMeta.active}）：`
            : `选择要复制到的目标分组（当前：${groupsMeta.active}）：`
        }
        items={groupCandidates}
        confirmText={groupDialog?.mode === 'move' ? '移动' : '复制'}
        onConfirm={confirmGroupDialog}
      />

      {/* 删除确认弹窗（单条 / 批量共用） */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除命令</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.type === 'single'
                ? `删除命令：${confirm.cmd?.name || '(未命名)'} ？此操作不可撤销。`
                : `确认删除选中的 ${visibleSelectedCount} 条命令？此操作不可撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={execConfirm}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
