import { getIPC } from '@/shared/ipc'
import type { Panel } from '@/features/serial-panel/types'

/**
 * 导出当前面板的日志文本到文件。对应 legacy #btnSaveLog。
 * 镜像 FloatingPane.handleExport：content 取 viewMode 对应缓冲，调 ipc.panel.saveLog。
 * @param panel 当前面板
 */
export async function exportPanelLog(panel: Panel): Promise<void> {
  const ipc = getIPC()
  const content = panel.viewMode === 'hex' ? panel.hexBuffer : panel.textBuffer
  await ipc.panel.saveLog(panel.name, content)
}
