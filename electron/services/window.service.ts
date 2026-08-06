import {
  app, BrowserWindow, dialog, type IpcMainEvent, type IpcMainInvokeEvent
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'

/**
 * WindowService —— 多窗口生命周期 + 主题 + 弹出窗 域。
 *
 * 持有私有状态：mainWindow / popoutWindows（面板弹窗）/ scriptEditorPopout{Window,Payload} /
 *   scriptOutputPopout{Window,Payload} / currentDark / maximizeListeners。
 * 行为逐函数对照搬移自 main.ts，零变化：
 * - createMainWindow（main.ts:186-211）
 * - window:* 控制类 handler（main.ts:323-362）
 * - applyTitleBarOverlay / theme:set（main.ts:370-388）
 * - changelog:open / about:open（main.ts:391-426）
 * - panel:request-hide / panel:saveLog / panel:popout / panel:set-always-on-top / panel:request-dock（main.ts:429-493,656-666）
 * - script-editor:popout / request-dock（main.ts:498-557）
 * - script-output:popout / sync / request-close / request-clear / request-payload（main.ts:560-653）
 * - window:set-oscilloscope-top（main.ts:1519-1530）
 *
 * 构造注入：路径常量（preload/devServer/rendererDist）+ 行为开关（isDev/showWindow）。
 * 这些是 main.ts 模块级常量，由装配时传入，避免本 service 反向依赖 main.ts。
 */
export interface WindowServiceConfig {
  preloadPath: string
  devServerUrl: string
  rendererDist: string
  isDev: boolean
  showWindow: boolean
}

export class WindowService {
  private readonly cfg: WindowServiceConfig
  private mainWindow: BrowserWindow | null = null
  private readonly popoutWindows = new Map<string, BrowserWindow>()
  private scriptEditorPopoutWindow: BrowserWindow | null = null
  private scriptEditorPopoutPayload: { graphStr: string; activeScriptName: string } = { graphStr: '', activeScriptName: '' }
  private scriptOutputPopoutWindow: BrowserWindow | null = null
  private scriptOutputPopoutPayload: { lines: Array<{ text: string; ts: number }>; scriptName: string } = { lines: [], scriptName: '' }
  private currentDark = false
  private readonly maximizeListeners = new WeakMap<BrowserWindow, () => void>()

  constructor(cfg: WindowServiceConfig) {
    this.cfg = cfg
  }

  // ── 主窗 ──
  createMainWindow(): void {
    const { preloadPath, devServerUrl, rendererDist, isDev, showWindow } = this.cfg
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 800,
      minHeight: 500,
      autoHideMenuBar: true,
      show: showWindow,
      titleBarStyle: process.platform === 'win32' ? 'hidden' : undefined,
      titleBarOverlay: process.platform === 'win32' ? { color: '#f5f7fa', symbolColor: '#1f2937', height: 30 } : undefined,
      webPreferences: { preload: preloadPath, contextIsolation: true }
    })
    if (isDev) {
      this.mainWindow.loadURL(devServerUrl + '/src/app/mainwindow.html')
    } else {
      this.mainWindow.loadFile(path.join(rendererDist, 'app/mainwindow.html'))
    }
    this.mainWindow.on('closed', () => {
      BrowserWindow.getAllWindows().forEach(win => { if (win !== this.mainWindow) win.close() })
      this.mainWindow = null
    })
    // 外链防护以全局 web-contents-created handler 为单一权威；此处仅保留主窗 will-navigate 拦截。
    this.mainWindow.webContents.on('will-navigate', (e, url) => { if (this.openExternal(url)) e.preventDefault() })
    this.mainWindow.webContents.on('did-fail-load', (_e, ec, desc, url) => { console.log('[FAIL]', ec, desc, url) })
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private openExternal(url: string): boolean {
    const { shell } = require('electron')
    return (/^https?:/i.test(url) || /^mailto:/i.test(url)) && (shell.openExternal(url), true)
  }

  // ── 窗口控制 ──
  setFullscreen(flag: boolean): void { this.mainWindow?.setFullScreen(!!flag) }
  toggleFullscreen(): void { this.mainWindow?.setFullScreen(!this.mainWindow.isFullScreen()) }
  focus(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) this.mainWindow.restore()
      this.mainWindow.show()
      this.mainWindow.focus()
    }
  }
  platform(): 'win32' | 'darwin' | 'linux' { return process.platform as 'win32' | 'darwin' | 'linux' }
  minimize(e: IpcMainEvent): void { BrowserWindow.fromWebContents(e.sender)?.minimize() }
  toggleMaximize(e: IpcMainEvent): void {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  }
  close(e: IpcMainEvent): void { BrowserWindow.fromWebContents(e.sender)?.close() }
  isMaximized(e: IpcMainEvent | IpcMainInvokeEvent): boolean { return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false }
  subscribeMaximize(e: IpcMainEvent): void {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (this.maximizeListeners.has(win)) return
    const emit = () => {
      if (!win.isDestroyed()) win.webContents.send('window:maximizeChange', win.isMaximized())
    }
    win.on('maximize', emit)
    win.on('unmaximize', emit)
    this.maximizeListeners.set(win, emit)
  }

  // ── 主题 ──
  /** win32 titleBarOverlay 按主题应用到所有窗口。主窗 height:30，popout height:38。 */
  private applyTitleBarOverlay(dark: boolean): void {
    if (process.platform !== 'win32') return
    const color = dark ? '#0D1218' : '#f5f7fa'
    const symbolColor = dark ? '#E6E9EF' : '#1f2937'
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed() || !w.setTitleBarOverlay) continue
      const isMain = w === this.mainWindow
      try {
        w.setTitleBarOverlay({ color, symbolColor, height: isMain ? 30 : 38 })
      } catch { /* 旧版 Electron 无 overlay */ }
    }
  }

  setTheme(dark: boolean): void {
    this.currentDark = !!dark
    this.applyTitleBarOverlay(dark)
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('theme:apply', { dark }))
  }

  /** popout 窗创建时按当前主题算 overlay 颜色（供本 service 内 popout 复用）。 */
  private popoutOverlay() {
    return process.platform === 'win32'
      ? { color: this.currentDark ? '#0D1218' : '#f5f7fa', symbolColor: this.currentDark ? '#E6E9EF' : '#1f2937', height: 38 }
      : undefined
  }

  // ── changelog / about 窗 ──
  openChangelog(): void {
    const { preloadPath, devServerUrl, rendererDist, isDev, showWindow } = this.cfg
    const win = new BrowserWindow({
      width: 800, height: 600, title: '更新日志', autoHideMenuBar: true, show: showWindow,
      webPreferences: { preload: preloadPath, contextIsolation: true }
    })
    if (isDev) win.loadURL(devServerUrl + '/src/app/changelog.html')
    else win.loadFile(path.join(rendererDist, 'app/changelog.html'))
  }

  openAbout(): void {
    const { preloadPath, devServerUrl, rendererDist, isDev, showWindow } = this.cfg
    const win = new BrowserWindow({
      width: 480, height: 560, title: '关于', autoHideMenuBar: true, show: showWindow,
      webPreferences: { preload: preloadPath, contextIsolation: true }
    })
    if (isDev) win.loadURL(devServerUrl + '/src/app/about.html')
    else win.loadFile(path.join(rendererDist, 'app/about.html'))
  }

  // ── 面板 popout ──
  requestHidePanel(e: IpcMainEvent, id: string): void {
    this.mainWindow?.webContents.send('panel:hide', { id })
    BrowserWindow.fromWebContents(e.sender)?.close()
  }

  async savePanelLog(name: string, content: string): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }> {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '保存面板数据', defaultPath: `${name || '面板数据'}.txt`, filters: [{ name: '文本文件', extensions: ['txt'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true, filePath } } catch (e: any) { return { ok: false, error: e.message } }
  }

  popoutPanel(args: { id: string; title: string; historyStr: string; alwaysOnTop: boolean; isOpen: boolean; viewMode: string; optionsStr: string }): { ok: boolean; error?: string } {
    const { id, title, historyStr, alwaysOnTop, isOpen, viewMode, optionsStr } = args
    const { preloadPath, devServerUrl, rendererDist, isDev, showWindow } = this.cfg
    if (!this.mainWindow) return { ok: false, error: 'MAIN_WINDOW_MISSING' }

    const existing = this.popoutWindows.get(id)
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return { ok: true }
    }

    const win = new BrowserWindow({
      width: 600, height: 420, minWidth: 550, minHeight: 300,
      alwaysOnTop: alwaysOnTop !== false, show: showWindow,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      titleBarOverlay: this.popoutOverlay(),
      frame: process.platform === 'linux' ? false : undefined,
      resizable: true,
      webPreferences: { preload: preloadPath, contextIsolation: true }
    })

    this.popoutWindows.set(id, win)
    win.on('closed', () => this.popoutWindows.delete(id))

    if (isDev) {
      const u = new URL(devServerUrl + '/src/app/panel.html')
      u.searchParams.set('id', id)
      u.searchParams.set('title', title || '')
      u.searchParams.set('isOpen', isOpen ? '1' : '0')
      u.searchParams.set('viewMode', viewMode || 'text')
      u.searchParams.set('opts', optionsStr || '{}')
      win.loadURL(u.toString())
    } else {
      win.loadFile(path.join(rendererDist, 'app/panel.html'), {
        query: { id, title, isOpen: isOpen ? '1' : '0', viewMode: viewMode || 'text', opts: optionsStr || '{}' }
      })
    }

    win.webContents.once('did-finish-load', () => win.webContents.send('panel:loadContent', { id, historyStr }))
    win.on('focus', () => this.mainWindow?.webContents.send('panel:focus', { id }))
    return { ok: true }
  }

  setPanelAlwaysOnTop(id: string, onTop: boolean): void {
    const win = this.popoutWindows.get(id)
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!onTop)
  }

  requestDockPanel(id: string, html: string): void {
    const win = this.popoutWindows.get(id)
    if (win && !win.isDestroyed()) win.close()
    this.mainWindow?.webContents.send('panel:dock', { id, html })
  }

  // ── 脚本编辑器弹窗（单例）──
  popoutScriptEditor(graphStr: string, activeScriptName: string): { ok: boolean } {
    const { preloadPath, devServerUrl, rendererDist, isDev, showWindow } = this.cfg
    this.scriptEditorPopoutPayload = { graphStr: graphStr || '', activeScriptName: activeScriptName || '' }
    if (this.scriptEditorPopoutWindow && !this.scriptEditorPopoutWindow.isDestroyed()) {
      if (this.scriptEditorPopoutWindow.isMinimized()) this.scriptEditorPopoutWindow.restore()
      this.scriptEditorPopoutWindow.show()
      this.scriptEditorPopoutWindow.focus()
      this.scriptEditorPopoutWindow.webContents.send('script-editor:popout-payload', this.scriptEditorPopoutPayload)
      return { ok: true }
    }

    const win = new BrowserWindow({
      width: 1200, height: 780, minWidth: 720, minHeight: 480,
      title: '脚本编辑器', resizable: true, show: showWindow,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      titleBarOverlay: this.popoutOverlay(),
      frame: process.platform === 'linux' ? false : undefined,
      webPreferences: { preload: preloadPath, contextIsolation: true, additionalArguments: ['--script-editor-popout'] }
    })

    this.scriptEditorPopoutWindow = win
    win.on('closed', () => { this.scriptEditorPopoutWindow = null })

    if (isDev) win.loadURL(devServerUrl + '/src/app/script-editor.html')
    else win.loadFile(path.join(rendererDist, 'app/script-editor.html'))

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('script-editor:popout-payload', this.scriptEditorPopoutPayload)
    })

    return { ok: true }
  }

  requestDockScriptEditor(payload?: { graphStr?: string; activeScriptName?: string }): void {
    if (this.scriptEditorPopoutWindow && !this.scriptEditorPopoutWindow.isDestroyed()) {
      this.scriptEditorPopoutWindow.close()
    }
    this.mainWindow?.webContents.send('script-editor:dock', {
      graphStr: payload?.graphStr || '',
      activeScriptName: payload?.activeScriptName || ''
    })
  }

  /** 弹窗侧主动拉取首包（兜底 did-finish-load 推送早于 React mount 的时序竞态）。 */
  requestPayloadScriptEditor(e: IpcMainInvokeEvent): void {
    e.sender.send('script-editor:popout-payload', this.scriptEditorPopoutPayload)
  }

  // ── 脚本输出弹窗（单例）──
  popoutScriptOutput(payload?: { lines?: Array<{ text: string; ts: number }>; scriptName?: string }): { ok: boolean } {
    const { preloadPath, devServerUrl, rendererDist, isDev, showWindow } = this.cfg
    this.scriptOutputPopoutPayload = {
      lines: Array.isArray(payload?.lines) ? payload!.lines : [],
      scriptName: payload?.scriptName || ''
    }
    if (this.scriptOutputPopoutWindow && !this.scriptOutputPopoutWindow.isDestroyed()) {
      if (this.scriptOutputPopoutWindow.isMinimized()) this.scriptOutputPopoutWindow.restore()
      this.scriptOutputPopoutWindow.show()
      this.scriptOutputPopoutWindow.focus()
      this.scriptOutputPopoutWindow.webContents.send('script-output:popout-payload', this.scriptOutputPopoutPayload)
      return { ok: true }
    }

    const win = new BrowserWindow({
      width: 720, height: 480, minWidth: 420, minHeight: 280,
      title: '脚本输出', resizable: true, show: showWindow,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      titleBarOverlay: this.popoutOverlay(),
      frame: process.platform === 'linux' ? false : undefined,
      webPreferences: { preload: preloadPath, contextIsolation: true, additionalArguments: ['--script-output-popout'] }
    })

    this.scriptOutputPopoutWindow = win
    win.on('closed', () => {
      this.scriptOutputPopoutWindow = null
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('script-output:closed')
      }
    })

    if (isDev) win.loadURL(devServerUrl + '/src/app/script-output.html')
    else win.loadFile(path.join(rendererDist, 'app/script-output.html'))

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('script-output:popout-payload', this.scriptOutputPopoutPayload)
    })

    return { ok: true }
  }

  syncScriptOutput(payload?: { lines?: Array<{ text: string; ts: number }>; scriptName?: string }): void {
    this.scriptOutputPopoutPayload = {
      lines: Array.isArray(payload?.lines) ? payload!.lines : [],
      scriptName: payload?.scriptName ?? this.scriptOutputPopoutPayload.scriptName
    }
    if (this.scriptOutputPopoutWindow && !this.scriptOutputPopoutWindow.isDestroyed()) {
      this.scriptOutputPopoutWindow.webContents.send('script-output:sync', this.scriptOutputPopoutPayload)
    }
  }

  requestCloseScriptOutput(): void {
    if (this.scriptOutputPopoutWindow && !this.scriptOutputPopoutWindow.isDestroyed()) {
      this.scriptOutputPopoutWindow.close()
    }
  }

  requestClearScriptOutput(): void {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === this.scriptOutputPopoutWindow || w.isDestroyed()) continue
      w.webContents.send('script-output:clear-request')
    }
  }

  requestPayloadScriptOutput(e: IpcMainInvokeEvent): void {
    e.sender.send('script-output:popout-payload', this.scriptOutputPopoutPayload)
  }

  // ── 示波器置顶 ──
  setOscilloscopeTop(flag: boolean): void {
    const wins = BrowserWindow.getAllWindows()
    const child = wins.find(w => {
      const title = w.getTitle()
      return !!(title && title.startsWith('示波器'))
    })
    if (child) {
      child.setAlwaysOnTop(flag)
      child.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: flag })
    }
  }
}
