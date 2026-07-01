import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface PromptDialogProps {
  open: boolean
  title: string
  /** 描述/提示文案。默认隐藏。 */
  description?: string
  /** 输入框初始值。 */
  defaultValue?: string
  /** 占位符。 */
  placeholder?: string
  /** 输入最大长度（原生 prompt 没有上限；这里按调用方约束，如 ≤15 字）。 */
  maxLength?: number
  /** 确定按钮文案。 */
  confirmText?: string
  /** 取消按钮文案。 */
  cancelText?: string
  /**
   * 确定时回调，入参为当前输入值。
   * 关闭/取消/点 X 一律不回调（保持「取消=不写入」语义，对齐原生 prompt 返回 null 时调用方早退）。
   */
  onConfirm: (value: string) => void
  /**
   * 左下角副作用按钮（可选）。如「关闭限制」。不传则不渲染。
   * 点击后由调用方自行决定是否关闭弹窗（onAction 内可调 onOpenChange(false)）。
   */
  extraAction?: { text: string; onAction: () => void }
  /** open 变更回调（受控）。 */
  onOpenChange: (open: boolean) => void
}

/**
 * 文本输入弹窗，替代 Electron 渲染进程里被静默禁用的 window.prompt。
 * 基于 @/components/ui/dialog（与 NewPanelDialog 同款 Radix 风格）。
 *
 * - 打开时回填 defaultValue 并自动聚焦/选中（便于直接覆盖输入）
 * - 回车等价于点确定；Esc/点遮罩/点 X 视为取消
 * - 受控：父组件持有 open 状态；onConfirm 仅在「确定」时触发
 */
export function PromptDialog({
  open,
  title,
  description,
  defaultValue = '',
  placeholder,
  maxLength,
  confirmText = '确定',
  cancelText = '取消',
  extraAction,
  onConfirm,
  onOpenChange
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  // 打开时重置为 defaultValue 并聚焦选中（对齐原生 prompt 行为）
  useEffect(() => {
    if (open) {
      setValue(defaultValue)
      // Radix 在 portal 挂载后才有节点，下一帧聚焦最稳
      const id = requestAnimationFrame(() => {
        const el = inputRef.current
        if (el) {
          el.focus()
          el.select()
        }
      })
      return () => cancelAnimationFrame(id)
    }
  }, [open, defaultValue])

  function close() {
    onOpenChange(false)
  }

  function handleConfirm() {
    onConfirm(value)
    close()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Input
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleConfirm()
            }
          }}
        />
        <DialogFooter>
          {extraAction ? (
            <Button variant="outline" className="mr-auto" onClick={extraAction.onAction}>
              {extraAction.text}
            </Button>
          ) : null}
          <Button variant="outline" onClick={close}>
            {cancelText}
          </Button>
          <Button onClick={handleConfirm}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
