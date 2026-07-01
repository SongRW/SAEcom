import { useState } from 'react'
import { Plus, PencilSimple, Trash, Eye, EyeSlash, Check, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useCommandsStore } from '@/features/commands/store'
import { toast } from 'sonner'

/**
 * 分组管理。镜像 legacy cmdGroupSelect/cmdGroupNew/cmdGroupRename/cmdGroupDelete/cmdGroupShow
 * （renderer.js:3684-3860）：新建/重命名/删除分组、切换可见、设为当前。
 */
export function GroupManager() {
  const groupsMeta = useCommandsStore((s) => s.groupsMeta)
  const setActiveGroup = useCommandsStore((s) => s.setActiveGroup)
  const addGroup = useCommandsStore((s) => s.addGroup)
  const renameGroup = useCommandsStore((s) => s.renameGroup)
  const removeGroup = useCommandsStore((s) => s.removeGroup)
  const toggleGroupVisible = useCommandsStore((s) => s.toggleGroupVisible)

  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)

  function commitRename(oldName: string) {
    if (renameVal.trim()) renameGroup(oldName, renameVal.trim())
    setRenaming(null)
    setRenameVal('')
  }

  /** 新建分组：成功才清空输入，空/重名给反馈。 */
  function commitAdd() {
    const r = addGroup(newName)
    if (r === 'ok') {
      setNewName('')
    } else if (r === 'duplicate') {
      toast.warning('分组已存在')
    } else {
      toast.warning('分组名不能为空')
    }
  }

  return (
    <div className="rounded-md border p-3">
      {/* 新建分组 */}
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={newName}
          placeholder="新分组名"
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitAdd()
            }
          }}
          className="h-8 flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            commitAdd()
          }}
        >
          <Plus data-icon="inline-start" />
          新建
        </Button>
      </div>

      {/* 分组列表 */}
      <div className="flex flex-col gap-1">
        {groupsMeta.groups.map((g) => {
          const isActive = groupsMeta.active === g
          const isVisible = groupsMeta.visible.includes(g)
          return (
            <div
              key={g}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${isActive ? 'border-primary bg-accent' : 'bg-card'}`}
            >
              {renaming === g ? (
                <>
                  <Input
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(g)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    className="h-7 flex-1"
                  />
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => commitRename(g)}>
                    <Check className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setRenaming(null)}>
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveGroup(g)}
                    className={`flex-1 truncate text-left text-sm ${isActive ? 'font-medium text-primary' : ''}`}
                    title={isActive ? '当前分组' : '设为当前分组'}
                  >
                    {g}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => toggleGroupVisible(g)}
                    title={isVisible ? '隐藏分组' : '显示分组'}
                  >
                    {isVisible ? <Eye className="size-4" /> : <EyeSlash className="size-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      setRenaming(g)
                      setRenameVal(g)
                    }}
                    title="重命名"
                  >
                    <PencilSimple className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => setPendingRemove(g)}
                    disabled={groupsMeta.groups.length <= 1}
                    title="删除分组"
                  >
                    <Trash className="size-4" />
                  </Button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* 删除分组确认弹窗：显示将迁移的命令数与目标 fallback 组 */}
      <AlertDialog open={pendingRemove !== null} onOpenChange={(o) => { if (!o) setPendingRemove(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分组「{pendingRemove}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const cmds = useCommandsStore.getState().commands
                const DEFAULT_GROUP = '默认分组'
                const count = cmds.filter((c) => (c.group || DEFAULT_GROUP) === pendingRemove).length
                const fallback = groupsMeta.groups.find((g) => g !== pendingRemove) || DEFAULT_GROUP
                return `该分组下的 ${count} 条命令将迁移到「${fallback}」。此操作不可撤销。`
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemove) removeGroup(pendingRemove)
                setPendingRemove(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
