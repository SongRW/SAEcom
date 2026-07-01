import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface SelectGroupDialogProps {
  open: boolean
  title: string
  /** 描述/提示文案。默认隐藏。 */
  description?: string
  /** 可选分组列表（已排除当前分组等）。 */
  items: string[]
  /** 确定按钮文案。 */
  confirmText?: string
  /** 取消按钮文案。 */
  cancelText?: string
  /**
   * 确定时回调，入参为选中的分组名。
   * 关闭/取消/点 X 一律不回调（对齐 legacy uiSelect 返回 falsy 时调用方早退）。
   */
  onConfirm: (value: string) => void
  /** open 变更回调（受控）。 */
  onOpenChange: (open: boolean) => void
}

/**
 * 单选分组弹窗，对齐 legacy uiSelect（renderer.js）在「移动/复制选中命令到分组」场景的交互。
 * 基于 @/components/ui/dialog + 原生 radio（避免引入额外 shadcn 组件）。
 *
 * - 打开时默认选中第一项；回车等价于点确定；Esc/点遮罩/点 X 视为取消。
 * - 受控：父组件持有 open 状态；onConfirm 仅在「确定」时触发。
 */
export function SelectGroupDialog({
  open,
  title,
  description,
  items,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onOpenChange
}: SelectGroupDialogProps) {
  const [value, setValue] = useState(items[0] ?? '')

  // 打开时重置为第一项（items 可能随分组增删变化）
  useEffect(() => {
    if (open) setValue(items[0] ?? '')
  }, [open, items])

  function close() {
    onOpenChange(false)
  }

  function handleConfirm() {
    if (value) onConfirm(value)
    close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">没有可用的目标分组（请先新建分组）。</p>
        ) : (
          <div
            className="flex max-h-60 flex-col gap-1 overflow-auto"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleConfirm()
              }
            }}
          >
            {items.map((g) => {
              const checked = g === value
              return (
                <label
                  key={g}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    checked ? 'border-primary bg-accent' : 'bg-card hover:bg-accent/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="select-group"
                    className="accent-primary"
                    checked={checked}
                    onChange={() => setValue(g)}
                  />
                  <span className="flex-1">{g}</span>
                </label>
              )
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} disabled={items.length === 0}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
