import { dialog } from 'electron'
import fs from 'node:fs'
import { loadJsonSafe, saveJsonSafe } from '../repositories/json-file.repo'

/**
 * ConfigService —— 配置 / 命令 / 文件 / 日志 域。
 *
 * 持有 panels.json / commands.json 路径（构造时注入 userData 派生）。
 * 行为逐函数对照搬移自 main.ts，零变化：
 * - loadPanelsConfig / savePanelsConfig（main.ts:141-142）
 * - loadCommandsConfig / saveCommandsConfig（main.ts:143-144）
 * - commands:flush 的 quitFlushFinish 钩子（main.ts:782-786）—— 退出栅栏回调
 * - file:readHex / file:pickOpen（main.ts:886-902）
 * - logger:append / logger:pickFile（main.ts:2038-2054）
 *
 * 状态私有化：路径与 quitFlushFinish 回调挂在实例，不再挂模块顶层。
 */
export class ConfigService {
  private readonly panelsPath: string
  private readonly commandsPath: string
  /** 退出栅栏完成回调；由 lifecycle（before-quit）设置，commands:flush 触发。 */
  private quitFlushFinish: (() => void) | null = null

  constructor(userDataDir: string) {
    this.panelsPath = `${userDataDir}/panels.json`
    this.commandsPath = `${userDataDir}/commands.json`
  }

  // ── 配置 ──
  loadPanelsConfig(): unknown {
    return loadJsonSafe(this.panelsPath, [])
  }

  savePanelsConfig(panels: unknown): void {
    saveJsonSafe(this.panelsPath, panels)
  }

  loadCommandsConfig(): unknown {
    return loadJsonSafe(this.commandsPath, [])
  }

  saveCommandsConfig(cmds: unknown): void {
    saveJsonSafe(this.commandsPath, cmds)
  }

  // ── 退出 flush 栅栏 ──
  /** before-quit 时由 lifecycle 设置完成回调；返回 true 表示已挂载，等待 flush。 */
  setQuitFlushFinish(fn: (() => void) | null): void {
    this.quitFlushFinish = fn
  }

  /** commands:flush 到达 → 触发完成回调（退出放行）。 */
  flushCommands(): boolean {
    if (this.quitFlushFinish) {
      this.quitFlushFinish()
      return true
    }
    return false
  }

  // ── 文件 ──
  /** file:readHex —— 读文件返回 hex + 长度。 */
  readHex(filePath: string): { hex: string; length: number } | { error: string } {
    try {
      const buf = fs.readFileSync(filePath)
      return { hex: buf.toString('hex'), length: buf.length }
    } catch (err: any) {
      return { error: err.message || String(err) }
    }
  }

  /** file:pickOpen —— 「导入文件」专用对话框（发送文件用）。 */
  async pickOpenFile(): Promise<string | null> {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择要发送的文件',
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  }

  // ── 日志 ──
  /** logger:append —— 追加写文本。 */
  async appendLog(filePath: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await fs.promises.appendFile(filePath, text, 'utf8')
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  /** logger:pickFile —— 选日志保存位置。 */
  async pickLogFile(): Promise<Electron.SaveDialogReturnValue> {
    return dialog.showSaveDialog({
      title: '选择日志保存位置',
      defaultPath: '串口日志.txt',
      filters: [{ name: '文本文件', extensions: ['txt', 'log'] }]
    })
  }
}
