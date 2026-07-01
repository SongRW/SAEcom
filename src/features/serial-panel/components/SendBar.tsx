import { PaperPlane } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useSettingsStore } from '@/shared/store/settings'
import { nowTs } from '@/features/serial-panel/paneViewModel'
import type { Panel } from '@/features/serial-panel/types'

interface SendBarProps {
  panel: Panel
}

/**
 * 发送栏（工作区面板内）。精简为「输入框 + 发送按钮」单行。
 * 文本/HEX 模式、发送结尾等发送选项由底部配置区（ActivePanelConfigPanel）统一设置，
 * 文件发送（raw / YModem）也下沉到底部配置区，对齐老项目的下方共享区设计。
 * 本组件只负责按 panel.sendOptions 当前值发送文本。
 */
export function SendBar({ panel }: SendBarProps) {
  const ipc = useIPC()
  const setSendText = usePanelsStore((s) => s.setSendText)
  const appendChunk = usePanelsStore((s) => s.appendChunk)
  const appendSysLine = usePanelsStore((s) => s.appendSysLine)
  const txTimestamp = useSettingsStore((s) => s.txTimestamp)
  const charEncoding = useSettingsStore((s) => s.charEncoding)
  // 发送选项来源：每面板独立的 panel.sendOptions（由底部配置区设置）
  const mode: 'text' | 'hex' = panel.sendOptions.hexMode ? 'hex' : 'text'
  const append = panel.sendOptions.append
  const echoSend = panel.sendOptions.echoSend

  async function doEcho(text: string) {
    if (!echoSend) return
    const ts = txTimestamp !== false ? `[${nowTs()}] ` : ''
    appendChunk(panel.id, { text: ts + text + '\n', hex: ts + text + '\n', isEcho: true })
  }

  async function handleSend() {
    const data = panel.sendText
    if (!data) return
    if (!panel.open) {
      appendSysLine(panel.id, '[错误] 端口未打开，无法发送')
      return
    }
    if (mode === 'hex') {
      const clean = data.replace(/[\s,]/g, '')
      if (clean.length % 2 !== 0) {
        appendSysLine(panel.id, '[系统] HEX 长度必须为偶数')
        return
      }
    }
    try {
      const res =
        panel.type === 'tcp'
          ? await ipc.tcp.write(panel.id, data, mode, append, charEncoding)
          : await ipc.serial.write(panel.id, data, mode, append, charEncoding)
      if (res && !res.ok) {
        appendSysLine(panel.id, `[错误] 发送失败：${res.error || ''}`)
      } else {
        await doEcho(data)
      }
    } catch (e) {
      appendSysLine(panel.id, `[错误] 发送失败：${String(e)}`)
    }
  }

  return (
    <div className="flex items-center gap-1.5 border-t bg-muted/30 px-2 py-1.5">
      <Input
        value={panel.sendText}
        onChange={(e) => setSendText(panel.id, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        placeholder={mode === 'hex' ? 'HEX, 如 A1 01 01' : '发送内容'}
        className="h-8 flex-1 font-mono text-xs"
      />
      <Button size="sm" className="h-8 px-3" disabled={!panel.open} onClick={handleSend}>
        <PaperPlane data-icon="inline-start" />
        发送
      </Button>
    </div>
  )
}
