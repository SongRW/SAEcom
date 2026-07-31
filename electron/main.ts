import { app, BrowserWindow, ipcMain, shell, dialog, session } from 'electron'
import { SerialPort } from 'serialport'
import { randomUUID } from 'crypto'
import path from 'node:path'
import fs from 'node:fs'
import vm from 'node:vm'
import https from 'node:https'
import { spawn, execFile } from 'node:child_process'
import os from 'node:os'
import { seedSampleScripts } from './sampleScripts'
import { importScriptFile } from './scriptImport'
import net from 'node:net'
import {
  bytesToNumber,
  checksum,
  chunkString,
  convertEncoding,
  crc8,
  crc16,
  crc16ccitt,
  crc32,
  createSandboxState,
  swapBytes,
  updateLastRecv
} from './scriptSandbox'
import {
  modbusClients, ensureModbusOpen, closeModbus, readOnce, writeOnce,
  applyPolls, setModbusBroadcaster,
} from './modbusService'

let iconv: any = null
try { iconv = require('iconv-lite') } catch { iconv = null }

// ========== E2E 测试钩子（仅当对应环境变量存在时生效，开发/打包零影响） ==========
// SAECOM_FORCE_PROD=1：直接跑 out/main/index.js 时 app.isPackaged 仍为 false，会误走 dev 分支连
//   127.0.0.1:5273（dev server 没起 → 白屏）。此开关强制按 prod 加载 out/renderer 产物。
// SAECOM_USER_DATA=<dir>：隔离持久化目录，避免测试污染本地 ~/Library/Application Support/SAEcom。
// SAECOM_E2E=1：关闭启动副作用（更新检查会弹模态 dialog 阻塞测试窗口）。
const FORCE_PROD = process.env.SAECOM_FORCE_PROD === '1'
const E2E_USER_DATA = process.env.SAECOM_USER_DATA || ''
const E2E_MODE = process.env.SAECOM_E2E === '1'
// E2E 时窗口不显示（show:false），避免测试期间窗口弹出抢焦点、挡屏幕。
// 渲染层照常工作，Playwright 仍可操作 DOM；显式 .show()（如 popout 恢复）不受影响。
const showWindow = !E2E_MODE
if (E2E_USER_DATA) {
  // app.setPath 必须在 app ready 前、且在 configPath/commandsPath/scriptsDir 读取 userData 前调用。
  app.setPath('userData', E2E_USER_DATA)
}

// electron-vite dev/prod 模式判断
const isDev = !app.isPackaged && !FORCE_PROD
// electron-vite 会把实际 dev server 地址写入 ELECTRON_RENDERER_URL；
// 默认回退到本项目固定端口 5273（与常见前端 5173 错开，见 electron.vite.config.ts）。
const DEV_SERVER_URL = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5273'
// preload 编译输出到 out/preload/index.js（与 main 同级的 ../preload/）
const PRELOAD_PATH = path.join(__dirname, '../preload/index.js')
// 渲染进程产物：dev 模式由 dev server 提供，prod 模式在 out/renderer/src/
// （electron-vite renderer root='.', entry=src/app/mainwindow.html → 输出保留 src/ 前缀）
const RENDERER_DIST = path.join(__dirname, '../renderer/src')

const runningScripts = new Map<string, any>()
const ports = new Map<string, any>()
const scriptWatchers = new Map<string, Map<string, any>>()

// 把 BrowserWindow 广播能力注入 modbus 服务
setModbusBroadcaster((channel, payload) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
})

const configPath = path.join(app.getPath('userData'), 'panels.json')
const commandsPath = path.join(app.getPath('userData'), 'commands.json')
const scriptsDir = path.join(app.getPath('userData'), 'scripts')

interface ScriptListenOptions {
  bufferMs?: number
  append?: string
}

// ========== 工具 ==========
function writeGeneric(id: string, data: string, mode: string, append: string): Promise<any> {
  if (id.startsWith('tcp://')) {
    const entry = sockets.get(id)
    if (!entry || !entry.socket) return Promise.resolve({ ok: false, error: 'NOT_OPEN' })
    let buf
    try { buf = buildWriteBuffer(data, mode, append) } catch (e: any) { return Promise.resolve({ ok: false, error: e.message }) }
    return new Promise(res => entry.socket.write(buf, (err: any) => res(err ? { ok: false, error: err.message } : { ok: true, bytes: buf.length })))
  } else {
    return writeToSerial(id, data, mode, append)
  }
}
function shouldSuppressPortError(entry: any, err: any): boolean {
  if (!entry) return true
  if (entry.suppressErrorUntil && Date.now() < entry.suppressErrorUntil) return true
  const msg = String(err?.message || '').toLowerCase()
  if (msg.includes('port is not open')) return true
  return false
}
function loadJsonSafe(file: string, fallback: any): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return fallback }
}
function saveJsonSafe(file: string, data: any): void {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8') } catch (e) { console.error(e) }
}
function ensureScriptsDir(): void { try { fs.mkdirSync(scriptsDir, { recursive: true }) } catch { } }
function safeScriptName(name: string): string {
  name = String(name || '').trim().replace(/[/\\]/g, '')
  // 数据文件(.txt)保留原名；脚本文件(.js)确保扩展名
  if (!name.endsWith('.js') && !name.endsWith('.txt')) name += '.js'
  return name
}

/** 内置示例脚本源目录：dev/e2e 走仓库 shared/samples；打包后走 asar 内同路径。 */
function resolveSampleScriptsDir(): string | null {
  const candidates = [
    path.join(__dirname, '../../shared/samples'),
    path.join(app.getAppPath(), 'shared/samples'),
    path.join(process.resourcesPath || '', 'shared/samples')
  ]
  for (const dir of candidates) {
    try {
      if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir
    } catch { /* ignore */ }
  }
  return null
}

function seedBundledSampleScripts(): void {
  const sampleDir = resolveSampleScriptsDir()
  if (!sampleDir) return
  seedSampleScripts({
    sampleDir,
    scriptsDir,
    statePath: path.join(app.getPath('userData'), 'sample-scripts.json')
  })
}
function getPortId(portPath: string): string { return portPath }

// ========== 配置 ==========
const loadPanelsConfig = () => loadJsonSafe(configPath, [])
const savePanelsConfig = (panels: any) => saveJsonSafe(configPath, panels)
const loadCommandsConfig = () => loadJsonSafe(commandsPath, [])
const saveCommandsConfig = (cmds: any) => saveJsonSafe(commandsPath, cmds)

// ========== 窗口 ==========
let mainWindow: BrowserWindow | null = null

/** popout 窗注册表：panel id → BrowserWindow。支持后续 setAlwaysOnTop 等操作（取代 legacy fire-and-forget）。 */
const popoutWindows = new Map<string, BrowserWindow>()

/** 脚本编辑器弹出窗：单例（一次仅一个编辑器弹窗，二次弹窗聚焦已有） */
let scriptEditorPopoutWindow: BrowserWindow | null = null

/** 弹出窗图快照：主窗弹出时塞入，did-finish-load 后回灌弹窗；dock 时弹窗再带新图回主窗。 */
let scriptEditorPopoutPayload: { graphStr: string; activeScriptName: string } = { graphStr: '', activeScriptName: '' }

/** 脚本输出弹出窗：单例；host 持有日志 source of truth，经 sync 推到此窗。 */
let scriptOutputPopoutWindow: BrowserWindow | null = null
let scriptOutputPopoutPayload: { lines: Array<{ text: string; ts: number }>; scriptName: string } = {
  lines: [],
  scriptName: ''
}

/**
 * 当前主题（深色？）。由 renderer 的 theme:set 维护。
 * popout 窗创建时按此值初始化 win32 titleBarOverlay 的底色/图标色，
 * 让弹出窗的窗口控件跟随深浅主题（此前只 mainWindow 跟随，popout 窗 overlay 不变）。
 */
let currentDark = false

/**
 * 外链打开判定 + 副作用：http/https/mailto 走系统默认浏览器打开，并返回 true（表示已处理）。
 * 模块级，供 createMainWindow 逐窗口注册 与 全局 web-contents-created handler 共用——
 * 外链防护是全局单一权威，避免依赖注册时机（谁最后 setWindowOpenHandler 谁胜出，脆弱）
 * 以及 popout/示波器/脚本编辑器/about/changelog 等窗口无逐窗口 handler 而漏防护。
 */
function openExternal(url: string): boolean {
  return (/^https?:/i.test(url) || /^mailto:/i.test(url)) && (shell.openExternal(url), true)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    autoHideMenuBar: true,
    show: showWindow,
    titleBarStyle: process.platform === 'win32' ? 'hidden' : undefined,
    titleBarOverlay: process.platform === 'win32' ? { color: '#f5f7fa', symbolColor: '#1f2937', height: 30 } : undefined,
    // webviewTag 默认 false：src/ 内未使用 <webview>，关闭以收敛渲染层能力（review 第 6 项）。
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true }
  })
  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL + '/src/app/mainwindow.html')
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'app/mainwindow.html'))
  }
  mainWindow.on('closed', () => {
    BrowserWindow.getAllWindows().forEach(win => { if (win !== mainWindow) win.close() })
    mainWindow = null
  })
  // 外链防护以全局 web-contents-created handler 为单一权威；此处仅保留主窗 will-navigate 拦截。
  mainWindow.webContents.on('will-navigate', (e, url) => { if (openExternal(url)) e.preventDefault() })
  mainWindow.webContents.on('did-fail-load', (_e, ec, desc, url) => { console.log('[FAIL]', ec, desc, url) })
}

const shares = new Map<string, any>()

function isRfc1918(ip: string): boolean {
  if (/^10\./.test(ip)) return true
  const m172 = ip.match(/^172\.(\d+)\./)
  if (m172) {
    const n = parseInt(m172[1], 10)
    if (n >= 16 && n <= 31) return true
  }
  if (/^192\.168\./.test(ip)) return true
  return false
}

/**
 * 脚本 TCP 客户端连接池：listenTcpPackets 建立的连接按 runId+host:port 注册，
 * sendTCP 优先复用同一条连接回写——这样「接收TCP + 发送TCP」可在同一条 TCP
 * 连接上闭环（典型场景：echo server / 一收一发协议）。
 * key = `${runId}|${host}|${port}`
 */
interface ScriptTcpClientEntry {
  socket: net.Socket
  host: string
  port: number
  runId: string
}
const scriptTcpClients = new Map<string, ScriptTcpClientEntry>()

function scriptTcpClientKey(runId: string, host: string, port: number): string {
  return `${runId}|${host}|${port}`
}

function registerScriptTcpClient(runId: string, host: string, port: number, socket: net.Socket): void {
  const key = scriptTcpClientKey(runId, host, port)
  const prev = scriptTcpClients.get(key)
  if (prev && prev.socket !== socket) {
    try { prev.socket.destroy() } catch { /* ignore */ }
  }
  scriptTcpClients.set(key, { socket, host, port, runId })
  socket.once('close', () => {
    const cur = scriptTcpClients.get(key)
    if (cur && cur.socket === socket) scriptTcpClients.delete(key)
  })
}

function findScriptTcpClient(runId: string, host: string, port: number): net.Socket | null {
  const key = scriptTcpClientKey(runId, host, port)
  const entry = scriptTcpClients.get(key)
  return entry && !entry.socket.destroyed ? entry.socket : null
}

function removeScriptTcpClients(runId: string): void {
  for (const [key, entry] of Array.from(scriptTcpClients.entries())) {
    if (entry.runId === runId) {
      try { entry.socket.destroy() } catch { /* ignore */ }
      scriptTcpClients.delete(key)
    }
  }
}

function looksVirtual(ifname: string = ''): boolean {
  const n = (ifname || '').toLowerCase()
  return /(vmnet|vmware|virtualbox|vbox|hyper[- ]?v|wsl|docker|hamachi|zerotier|bridge|npcap|npf|tap|tun|loopback)/i.test(n)
}

function listLanIPv4(): string[] {
  const ifs = os.networkInterfaces()
  const all: any[] = []

  for (const name of Object.keys(ifs)) {
    for (const inf of ifs[name] || []) {
      if (inf.family !== 'IPv4') continue
      if (inf.internal) continue

      const ip = inf.address
      const entry = {
        ip,
        ifname: name,
        score: 0,
        virt: looksVirtual(name)
      }
      if (isRfc1918(ip)) entry.score += 100
      else if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) entry.score += 20
      else entry.score += 5
      if (entry.virt) entry.score -= 50

      all.push(entry)
    }
  }

  if (!all.length) return ['127.0.0.1']
  const hasPrivate = all.some(a => isRfc1918(a.ip) && !a.virt)
  const cand = hasPrivate ? all.filter(a => isRfc1918(a.ip)) : all

  cand.sort((a, b) => b.score - a.score)
  return cand.map(a => a.ip)
}

const sockets = new Map<string, any>()
const tcpServerDataBuffer = new Map<string, string[]>()
const tcpServerWatchers = new Map<string, Map<string, (value: string) => Promise<void> | void>>()
const TCP_SERVER_DATA_QUEUE_LIMIT = 256
const TCP_DEFAULTS = {
  timeoutMs: 2500,
  keepAlive: true,
  keepAliveSec: 60,
  noDelay: true,
  autoReconnect: false,
  reconnectMs: 2000
}

function pushTcpServerData(serverId: string, data: string): void {
  const queue = tcpServerDataBuffer.get(serverId) || []
  queue.push(data)
  while (queue.length > TCP_SERVER_DATA_QUEUE_LIMIT) queue.shift()
  tcpServerDataBuffer.set(serverId, queue)
}

function shiftTcpServerData(serverId: string): string | undefined {
  const queue = tcpServerDataBuffer.get(serverId)
  if (!queue?.length) return undefined
  const data = queue.shift()
  if (!queue.length) tcpServerDataBuffer.delete(serverId)
  return data
}

function addTcpServerWatcher(serverId: string, watcherId: string, fn: (value: string) => Promise<void> | void): void {
  if (!tcpServerWatchers.has(serverId)) tcpServerWatchers.set(serverId, new Map())
  tcpServerWatchers.get(serverId)!.set(watcherId, fn)
}

function removeTcpServerWatcher(serverId: string, watcherId: string): void {
  const watchers = tcpServerWatchers.get(serverId)
  if (!watchers) return
  watchers.delete(watcherId)
  if (!watchers.size) tcpServerWatchers.delete(serverId)
}

function removeTcpServerWatchers(runIdOrWatcherId: string): void {
  for (const [serverId, watchers] of tcpServerWatchers) {
    for (const id of Array.from(watchers.keys())) {
      if (id === runIdOrWatcherId || id.startsWith(`${runIdOrWatcherId}:`)) watchers.delete(id)
    }
    if (!watchers.size) tcpServerWatchers.delete(serverId)
  }
}

function notifyTcpServerWatchers(serverId: string, data: string): void {
  const watchers = tcpServerWatchers.get(serverId)
  if (!watchers) return
  for (const fn of watchers.values()) {
    try { void Promise.resolve(fn(data)).catch(() => { }) } catch { }
  }
}

ipcMain.handle('tcp:open', async (e: any, { host, port, options }) => {
  const opts = Object.assign({}, TCP_DEFAULTS, options || {})
  const id = `tcp://${host}:${port}`
  if (sockets.has(id)) return { ok: true, id, already: true }

  const entry: any = { id, host, port, opts, win: e.sender, manualClose: false, socket: null }

  function start(resolveOpen?: (r: any) => void, rejectOpen?: (r: any) => void) {
    const s = new net.Socket()
    entry.socket = s
    try {
      s.setNoDelay(!!opts.noDelay)
      if (opts.keepAlive) s.setKeepAlive(true, opts.keepAliveSec * 1000)
    } catch { }

    s.once('connect', () => {
      try { entry.win.send('tcp:event', { id, type: 'open' }) } catch { }
      resolveOpen && resolveOpen({ ok: true, id })
    }); s.on('data', (buf) => {
      const dataBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8')
      // 直传 Buffer（Uint8Array 子类）：Electron IPC structured clone 零拷贝传输，
      // 替代旧的 base64 往返（省 toString('base64') + Buffer.from(b64) 两次堆分配）
      try { entry.win.send('tcp:data', { id, bytes: dataBuffer, ts: Date.now() }) } catch { }
      notifyScriptWatchers(id, dataBuffer)
    })
    s.on('error', (err) => {
      try { entry.win.send('tcp:event', { id, type: 'error', message: String(err?.message || err) }) } catch { }
      rejectOpen && rejectOpen({ ok: false, error: String(err?.message || err) })
    })
    s.on('close', () => {
      try { entry.win.send('tcp:event', { id, type: 'close' }) } catch { }
      if (entry.manualClose) { sockets.delete(id); return }
      if (opts.autoReconnect) setTimeout(() => { if (sockets.has(id)) start() }, opts.reconnectMs)
      else sockets.delete(id)
    })

    try { s.connect({ host, port }) } catch (err: any) {
      // 同步抛错也必须 settle 外层 promise，否则渲染层 await 永久挂起。
      sockets.delete(id)
      rejectOpen && rejectOpen({ ok: false, error: String(err?.message || err) })
      return
    }

    if (opts.timeoutMs > 0) {
      setTimeout(() => {
        if (!s.destroyed && !s.remoteAddress) {
          try { s.destroy(new Error('连接超时')) } catch { }
        }
      }, opts.timeoutMs)
    }
  }

  sockets.set(id, entry)
  return await new Promise((resolve) => {
    let settled = false
    const resolveOnce = (r: any) => { if (!settled) { settled = true; resolve(r) } }
    start((r) => resolveOnce(r), (r) => resolveOnce(r))
    if (opts.timeoutMs > 0) {
      setTimeout(() => {
        if (!entry.socket?.remoteAddress) {
          try { entry.socket?.destroy(new Error('连接超时')) } catch { }
          resolveOnce({ ok: false, error: '连接超时' })
        }
      }, opts.timeoutMs)
    }
  })
})

ipcMain.handle('tcp:write', async (_e, { id, data, mode = 'text', append = 'none', encoding = 'utf-8' }) => {
  const entry = sockets.get(id)
  if (!entry || !entry.socket) return { ok: false, error: 'NOT_OPEN' }
  let buf
  try { buf = buildWriteBuffer(data, mode, append, encoding) } catch (e: any) { return { ok: false, error: e.message } }
  return await new Promise(res => entry.socket.write(buf, (err: any) => res(err ? { ok: false, error: err.message } : { ok: true, bytes: buf.length })))
})

ipcMain.handle('tcp:close', async (_e, { id }) => {
  const entry = sockets.get(id)
  if (!entry) return { ok: true, notOpen: true }
  entry.manualClose = true
  try { entry.socket.end(); entry.socket.destroy() } catch { }
  sockets.delete(id)
  return { ok: true }
})

// ========== TCP 服务器 ==========
const tcpServers = new Map<string, any>()
const tcpServerStarts = new Map<string, Promise<any>>()

ipcMain.handle('tcpServer:start', async (e: any, { port, echo }) => {
  const wantEcho = !!echo
  const serverId = `tcpServer:${port}${wantEcho ? ':echo' : ''}`
  if (tcpServers.has(serverId)) {
    return { ok: true, id: serverId, port, already: true }
  }

  const server = net.createServer()
  const clients = new Set<any>()
  const win = e.sender

  server.on('connection', (sock) => {
    try { sock.setNoDelay(true); sock.setKeepAlive(true, 60000) } catch { }
    clients.add(sock)
    const clientId = `${sock.remoteAddress}:${sock.remotePort}`
    try { win.send('tcpServer:event', { serverId, type: 'connection', clientId, remoteAddress: sock.remoteAddress, remotePort: sock.remotePort }) } catch { }

    sock.on('data', (buf) => {
      const dataBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8')
      const dataText = dataBuffer.toString('utf8')
      // echo 模式：原样回写，用于脚本收发闭环自测（二进制安全）
      if (wantEcho) { try { sock.write(dataBuffer) } catch { /* ignore */ } }
      // 直传 Buffer（Uint8Array 子类），structured clone 零拷贝，替代 base64 往返
      try { win.send('tcpServer:data', { serverId, clientId, bytes: dataBuffer, ts: Date.now() }) } catch { }
      pushTcpServerData(serverId, dataText)
      notifyTcpServerWatchers(serverId, dataText)
    })

    sock.on('close', () => {
      clients.delete(sock)
      try { win.send('tcpServer:event', { serverId, type: 'disconnect', clientId }) } catch { }
    })

    sock.on('error', () => {
      try { sock.destroy() } catch { }
      clients.delete(sock)
    })
  })

  server.on('error', (err) => {
    console.error('TCP Server error:', err?.message || err)
  })

  return await new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const addr = server.address()
      const realPort = addr && typeof addr === 'object' ? addr.port : port
      const realId = `tcpServer:${realPort}${wantEcho ? ':echo' : ''}`
      tcpServers.set(realId, { server, port: realPort, clients, win })
      resolve({ ok: true, id: realId, port: realPort, echo: wantEcho })
    }).on('error', (err) => {
      resolve({ ok: false, error: err?.message || '启动失败' })
    })
  })
})

ipcMain.handle('tcpServer:stop', async (_e, { id }) => {
  const entry = tcpServers.get(id)
  if (!entry) return { ok: true, notOpen: true }

  for (const c of entry.clients) { try { c.destroy() } catch { } }
  entry.clients.clear()
  try { entry.server.close() } catch { }
  tcpServers.delete(id)
  tcpServerDataBuffer.delete(id)
  tcpServerWatchers.delete(id)
  return { ok: true }
})

ipcMain.handle('tcpServer:status', async (_e, { id }) => {
  const entry = tcpServers.get(id)
  if (!entry) return { ok: true, active: false }
  return { ok: true, active: true, port: entry.port, clients: entry.clients.size }
})

ipcMain.handle('tcpServer:broadcast', async (_e, { id, data, mode = 'text', append = 'none', encoding = 'utf-8' }) => {
  const entry = tcpServers.get(id)
  if (!entry) return { ok: false, error: '服务器未启动' }
  if (entry.clients.size === 0) return { ok: false, error: '无客户端连接' }

  let buf
  try { buf = buildWriteBuffer(data, mode, append, encoding) } catch (e: any) { return { ok: false, error: e.message } }

  let sent = 0
  let failed = 0
  for (const c of entry.clients) {
    if (!c.destroyed) {
      try { c.write(buf); sent++ } catch { failed++ }
    }
  }
  return { ok: true, sent, failed, bytes: buf.length }
})

// ========== 串口 ==========
function buildWriteBuffer(data: string, mode: string, append: string, encoding: string = 'utf-8'): Buffer {
  let payload: string = data || ''
  if (append === 'CR') payload += '\r'
  else if (append === 'LF') payload += '\n'
  else if (append === 'CRLF') payload += '\r\n'
  if (mode === 'hex') {
    const clean = payload.replace(/[\s,]/g, '')
    if (clean.length % 2 !== 0) throw new Error('HEX长度必须为偶数')
    return Buffer.from(clean.match(/.{1,2}/g)!.map(h => parseInt(h, 16)))
  }
  if (mode === 'base64') return Buffer.from(payload, 'base64')
  const enc = (encoding || 'utf-8').toLowerCase()
  if (enc !== 'utf-8' && enc !== 'utf8' && iconv && iconv.encodingExists(enc)) {
    return iconv.encode(payload, enc)
  }
  return Buffer.from(payload, 'utf8')
}
function writeToSerial(id: string, data: string, mode: string = 'text', append: string = 'none', encoding: string = 'utf-8'): Promise<any> {
  const entry = ports.get(id)
  if (!entry) return Promise.resolve({ ok: false, error: 'PORT_NOT_OPEN' })
  let buf; try { buf = buildWriteBuffer(data, mode, append, encoding) } catch (e: any) { return Promise.resolve({ ok: false, error: e.message }) }
  return new Promise(r => entry.port.write(buf, (err: any) => r(err ? { ok: false, error: err.message } : { ok: true, bytes: buf.length })))
}
function normalizeSerialOpenOptions(options: any = {}): any {
  return {
    baudRate: parseInt(options.baudRate || 115200, 10) || 115200,
    dataBits: parseInt(options.dataBits || 8, 10) || 8,
    stopBits: parseInt(options.stopBits || 1, 10) || 1,
    parity: options.parity || 'none',
    rtscts: !!options.rtscts,
    xon: !!options.xon,
    xoff: !!options.xoff,
    xany: !!options.xany
  }
}
async function ensureSerialOpen(portPath: string, options: any = {}): Promise<any> {
  const id = getPortId(String(portPath || '').trim())
  if (!id) return { ok: false, error: '未选择串口' }
  const normalized = normalizeSerialOpenOptions(options)
  const existing = ports.get(id)
  if (existing?.port && existing.port.isOpen !== false) {
    existing.options = normalized
    return { ok: true, id, alreadyOpen: true }
  }

  return await new Promise((resolve) => {
    const port = new SerialPort({
      path: id,
      baudRate: normalized.baudRate,
      dataBits: normalized.dataBits,
      stopBits: normalized.stopBits,
      parity: normalized.parity,
      rtscts: normalized.rtscts,
      xon: normalized.xon,
      xoff: normalized.xoff,
      xany: normalized.xany,
      autoOpen: false
    } as any)

    const sendAll = (ch: string, payload: any) =>
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send(ch, payload))

    let done = false
    const finish = (r: any) => { if (!done) { done = true; resolve(r) } }

    port.once('open', () => {
      port.on('data', (b: Buffer) => {
        // 直传 Buffer（Uint8Array 子类），structured clone 零拷贝，替代 base64 往返
        sendAll('serial:data', { id, bytes: b, ts: Date.now() })
        notifyScriptWatchers(id, b)
      })
      port.on('close', () => {
        sendAll('serial:event', { id, type: 'close' })
        try { if (shares.has(id)) stopTcpShare(id) } catch { }
        ports.delete(id)
      })
      port.on('error', (e: any) => {
        const ent = ports.get(id)
        if (shouldSuppressPortError(ent, e)) return
        sendAll('serial:event', { id, type: 'error', message: e?.message || String(e) })
      })

      ports.set(id, { port, options: normalized })
      sendAll('serial:event', { id, type: 'open' })
      finish({ ok: true, id })
    })

    port.once('error', (err: any) => {
      finish({ ok: false, error: err?.message || String(err) })
    })

    const to = setTimeout(() => {
      if (!port.isOpen) {
        try { port.close() } catch { }
        finish({ ok: false, error: 'OPEN_TIMEOUT' })
      }
    }, 2500)

    port.open((err: any) => { if (err) { clearTimeout(to); finish({ ok: false, error: err.message }) } })
  })
}
function startTcpShare(portId: string, sharePort: number = 9000): any {
  if (shares.has(portId)) return shares.get(portId)
  const ent = ports.get(portId)
  if (!ent || !ent.port || !ent.port.isOpen) {
    throw new Error('串口未打开，无法共享')
  }

  const srv = net.createServer()
  const clients = new Set<any>()

  const onSerialData = (buf: Buffer) => {
    for (const c of clients) {
      if (!c.destroyed) {
        try { c.write(buf) } catch { }
      }
    }
  }
  ent.port.on('data', onSerialData)

  srv.on('connection', (sock) => {
    try { sock.setNoDelay(true); sock.setKeepAlive(true, 60000) } catch { }
    clients.add(sock)
    sock.on('data', (buf) => {
      try { ent.port.write(buf) } catch { }
    })
    sock.on('close', () => clients.delete(sock))
    sock.on('error', () => { try { sock.destroy() } catch { } clients.delete(sock) })
  })

  srv.on('error', (err) => {
    console.error('TCP Share error:', err?.message || err)
  })

  srv.listen(sharePort)

  const rec = { server: srv, port: sharePort, clients, onSerialData }
  shares.set(portId, rec)
  return rec
}

function stopTcpShare(portId: string): void {
  const rec = shares.get(portId)
  if (!rec) return
  try {
    for (const c of rec.clients) { try { c.destroy() } catch { } }
    rec.clients.clear()
    rec.server.close()
  } catch { }
  const ent = ports.get(portId)
  if (ent?.port && rec.onSerialData) {
    try { ent.port.off('data', rec.onSerialData) } catch { }
  }
  shares.delete(portId)
}

ipcMain.handle('tcpShare:start', (_e, { id, port }) => {
  const p = parseInt(port, 10) || 9000
  const rec = startTcpShare(id, p)
  const ips = listLanIPv4()
  const addrs = ips.map(ip => `${ip}:${rec.port}`)
  return { ok: true, port: rec.port, addrs, best: addrs[0], candidates: addrs }
})

ipcMain.handle('tcpShare:stop', (_e, { id }) => {
  stopTcpShare(id)
  return { ok: true }
})

ipcMain.handle('tcpShare:status', (_e, { id }) => {
  const rec = shares.get(id)
  if (!rec) return { ok: true, active: false }
  const ips = listLanIPv4()
  const addrs = ips.map(ip => `${ip}:${rec.port}`)
  return { ok: true, active: true, port: rec.port, addrs, best: addrs[0], candidates: addrs }
})

function addScriptWatcher(portId: string, runId: string, fn: any): void {
  if (!scriptWatchers.has(portId)) scriptWatchers.set(portId, new Map())
  scriptWatchers.get(portId)!.set(runId, fn)
}
function removeScriptWatcherExact(watcherId: string): void {
  for (const [portId, m] of scriptWatchers) {
    m.delete(watcherId)
    if (!m.size) scriptWatchers.delete(portId)
  }
}
function removeScriptWatcher(runIdOrWatcherId: string): void {
  for (const [portId, m] of scriptWatchers) {
    for (const id of Array.from(m.keys())) {
      if (id === runIdOrWatcherId || id.startsWith(`${runIdOrWatcherId}:`)) m.delete(id)
    }
    if (!m.size) scriptWatchers.delete(portId)
  }
}
function notifyScriptWatchers(portId: string, buf: Buffer): void {
  const m = scriptWatchers.get(portId); if (!m) return
  // text 用 latin1：逐字节映射到 charCode 0..255，二进制协议可经 textToHex 无损还原。
  // UI 展示仍走 tcp:data/serial 的原始 bytes，不受影响。
  const payload = {
    bytes: Uint8Array.from(buf),
    text: (() => { try { return buf.toString('latin1') } catch { return '' } })(),
    hex: (() => { try { return buf.toString('hex').toUpperCase() } catch { return '' } })()
  }
  for (const fn of m.values()) try { fn(payload) } catch { }
}

function normalizeScriptListenOptions(options: ScriptListenOptions = {}): Required<ScriptListenOptions> {
  const bufferMs = Math.max(0, parseInt(String(options.bufferMs ?? 50), 10) || 0)
  const append = normalizeAppendMode(options.append)
  return { bufferMs, append }
}

function normalizeAppendMode(value: unknown): string {
  if (value === '无' || value === 'none') return 'none'
  const mode = String(value || 'CRLF').toUpperCase()
  if (mode === 'CR') return 'CR'
  if (mode === 'LF') return 'LF'
  if (mode === 'CRLF') return 'CRLF'
  return 'CRLF'
}

function trimScriptPacketEnding(value: string, append: string): string {
  if (append === 'CR') return value.endsWith('\r') ? value.slice(0, -1) : value
  if (append === 'LF') return value.endsWith('\n') ? value.slice(0, -1) : value
  if (append === 'CRLF') return value.endsWith('\r\n') ? value.slice(0, -2) : value
  return value
}

ipcMain.handle('config:load', () => loadPanelsConfig())
ipcMain.on('config:save', (_e, p) => savePanelsConfig(p))
ipcMain.handle('commands:load', () => loadCommandsConfig())
ipcMain.on('commands:save', (_e, c) => saveCommandsConfig(c))
// commands:flush 作为退出前 flush 的完成信号：commands:save 用 send（火忘），
// 主进程 on handler 同步 writeFileSync。此 invoke 排在已到达的 save 之后（IPC FIFO），
// resolve 即表示此前 save 已落盘。before-quit 据此判断渲染层是否 flush 完毕。
let quitFlushFinish: (() => void) | null = null
ipcMain.handle('commands:flush', () => {
  if (quitFlushFinish) quitFlushFinish()
  return true
})

async function listSerialPortsSafe(): Promise<any[]> {
  let base: any[] = []
  try { base = await SerialPort.list() } catch { base = [] }

  const map = new Map<string, any>()
  for (const i of base) {
    const path = String(i.path || '').trim()
    if (!path) continue
    const key = path.toUpperCase()
    map.set(key, {
      path,
      manufacturer: i.manufacturer || '',
      serialNumber: i.serialNumber || '',
      friendlyName: i.friendlyName || i.pnpId || ''
    })
  }

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      execFile('reg', ['query', 'HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM'], { windowsHide: true },
        (err, stdout) => {
          if (!err && stdout) {
            stdout.split(/\r?\n/).forEach(line => {
              const m = line.match(/REG_SZ\s+(COM\d+)/i)
              if (m) {
                const p = m[1]
                const key = p.toUpperCase()
                if (!map.has(key)) {
                  map.set(key, { path: p, manufacturer: '', serialNumber: '', friendlyName: '（系统注册表）' })
                }
              }
            })
          }
          resolve()
        })
    })
  }

  return Array.from(map.values())
}

ipcMain.handle('serial:list', async () => {
  return await listSerialPortsSafe()
})

ipcMain.handle('serial:open', async (_e, { path: p, options }) => {
  return await ensureSerialOpen(p, options)
})
ipcMain.handle('serial:close', async (_e, { id }) => {
  const entry = ports.get(id)
  if (!entry) return { ok: true, notOpen: true }

  entry.suppressErrorUntil = Date.now() + 800

  if (entry.port && entry.port.isOpen === false) {
    ports.delete(id)
    return { ok: true, notOpen: true }
  }
  return await new Promise((resolve) => {
    entry.port.close((err: any) => {
      if (err) return resolve({ ok: false, error: err.message })
      resolve({ ok: true })
    })
  })
})


ipcMain.handle('serial:write', async (_e, a: any) => writeToSerial(a.id, a.data, a.mode, a.append, a.encoding))

// ============ Modbus ============
ipcMain.handle('modbus:open', async (_e, panelId: string, opts: any) => ensureModbusOpen(panelId, opts))
ipcMain.handle('modbus:close', async (_e, panelId: string) => { await closeModbus(panelId); return undefined })
ipcMain.handle('modbus:read', async (_e, panelId: string, slaveId: number, fc: 1 | 2 | 3 | 4, addr: number, qty: number) => {
  const entry = modbusClients.get(panelId)
  if (!entry) return { values: [], error: 'Modbus 面板未连接' }
  try {
    const values = await readOnce(entry, { slaveId, functionCode: fc, startAddress: addr, quantity: qty })
    return { values, error: undefined }
  } catch (e: any) {
    return { values: [], error: String(e?.message ?? e) }
  }
})
ipcMain.handle('modbus:write', async (_e, panelId: string, target: any) => {
  const entry = modbusClients.get(panelId)
  if (!entry) return { ok: false, error: 'Modbus 面板未连接' }
  try {
    await writeOnce(entry, target)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
})
ipcMain.handle('modbus:setPolls', async (_e, panelId: string, blocks: any[]) => {
  applyPolls(panelId, blocks)
  return undefined
})
ipcMain.handle('modbus:status', async (_e, panelId: string) => modbusClients.get(panelId)?.status ?? 'closed')

ipcMain.handle('file:readHex', (_e, filePath: string) => {
  try {
    const buf = fs.readFileSync(filePath)
    return { hex: buf.toString('hex'), length: buf.length }
  } catch (err: any) {
    return { error: err.message || String(err) }
  }
})
// 「导入文件」（发送文件用）专用：打开对话框，与日志保存(logger:pickFile)解耦
ipcMain.handle('file:pickOpen', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择要发送的文件',
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})
ipcMain.on('window:set-fullscreen', (_e, { flag }) => mainWindow?.setFullScreen(!!flag))
ipcMain.on('window:toggle-fullscreen', () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()))
ipcMain.on('window:focus', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})
// ========== 自定义窗口栏：窗口控制 IPC（用 fromWebContents 定位当前窗，支持多窗口） ==========
ipcMain.handle('window:platform', () => process.platform as 'win32' | 'darwin' | 'linux')
ipcMain.on('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})
ipcMain.on('window:toggleMaximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})
ipcMain.handle('window:isMaximized', (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
})
// 窗口最大化态变化：为请求窗口挂一次性监听，向其 webContents 转发
const maximizeListeners = new WeakMap<BrowserWindow, () => void>()
ipcMain.on('window:subscribeMaximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  // 已订阅则跳过
  if (maximizeListeners.has(win)) return
  const emit = () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximizeChange', win.isMaximized())
  }
  win.on('maximize', emit)
  win.on('unmaximize', emit)
  maximizeListeners.set(win, emit)
})

/**
 * 把 win32 titleBarOverlay 的底色/图标色按当前主题应用到所有可见 BrowserWindow。
 * 此前仅 mainWindow 跟随主题，popout 面板/脚本编辑器弹窗的 overlay 保持初始浅色，
 * 深色模式下弹出窗右上角控件与窗体格格不入（问题4）。popout 窗用 height:38（与
 * 创建时一致），主窗用 height:30（与原行为一致）。
 */
function applyTitleBarOverlay(dark: boolean) {
  if (process.platform !== 'win32') return
  const color = dark ? '#0D1218' : '#f5f7fa'
  const symbolColor = dark ? '#E6E9EF' : '#1f2937'
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || !w.setTitleBarOverlay) continue
    // 主窗保持 30；其余（panel/script-editor popout）创建时用 38
    const isMain = w === mainWindow
    try {
      w.setTitleBarOverlay({ color, symbolColor, height: isMain ? 30 : 38 })
    } catch { /* 旧版 Electron 无 overlay */ }
  }
}

ipcMain.on('theme:set', (_e, { dark }) => {
  currentDark = !!dark
  applyTitleBarOverlay(dark)
  BrowserWindow.getAllWindows().forEach(w => w.webContents.send('theme:apply', { dark }))
})

ipcMain.handle('app:version', () => app.getVersion())
ipcMain.on('changelog:open', () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: '更新日志',
    autoHideMenuBar: true,
    show: showWindow,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true
    }
  })
  if (isDev) {
    win.loadURL(DEV_SERVER_URL + '/src/app/changelog.html')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'app/changelog.html'))
  }
})
ipcMain.on('changelog:request', (event) => {
  const mdPath = path.join(__dirname, '../..', 'CHANGELOG.md')
  fs.readFile(mdPath, 'utf-8', (err, data) => {
    if (err) {
      event.reply('changelog:content', '# 加载失败\n无法读取 CHANGELOG.md 文件。')
    } else {
      event.reply('changelog:content', data)
    }
  })
})
ipcMain.on('app:checkUpdate', () => {
  checkForUpdates(true)
})

// 关于独立窗口（同 changelog 模式）
ipcMain.on('about:open', () => {
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    title: '关于',
    autoHideMenuBar: true,
    show: showWindow,
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true }
  })
  if (isDev) {
    win.loadURL(DEV_SERVER_URL + '/src/app/about.html')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'app/about.html'))
  }
})

ipcMain.on('about:request', (event) => {
  event.reply('about:content', {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  })
})

ipcMain.on('panel:request-hide', (e, { id }) => {
  mainWindow?.webContents.send('panel:hide', { id })
  const win = BrowserWindow.fromWebContents(e.sender)
  win?.close()
})
ipcMain.handle('panel:saveLog', async (_e, { name, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({ title: '保存面板数据', defaultPath: `${name || '面板数据'}.txt`, filters: [{ name: '文本文件', extensions: ['txt'] }] })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true, filePath } } catch (e: any) { return { ok: false, error: e.message } }
})
ipcMain.handle('panel:popout', (_e, { id, title, historyStr, alwaysOnTop, isOpen, viewMode, optionsStr }) => {
  if (!mainWindow) return { ok: false, error: 'MAIN_WINDOW_MISSING' }

  // 已有该 id 的 popout 窗：聚焦而非重复创建
  const existing = popoutWindows.get(id)
  if (existing) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return { ok: true }
  }

  const win = new BrowserWindow({
    width: 600,
    height: 420,
    minWidth: 550,
    minHeight: 300,
    alwaysOnTop: alwaysOnTop !== false,
    show: showWindow,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: currentDark ? '#0D1218' : '#f5f7fa', symbolColor: currentDark ? '#E6E9EF' : '#1f2937', height: 38 }
      : undefined,
    frame: process.platform === 'linux' ? false : undefined,
    resizable: true,
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true }
  })

  popoutWindows.set(id, win)
  win.on('closed', () => popoutWindows.delete(id))

  if (isDev) {
    const u = new URL(DEV_SERVER_URL + '/src/app/panel.html')
    u.searchParams.set('id', id)
    u.searchParams.set('title', title || '')
    u.searchParams.set('isOpen', isOpen ? '1' : '0')
    u.searchParams.set('viewMode', viewMode || 'text')
    u.searchParams.set('opts', optionsStr || '{}')
    win.loadURL(u.toString())
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'app/panel.html'), {
      query: {
        id,
        title,
        isOpen: isOpen ? '1' : '0',
        viewMode: viewMode || 'text',
        opts: optionsStr || '{}'
      }
    })
  }

  win.webContents.once('did-finish-load', () => win.webContents.send('panel:loadContent', { id, historyStr }))
  win.on('focus', () => mainWindow?.webContents.send('panel:focus', { id }))
  return { ok: true }
})

// 脚本编辑器弹出为独立窗口（单例：已有则聚焦，不重复创建）
// 接收主窗当前图快照（graphStr）与活动脚本名，缓存在 payload 里，等弹窗 did-finish-load
// 后回灌（双向传图：弹出时主窗→弹窗，dock 时弹窗→主窗），避免弹窗/dock 回后图丢失。
ipcMain.handle('script-editor:popout', (_e, { graphStr, activeScriptName }: { graphStr?: string; activeScriptName?: string }) => {
  scriptEditorPopoutPayload = { graphStr: graphStr || '', activeScriptName: activeScriptName || '' }
  if (scriptEditorPopoutWindow && !scriptEditorPopoutWindow.isDestroyed()) {
    if (scriptEditorPopoutWindow.isMinimized()) scriptEditorPopoutWindow.restore()
    scriptEditorPopoutWindow.show()
    scriptEditorPopoutWindow.focus()
    // 已有窗：直接把最新图发过去（二次弹出聚焦场景）
    scriptEditorPopoutWindow.webContents.send('script-editor:popout-payload', scriptEditorPopoutPayload)
    return { ok: true }
  }

  // frameless + 自定义标题栏（与主窗/panel popout 一致）：
  // mac hiddenInset（红绿灯）、win hidden + titleBarOverlay（跟随主题，见 applyTitleBarOverlay）、
  // linux frame:false（自绘控件）。此前用 OS 原生栏导致弹窗顶部多一条栏，与主窗风格不一致（问题3）。
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    title: '脚本编辑器',
    resizable: true,
    show: showWindow,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: currentDark ? '#0D1218' : '#f5f7fa', symbolColor: currentDark ? '#E6E9EF' : '#1f2937', height: 38 }
      : undefined,
    frame: process.platform === 'linux' ? false : undefined,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      additionalArguments: ['--script-editor-popout']
    }
  })

  scriptEditorPopoutWindow = win
  win.on('closed', () => { scriptEditorPopoutWindow = null })

  if (isDev) {
    win.loadURL(DEV_SERVER_URL + '/src/app/script-editor.html')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'app/script-editor.html'))
  }

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('script-editor:popout-payload', scriptEditorPopoutPayload)
  })

  return { ok: true }
})

// 弹出窗请求 dock 回主窗：关闭独立窗，并把弹窗内的图快照带回主窗（双向传图-回程）
ipcMain.on('script-editor:request-dock', (_e, payload?: { graphStr?: string; activeScriptName?: string }) => {
  if (scriptEditorPopoutWindow && !scriptEditorPopoutWindow.isDestroyed()) {
    scriptEditorPopoutWindow.close()
  }
  mainWindow?.webContents.send('script-editor:dock', {
    graphStr: payload?.graphStr || '',
    activeScriptName: payload?.activeScriptName || ''
  })
})

// —— 脚本输出独立窗（单例）——
ipcMain.handle(
  'script-output:popout',
  (
    _e,
    payload?: { lines?: Array<{ text: string; ts: number }>; scriptName?: string }
  ) => {
    scriptOutputPopoutPayload = {
      lines: Array.isArray(payload?.lines) ? payload!.lines : [],
      scriptName: payload?.scriptName || ''
    }
    if (scriptOutputPopoutWindow && !scriptOutputPopoutWindow.isDestroyed()) {
      if (scriptOutputPopoutWindow.isMinimized()) scriptOutputPopoutWindow.restore()
      scriptOutputPopoutWindow.show()
      scriptOutputPopoutWindow.focus()
      scriptOutputPopoutWindow.webContents.send('script-output:popout-payload', scriptOutputPopoutPayload)
      return { ok: true }
    }

    const win = new BrowserWindow({
      width: 720,
      height: 480,
      minWidth: 420,
      minHeight: 280,
      title: '脚本输出',
      resizable: true,
      show: showWindow,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      titleBarOverlay: process.platform === 'win32'
        ? { color: currentDark ? '#0D1218' : '#f5f7fa', symbolColor: currentDark ? '#E6E9EF' : '#1f2937', height: 38 }
        : undefined,
      frame: process.platform === 'linux' ? false : undefined,
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        additionalArguments: ['--script-output-popout']
      }
    })

    scriptOutputPopoutWindow = win
    win.on('closed', () => {
      scriptOutputPopoutWindow = null
      // 通知所有可能的 host（主窗 / 脚本编辑器弹窗）
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('script-output:closed')
      }
    })

    if (isDev) {
      win.loadURL(DEV_SERVER_URL + '/src/app/script-output.html')
    } else {
      win.loadFile(path.join(RENDERER_DIST, 'app/script-output.html'))
    }

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('script-output:popout-payload', scriptOutputPopoutPayload)
    })

    return { ok: true }
  }
)

ipcMain.on(
  'script-output:sync',
  (_e, payload?: { lines?: Array<{ text: string; ts: number }>; scriptName?: string }) => {
    scriptOutputPopoutPayload = {
      lines: Array.isArray(payload?.lines) ? payload!.lines : [],
      scriptName: payload?.scriptName ?? scriptOutputPopoutPayload.scriptName
    }
    if (scriptOutputPopoutWindow && !scriptOutputPopoutWindow.isDestroyed()) {
      scriptOutputPopoutWindow.webContents.send('script-output:sync', scriptOutputPopoutPayload)
    }
  }
)

ipcMain.on('script-output:request-close', () => {
  if (scriptOutputPopoutWindow && !scriptOutputPopoutWindow.isDestroyed()) {
    scriptOutputPopoutWindow.close()
  }
})

ipcMain.on('script-output:request-clear', () => {
  // 转给所有非输出弹窗的 renderer（host 会 clearOutput）
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === scriptOutputPopoutWindow || w.isDestroyed()) continue
    w.webContents.send('script-output:clear-request')
  }
})

// 实时切换 popout 窗的 alwaysOnTop（取代 legacy 无实时切换的缺陷）
ipcMain.on('panel:set-always-on-top', (_e, { id, onTop }) => {
  const win = popoutWindows.get(id)
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!onTop)
})

ipcMain.on('panel:request-dock', (_e, { id, html }) => {
  // dock 回时关闭对应 popout 窗
  const win = popoutWindows.get(id)
  if (win && !win.isDestroyed()) win.close()
  mainWindow?.webContents.send('panel:dock', { id, html })
})

ipcMain.handle('scripts:dir', () => scriptsDir)
ipcMain.handle('scripts:list', () => { ensureScriptsDir(); return fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js')) })
ipcMain.handle('scripts:read', (_e, n: string) => { const f = path.join(scriptsDir, safeScriptName(n)); return fs.existsSync(f) ? fs.readFileSync(f, 'utf-8') : '' })
ipcMain.handle('scripts:write', (_e, { name, content }) => {
  ensureScriptsDir()
  try {
    fs.writeFileSync(path.join(scriptsDir, safeScriptName(name)), String(content ?? ''), 'utf-8')
    return { ok: true }
  } catch (e: any) {
    console.error('Script save failed:', e)
    return { ok: false, error: e.message }
  }
})
ipcMain.handle('scripts:delete', (_e, n: string) => { const f = path.join(scriptsDir, safeScriptName(n)); if (fs.existsSync(f)) fs.unlinkSync(f); return { ok: true } })
ipcMain.handle('scripts:rename', (_e, { oldName, newName }) => {
  ensureScriptsDir()
  const old = path.join(scriptsDir, safeScriptName(oldName))
  const next = path.join(scriptsDir, safeScriptName(newName))
  if (!fs.existsSync(old)) return { ok: false, error: '源脚本不存在' }
  if (old === next) return { ok: true }
  // 仅大小写差异（如 Script_1.js → SCRIPT_1.js）：区分大小写的 FS 上是合法改名，
  // 大小写不敏感的 FS（Windows/macOS 默认）上是 no-op；两种情况都应放行而非判为重名。
  const caseOnly = old.toLowerCase() === next.toLowerCase()
  if (!caseOnly && fs.existsSync(next)) return { ok: false, error: '该名称已存在' }
  try { fs.renameSync(old, next); return { ok: true } }
  catch (e) { return { ok: false, error: String((e as Error)?.message || e) } }
})
ipcMain.handle('scripts:export', async (_e, name: string) => {
  const src = path.join(scriptsDir, safeScriptName(name))
  if (!fs.existsSync(src)) return { ok: false, error: '脚本不存在' }
  const content = fs.readFileSync(src, 'utf-8')
  const defaultPath = String(name || '').replace(/\.js$/i, '')
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出脚本',
    defaultPath,
    filters: [{ name: 'JavaScript', extensions: ['js'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true, filePath } }
  catch (e) { return { ok: false, error: String((e as Error)?.message || e) } }
})
ipcMain.handle('scripts:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '导入脚本',
    properties: ['openFile'],
    filters: [{ name: 'JavaScript', extensions: ['js'] }]
  })
  if (canceled || filePaths.length === 0) return { ok: false, canceled: true }
  return importScriptFile(filePaths[0], scriptsDir)
})
ipcMain.handle('scripts:run', (e: any, { code, ctx }) => {
  const runId = randomUUID()
  const logs: string[] = []
  const sender = e.sender
  const emitLog = (line: string) => {
    logs.push(line)
    if (!sender.isDestroyed()) sender.send('scripts:log', { runId, line })
  }
  const sandboxState = createSandboxState()
  const token: any = {
    aborted: false,
    abortHandlers: new Set<() => void>()
  }
  let listenerIndex = 0
  runningScripts.set(runId, token)

  const ensureTcpServer = (port: number, serverId = `tcpServer:${port}`): Promise<any> => {
    if (tcpServers.has(serverId)) return Promise.resolve({ ok: true, id: serverId, port, already: true })
    const pending = tcpServerStarts.get(serverId)
    if (pending) return pending

    const startPromise = new Promise<any>((resolve) => {
      const server = net.createServer()
      const clients = new Set<any>()

      server.on('connection', (sock) => {
        try { sock.setNoDelay(true); sock.setKeepAlive(true, 60000) } catch { }
        clients.add(sock)

        sock.on('data', (buf) => {
          const dataBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8')
          const dataText = dataBuffer.toString('utf8')
          pushTcpServerData(serverId, dataText)
          notifyTcpServerWatchers(serverId, dataText)
        })

        sock.on('close', () => clients.delete(sock))
        sock.on('error', () => { try { sock.destroy() } catch { } clients.delete(sock) })
      })

      server.on('error', (err) => {
        console.error('TCP Server error:', err?.message || err)
      })

      server.listen(port, '0.0.0.0', () => {
        tcpServers.set(serverId, { server, port, clients })
        resolve({ ok: true, id: serverId, port })
      }).on('error', (err) => {
        resolve({ ok: false, error: err?.message || '启动失败' })
      })
    }).finally(() => {
      tcpServerStarts.delete(serverId)
    })
    tcpServerStarts.set(serverId, startPromise)
    return startPromise
  }

  const waitTcpServerPacket = async (port: number, timeout: number = 2147483647): Promise<string> => {
    if (token.aborted) throw new Error('ABORTED')

    if (ctx.id === 'test') {
      await new Promise(r => setTimeout(r, 100))
      return updateLastRecv(sandboxState, `[测试模式: TCP服务器${port}收到数据]`)
    }

    const serverId = `tcpServer:${port}`
    const result = await ensureTcpServer(port, serverId)
    if (!result.ok) throw new Error('服务器启动失败: ' + result.error)

    const immediateData = shiftTcpServerData(serverId)
    if (immediateData) {
      return updateLastRecv(sandboxState, immediateData)
    }

    return await new Promise<string>((resolve, reject) => {
      if (token.aborted) return reject(new Error('ABORTED'))

      let settled = false
      let timeoutTimer: any
      let pollTimer: any
      let stopNow: () => void
      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        if (pollTimer) clearInterval(pollTimer)
        token.abortHandlers.delete(stopNow)
      }
      const resolveOnce = (value: string) => {
        if (settled) return
        settled = true
        cleanup()
        resolve(updateLastRecv(sandboxState, value))
      }
      const rejectOnce = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      stopNow = () => rejectOnce(new Error('ABORTED'))
      token.abortHandlers.add(stopNow)

      pollTimer = setInterval(() => {
        const data = shiftTcpServerData(serverId)
        if (!data) return
        resolveOnce(data)
      }, 20)

      timeoutTimer = setTimeout(() => resolveOnce('[超时: 无数据]'), Number(timeout) || 2147483647)
    })
  }

  const listenScriptPackets = (targetId: string, handler: (value: string) => Promise<void> | void, listenOptions: ScriptListenOptions = {}): Promise<void> => {
    if (token.aborted) return Promise.reject(new Error('ABORTED'))
    const normalizedListenOptions = normalizeScriptListenOptions(listenOptions)

    if (ctx.id === 'test') {
      return new Promise<void>((resolve, reject) => {
        let stopNow: () => void
        const timer = setTimeout(async () => {
          token.abortHandlers.delete(stopNow)
          try {
            const value = trimScriptPacketEnding(`[测试模式: ${targetId} 收到数据]`, normalizedListenOptions.append)
            await handler(updateLastRecv(sandboxState, value))
            resolve()
          } catch (err) {
            reject(err)
          }
        }, 100)
        stopNow = () => { clearTimeout(timer); reject(new Error('ABORTED')) }
        token.abortHandlers.add(stopNow)
      })
    }

    return new Promise<void>((resolve, reject) => {
      if (token.aborted) return reject(new Error('ABORTED'))

      let settled = false
      let stopNow: () => void
      let bufferTimer: any
      let bufferedText = ''
      const watcherId = `${runId}:${++listenerIndex}`
      const cleanup = () => {
        if (bufferTimer) clearTimeout(bufferTimer)
        removeScriptWatcherExact(watcherId)
        token.abortHandlers.delete(stopNow)
      }
      const resolveOnce = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const rejectOnce = (error: Error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(error)
      }
      stopNow = () => resolveOnce()
      token.abortHandlers.add(stopNow)

      const emitPacket = async (value: string) => {
        const txt = trimScriptPacketEnding(value, normalizedListenOptions.append)
        try {
          await handler(updateLastRecv(sandboxState, txt))
          if (token.aborted) resolveOnce()
        } catch (err: any) {
          rejectOnce(err)
        }
      }
      const flushBuffer = async () => {
        if (!bufferedText) return
        const txt = bufferedText
        bufferedText = ''
        await emitPacket(txt)
      }
      const scheduleBufferFlush = () => {
        if (bufferTimer) clearTimeout(bufferTimer)
        bufferTimer = setTimeout(() => {
          bufferTimer = null
          void flushBuffer()
        }, normalizedListenOptions.bufferMs)
      }
      const splitAndEmit = async (text: string) => {
        const delimiter = normalizedListenOptions.append === 'CR'
          ? '\r'
          : normalizedListenOptions.append === 'LF'
            ? '\n'
            : normalizedListenOptions.append === 'CRLF'
              ? '\r\n'
              : ''
        if (!delimiter) {
          await emitPacket(text)
          return
        }

        bufferedText += text
        let index = bufferedText.indexOf(delimiter)
        while (index >= 0) {
          const nextPacket = bufferedText.slice(0, index + delimiter.length)
          bufferedText = bufferedText.slice(index + delimiter.length)
          await emitPacket(nextPacket)
          index = bufferedText.indexOf(delimiter)
        }
        if (bufferedText) scheduleBufferFlush()
      }
      const onDataHandler = async (payload: any) => {
        const txt = typeof payload === 'string' ? payload : (payload?.text ? payload.text : '')
        if (normalizedListenOptions.bufferMs > 0 || normalizedListenOptions.append !== 'none') {
          await splitAndEmit(txt)
          return
        }
        await emitPacket(txt)
      }
      addScriptWatcher(targetId, watcherId, onDataHandler)
    })
  }

  // ── 脚本沙箱（review 第 7 项）信任模型说明 ──
  // 本沙箱服务于「用户在本机工具里自写的脚本」，脚本被视为可信。
  // 因此 readFile/writeFile 故意保留对任意路径的读写能力（便于脚本处理设备数据文件）。
  // 信任前提：渲染层不可被攻破。一旦渲染层遭 XSS（配合 CSP 缺失），脚本代码本身可控，
  // 此沙箱即无意义——见下方 vm 注释。CSP（installCsp）+ contextIsolation 是真正的第一道防线。
  const sandbox: any = {
    console: { log: (...a: any[]) => emitLog(a.join(' ')) },
    globalVars: sandboxState.globalVars,
    get _last_recv() { return sandboxState._last_recv },
    set _last_recv(value: string) { updateLastRecv(sandboxState, value) },
    checkStop: async () => {
      if (token.aborted) throw new Error('ABORTED')
      return false
    },
    sleep: (ms: number) => new Promise<void>((resolve, reject) => {
      if (token.aborted) return reject(new Error('ABORTED'))
      let timer: any
      const stopNow = () => { clearTimeout(timer); reject(new Error('ABORTED')) }
      token.abortHandlers.add(stopNow)
      timer = setTimeout(() => {
        token.abortHandlers.delete(stopNow)
        resolve()
      }, Number(ms) || 0)
    }),
    waitOnePacket: (timeout: number = 5000) => new Promise<string>((resolve, reject) => {
      if (token.aborted) return reject(new Error('ABORTED'))

      if (ctx.id === 'test') {
        setTimeout(() => resolve(updateLastRecv(sandboxState, '[测试模式: 无数据]')), 100)
        return
      }

      let onDataHandler: any
      let timeoutTimer: any
      const watcherId = `${runId}:wait:${++listenerIndex}`
      const stopNow = () => {
        removeScriptWatcherExact(watcherId)
        if (timeoutTimer) clearTimeout(timeoutTimer)
        reject(new Error('ABORTED'))
      }
      token.abortHandlers.add(stopNow)

      timeoutTimer = setTimeout(() => {
        token.abortHandlers.delete(stopNow)
        removeScriptWatcherExact(watcherId)
        resolve(updateLastRecv(sandboxState, '[超时: 无数据]'))
      }, Number(timeout) || 5000)

      onDataHandler = (payload: any) => {
        token.abortHandlers.delete(stopNow)
        if (timeoutTimer) clearTimeout(timeoutTimer)
        removeScriptWatcherExact(watcherId)
        const txt = (typeof payload === 'string') ? payload :
          (payload.text ? payload.text : '')
        resolve(updateLastRecv(sandboxState, txt))
      }
      addScriptWatcher(ctx.id, watcherId, onDataHandler)
    }),
    waitPanelPacket: (panelId: string, timeout: number = 5000) => new Promise<string>((resolve, reject) => {
      if (token.aborted) return reject(new Error('ABORTED'))

      const targetId = String(panelId || '').trim()
      if (!targetId) return reject(new Error('未选择串口面板'))

      if (ctx.id === 'test') {
        setTimeout(() => resolve(updateLastRecv(sandboxState, `[测试模式: ${targetId} 无数据]`)), 100)
        return
      }

      let timeoutTimer: any
      const watcherId = `${runId}:wait:${++listenerIndex}`
      const stopNow = () => {
        removeScriptWatcherExact(watcherId)
        if (timeoutTimer) clearTimeout(timeoutTimer)
        reject(new Error('ABORTED'))
      }
      token.abortHandlers.add(stopNow)

      timeoutTimer = setTimeout(() => {
        token.abortHandlers.delete(stopNow)
        removeScriptWatcherExact(watcherId)
        resolve(updateLastRecv(sandboxState, '[超时: 无数据]'))
      }, Number(timeout) || 5000)

      const onDataHandler = (payload: any) => {
        token.abortHandlers.delete(stopNow)
        if (timeoutTimer) clearTimeout(timeoutTimer)
        removeScriptWatcherExact(watcherId)
        const txt = (typeof payload === 'string') ? payload :
          (payload.text ? payload.text : '')
        resolve(updateLastRecv(sandboxState, txt))
      }
      addScriptWatcher(targetId, watcherId, onDataHandler)
    }),

    send: async (d: string, m: string = 'text', a: string = 'none') => {
      if (token.aborted) throw new Error('ABORTED')

      if (ctx.id === 'test') {
        return { ok: true, sent: d }
      }

      const r = await writeGeneric(ctx.id, d, m, a)
      if (!r.ok) throw new Error(r.error)
      return r
    },
    sendToPanel: async (panelId: string, d: string, m: string = 'text', a: string = 'none') => {
      if (token.aborted) throw new Error('ABORTED')

      const targetId = String(panelId || '').trim()
      if (!targetId) throw new Error('未选择串口面板')

      if (ctx.id === 'test') {
        return { ok: true, id: targetId, sent: d }
      }

      const r = await writeGeneric(targetId, d, m, a)
      if (!r.ok) throw new Error(r.error)
      return r
    },
    sendToSerial: async (portPath: string, d: string, m: string = 'text', a: string = 'none', options: any = {}) => {
      if (token.aborted) throw new Error('ABORTED')

      const targetId = getPortId(String(portPath || '').trim())
      if (!targetId) throw new Error('未选择串口')

      if (ctx.id === 'test') {
        return { ok: true, id: targetId, sent: d }
      }

      const opened = await ensureSerialOpen(portPath, options)
      if (!opened.ok) throw new Error(opened.error || '串口打开失败')
      const r = await writeToSerial(targetId, d, m, a)
      if (!r.ok) throw new Error(r.error)
      return r
    },

    modbusRead: async (panelId: string, fc: number, slaveId: number, addr: number, qty: number) => {
      if (token.aborted) throw new Error('ABORTED')
      const entry = modbusClients.get(panelId)
      if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
      return readOnce(entry, { slaveId, functionCode: fc as 1 | 2 | 3 | 4, startAddress: addr, quantity: qty })
    },
    modbusWrite: async (panelId: string, fc: number, slaveId: number, addr: number, values: number[]) => {
      if (token.aborted) throw new Error('ABORTED')
      const entry = modbusClients.get(panelId)
      if (!entry) throw new Error(`Modbus 面板未连接: ${panelId}`)
      await writeOnce(entry, { slaveId, functionCode: fc as 5 | 6 | 15 | 16, startAddress: addr, values })
      return { ok: true }
    },

    sendTCP: async (host: string, port: number, data: string, mode: string = 'text') => {
      if (token.aborted) throw new Error('ABORTED')

      if (ctx.id === 'test') {
        return { ok: true, sent: data, host, port }
      }

      // 优先复用 listenTcpPackets 已建立的同 host:port 连接，实现「接收+发送」闭环
      const pooled = findScriptTcpClient(runId, String(host), Number(port))
      if (pooled) {
        let buf: Buffer
        try { buf = buildWriteBuffer(String(data), mode, 'none', 'utf-8') } catch (e) {
          return { ok: false, error: String((e as Error)?.message || e) }
        }
        return new Promise((resolve) => {
          pooled.write(buf, (err?: Error | null) => resolve(
            err ? { ok: false, error: String(err.message) } : { ok: true, sent: data, bytes: buf.length }
          ))
        })
      }

      // 无监听连接：建一次性连接发送后关闭
      let buf: Buffer
      try { buf = buildWriteBuffer(String(data), mode, 'none', 'utf-8') } catch (e) {
        return { ok: false, error: String((e as Error)?.message || e) }
      }
      return new Promise((resolve) => {
        const socket = net.createConnection({ host: String(host), port: Number(port) })
        const done = (r: any) => { try { socket.destroy() } catch { /* ignore */ } resolve(r) }
        socket.on('error', (err) => done({ ok: false, error: String(err.message) }))
        socket.on('connect', () => {
          socket.write(buf, (err?: Error | null) => done(
            err ? { ok: false, error: String(err.message) } : { ok: true, sent: data, bytes: buf.length }
          ))
        })
        // 兜底超时，避免悬挂
        setTimeout(() => done({ ok: false, error: 'TCP 发送超时' }), 5000)
      })
    },

    waitTcpServer: async (port: number, timeout: number = 5000) => {
      try {
        return await waitTcpServerPacket(port, timeout)
      } catch (err: any) {
        if (err?.message?.startsWith('服务器启动失败: ')) return `[${err.message}]`
        throw err
      }
    },

    listenCurrentPackets: () => (handler: (value: string) => Promise<void> | void) =>
      listenScriptPackets(ctx.id, handler),
    listenPanelPackets: (panelId: string) => (handler: (value: string) => Promise<void> | void) => {
      const targetId = String(panelId || '').trim()
      if (!targetId) throw new Error('未选择串口面板')
      return listenScriptPackets(targetId, handler)
    },
    listenSerialPackets: (portPath: string, options: any = {}, listenOptions: ScriptListenOptions = {}) => async (handler: (value: string) => Promise<void> | void) => {
      const targetId = getPortId(String(portPath || '').trim())
      if (!targetId) throw new Error('未选择串口')
      const opened = await ensureSerialOpen(portPath, options)
      if (!opened.ok) throw new Error(opened.error || '串口打开失败')
      return listenScriptPackets(targetId, handler, listenOptions)
    },
    listenTcpPackets: (host: string, port: number) => (handler: (value: string) => Promise<void> | void) => {
      if (token.aborted) return Promise.reject(new Error('ABORTED'))

      if (ctx.id === 'test') {
        return new Promise<void>((resolve, reject) => {
          let stopNow: () => void
          const timer = setTimeout(async () => {
            token.abortHandlers.delete(stopNow)
            try {
              await handler(updateLastRecv(sandboxState, `[测试模式: TCP ${host}:${port}收到数据]`))
              resolve()
            } catch (err) {
              reject(err)
            }
          }, 100)
          stopNow = () => { clearTimeout(timer); reject(new Error('ABORTED')) }
          token.abortHandlers.add(stopNow)
        })
      }

      return new Promise<void>((resolve, reject) => {
        if (token.aborted) return reject(new Error('ABORTED'))

        let settled = false
        const socket = net.createConnection({ host, port })
        // 注册到脚本 TCP 客户端池：sendTCP 可复用同一条连接回写
        registerScriptTcpClient(runId, String(host), Number(port), socket)
        let stopNow: () => void
        const cleanup = () => {
          token.abortHandlers.delete(stopNow)
          socket.removeAllListeners()
        }
        const resolveOnce = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }
        const rejectOnce = (error: Error) => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        }
        stopNow = () => {
          try { socket.destroy() } catch { }
          resolveOnce()
        }
        token.abortHandlers.add(stopNow)

        socket.on('data', async (buf) => {
          try {
            // latin1：每字节映射到 charCode 0..255，二进制协议可经 textToHex 无损还原
            await handler(updateLastRecv(sandboxState, buf.toString('latin1')))
            if (token.aborted) resolveOnce()
          } catch (err: any) {
            try { socket.destroy() } catch { }
            rejectOnce(err)
          }
        })
        // 连接失败（ECONNREFUSED 等）：不 reject（会变成未捕获 rejection 刷屏），
        // 改为提示并 resolve，让脚本静默结束监听。
        socket.on('error', (err) => {
          try { console.log(`[listenTcpPackets] ${host}:${port} 连接失败: ${err.message}`) } catch { /* ignore */ }
          resolveOnce()
        })
        socket.on('close', () => resolveOnce())
      })
    },
    listenTcpServerPackets: (port: number) => async (handler: (value: string) => Promise<void> | void) => {
      if (token.aborted) throw new Error('ABORTED')

      if (ctx.id === 'test') {
        await new Promise(r => setTimeout(r, 100))
        await handler(updateLastRecv(sandboxState, `[测试模式: TCP服务器${port}收到数据]`))
        return
      }

      const serverId = `tcpServer:${port}`
      const result = await ensureTcpServer(port, serverId)
      if (!result.ok) throw new Error('服务器启动失败: ' + result.error)

      await new Promise<void>((resolve, reject) => {
        if (token.aborted) return reject(new Error('ABORTED'))

        let settled = false
        let stopNow: () => void
        const watcherId = `${runId}:tcpServer:${++listenerIndex}`
        const cleanup = () => {
          removeTcpServerWatcher(serverId, watcherId)
          token.abortHandlers.delete(stopNow)
        }
        const resolveOnce = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }
        const rejectOnce = (error: Error) => {
          if (settled) return
          settled = true
          cleanup()
          reject(error)
        }
        stopNow = () => resolveOnce()
        token.abortHandlers.add(stopNow)

        const onDataHandler = async (value: string) => {
          try {
            await handler(updateLastRecv(sandboxState, value))
            if (token.aborted) resolveOnce()
          } catch (err: any) {
            rejectOnce(err)
          }
        }
        addTcpServerWatcher(serverId, watcherId, onDataHandler)
      })
    },

    broadcastTcpServer: async (port: number, data: string, mode: string = 'text') => {
      if (token.aborted) throw new Error('ABORTED')

      if (ctx.id === 'test') {
        return { ok: true, sent: data, port, clients: 1 }
      }

      const serverId = `tcpServer:${port}`

      if (!tcpServers.has(serverId)) {
        return { ok: false, error: '服务器未启动，请先使用接收节点' }
      }

      const entry = tcpServers.get(serverId)
      if (entry.clients.size === 0) {
        return { ok: false, error: '无客户端连接' }
      }

      // 复用 buildWriteBuffer：获得 append/base64 支持与奇数位 HEX 校验
      // （原内联解析会静默吞掉奇数位 hex 的最后一位，且无校验）。
      let buf: Buffer
      try {
        buf = buildWriteBuffer(String(data), mode, 'none', 'utf-8')
      } catch (e) {
        return { ok: false, error: String((e as Error)?.message || e) }
      }

      let sent = 0
      for (const c of entry.clients) {
        if (!c.destroyed) {
          try { c.write(buf); sent++ } catch { }
        }
      }

      return { ok: true, sent, bytes: buf.length }
    },

    textToHex: (s: string) => {
      let hex = ''
      for (let i = 0; i < s.length; i++) {
        hex += s.charCodeAt(i).toString(16).padStart(2, '0')
      }
      return hex.toUpperCase()
    },
    hexToText: (h: string) => {
      let text = ''
      const cleanHex = h.replace(/\s/g, '')
      for (let i = 0; i < cleanHex.length; i += 2) {
        text += String.fromCharCode(parseInt(cleanHex.substr(i, 2), 16))
      }
      return text
    },
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    atob: (b: string) => Buffer.from(b, 'base64').toString('binary'),
    convertEncoding,
    swapBytes,
    chunkString,
    bytesToNumber,
    crc8,
    crc16,
    crc16ccitt,
    crc32,
    checksum,

    convertBase: (value: string, from: string, to: string) => {
      const baseMap: Record<string, number> = { '二进制': 2, '八进制': 8, '十进制': 10, '十六进制': 16 }
      const fromBase = baseMap[from] || parseInt(from) || 10
      const toBase = baseMap[to] || parseInt(to) || 10

      let cleanValue = String(value).trim()
      if (fromBase === 16) cleanValue = cleanValue.replace(/^0x/i, '')
      if (fromBase === 2) cleanValue = cleanValue.replace(/^0b/i, '')

      const decimal = parseInt(cleanValue, fromBase)
      if (isNaN(decimal)) return 'NaN'

      let result = decimal.toString(toBase)
      if (toBase === 16) result = result.toUpperCase()
      if (toBase === 2 && result.length < 8) result = result.padStart(8, '0')
      if (toBase === 16 && result.length < 2) result = result.padStart(2, '0')

      return result
    },

    readFile: async (filePath: string, encoding: BufferEncoding = 'utf8') => {
      if (token.aborted) throw new Error('ABORTED')

      if (ctx.id === 'test') {
        return '[测试模式: 文件内容]'
      }

      try {
        return fs.readFileSync(filePath, encoding)
      } catch (e: any) {
        throw new Error('读取文件失败: ' + e.message)
      }
    },

    writeFile: async (filePath: string, content: string, mode: string = 'append') => {
      if (token.aborted) throw new Error('ABORTED')

      if (ctx.id === 'test') {
        return { ok: true, filePath, bytes: String(content ?? '').length, mode }
      }

      try {
        if (mode === 'overwrite') {
          fs.writeFileSync(filePath, String(content ?? ''), 'utf-8')
        } else {
          fs.appendFileSync(filePath, String(content ?? ''), 'utf-8')
        }
        return { ok: true, filePath }
      } catch (err: any) {
        throw new Error('写入文件失败: ' + err.message)
      }
    }
  }

  ; (async () => {
    try {
      // ⚠️ 安全边界说明：node:vm 的 vm.createContext / runInContext **不是**沙箱！
      // 官方文档明确：vm 不提供安全的隔离，恶意脚本可逃逸拿到主进程 require/进程句柄。
      // 这里之所以可接受，是因为脚本信任模型=用户自写（见上方 sandbox 注释），
      // 且 CSP + contextIsolation 已作为前置防线挡住渲染层 XSS 注入脚本的可能。
      // 若将来需要支持不可信脚本，必须改用真正的隔离：utilityProcess + MessagePort，
      // 或进程级沙箱（--enable-sandbox + 受限 IPC），绝不能依赖 vm。
      await new vm.Script(`(async()=>{${code || ''}})()`).runInContext(vm.createContext(sandbox))
      e.sender.send('scripts:ended', { runId, ok: true, logs })
    }
    catch (err: any) {
      if (err.message !== 'ABORTED') {
        emitLog('[ERROR] ' + (err?.message || String(err)))
      }
      e.sender.send('scripts:ended', { runId, ok: false, error: err?.message, logs })
    }
    finally {
      runningScripts.delete(runId)
      removeScriptWatcher(runId)
      removeTcpServerWatchers(runId)
      removeScriptTcpClients(runId)
    }
  })()
  return { ok: true, runId }
})

ipcMain.handle('scripts:stop', (e, { runId }) => {
  const token = runningScripts.get(runId)
  if (token) {
    token.aborted = true
    token.abortHandlers.forEach((rejectFunc: () => void) => rejectFunc())
    token.abortHandlers.clear()
  }
  return { ok: true }
})

ipcMain.handle('logger:append', async (event, filePath: string, text: string) => {
  try {
    await fs.promises.appendFile(filePath, text, 'utf8')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('logger:pickFile', async (event) => {
  const result = await dialog.showSaveDialog({
    title: '选择日志保存位置',
    defaultPath: '串口日志.txt',
    filters: [{ name: '文本文件', extensions: ['txt', 'log'] }]
  })
  return result
})

/**
 * 安装 Content-Security-Policy（review 第 6 项）。
 * 通过 defaultSession 的 onHeadersReceived 给所有渲染层统一注入 CSP HTTP 头
 * （优先级高于 HTML <meta>，且一处维护 5 个窗口入口）。
 * - 生产（isDev=false）：严格收口。default-src 'self'，禁 inline/eval。
 *   渲染层由 loadFile 以 file: 协议加载，'self' 即覆盖 file: 资源。
 *   任何进入渲染层的不可信内容（串口/日志数据、图形 JSON、changelog HTML）均无法执行脚本。
 * - 开发：放宽以兼容 Vite——需 'unsafe-eval'（Vite 依赖）+ localhost dev server + ws HMR。
 *   切勿把开发态策略带进生产：开发态放宽仅因本地构建管线需要，不影响打包产物。
 *
 * 注意：不打 CDN 或远程 host 白名单，避免给未来 XSS 留逃逸口。
 */
function installCsp(): void {
  const prodPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    // Rete 画布（rete-react-plugin → styled-components）在运行时通过 <style> 标签动态注入
    // 大量节点 transform / 连线 / minimap 样式。这些样式内容在运行时生成、不可预测，
    // 无法用固定 nonce 白名单。必须放 unsafe-inline，否则 styled-components 注入被 CSP 拦截
    // 抛错，整个 Rete 渲染树（area 容器 / 连线 / minimap）崩溃。
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    // 串口/TCP 走 IPC 不走网络；connect-src 仅允许同源，挡住渲染层外联
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')

  // 开发 CSP 与 DEV_SERVER_URL 同源；端口由 electron.vite.config.ts 固定为 5273。
  const devOrigin = DEV_SERVER_URL.replace(/\/$/, '')
  const devWsOrigin = devOrigin.replace(/^http/, 'ws')
  const devPolicy = [
    `default-src 'self' ${devOrigin}`,
    // Vite dev 三件套：eval（依赖按需 require）、unsafe-inline（@vitejs/plugin-react 的
    // Fast Refresh preamble 与 @vitejs/client 是内联脚本）、ws HMR。仅开发态，
    // 生产策略保持严格收口（见上方 prodPolicy），不放宽。
    `script-src 'self' ${devOrigin} 'unsafe-eval' 'unsafe-inline'`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${devOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${devWsOrigin} ${devOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ')

  const policy = isDev ? devPolicy : prodPolicy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

app.whenReady().then(() => {
  installCsp()
  ensureScriptsDir()
  seedBundledSampleScripts()
  createMainWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
})

ipcMain.on('window:set-oscilloscope-top', (event, { flag }) => {
  const wins = BrowserWindow.getAllWindows()
  const child = wins.find(w => {
    const title = w.getTitle()
    return title && title.startsWith('示波器')
  })

  if (child) {
    child.setAlwaysOnTop(flag)
    child.setVisibleOnAllWorkspaces(flag, { visibleOnFullScreen: flag })
  }
})

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ frameName, url }) => {
    if (frameName === 'SerialWave') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          frame: false,
          transparent: true,
          autoHideMenuBar: true,
          show: showWindow,
          backgroundColor: '#00000000',
          webPreferences: {
            preload: PRELOAD_PATH,
            contextIsolation: true,
            nodeIntegration: false
          }
        }
      }
    }
    // 外链（http/https/mailto）作为所有窗口的统一防线：系统浏览器打开 + deny（不内嵌打开）。
    // 此前非 SerialWave 分支恒 allow，外链防护全靠主窗逐窗口注册（且谁最后注册谁胜出，脆弱），
    // popout/示波器/脚本编辑器/about/changelog 等窗口完全无拦截。
    if (openExternal(url)) return { action: 'deny' }
    return { action: 'allow' }
  })
})
// 退出前栅栏：主动驱动渲染层 flush。
// before-quit preventDefault 会取消窗口关闭级联（beforeunload 因此不触发），
// 故不能靠渲染层被动 flush——必须主进程发 flush-requested，等渲染层
// flushNow 后回 commands:flush invoke 作为完成信号，再 app.exit。
// 用 quitting flag 让 1.5s 窗口内的第二次退出请求直接放行默认行为。
let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed())
  if (wins.length === 0) return // 无窗口，无可 flush，按默认行为退出
  quitting = true
  event.preventDefault()
  let done = false
  let timer: NodeJS.Timeout | null = null
  const finish = () => {
    if (done) return
    done = true
    quitFlushFinish = null
    if (timer) clearTimeout(timer)
    app.exit(0)
  }
  // 每个窗口 flushNow 后会 invoke('commands:flush')；任一窗口回复即视为可退
  // （命令 store 单例，任一窗口 flushNow 已代表全部待写命令落盘）。
  quitFlushFinish = finish
  for (const w of wins) {
    if (!w.isDestroyed()) w.webContents.send('app:flush-requested')
  }
  // 兜底：1.5s 内未收到 flush 回复（渲染层崩溃/卡死）则强退，避免卡死。
  timer = setTimeout(finish, 1500)
})
app.on('window-all-closed', () => {
  // 清理所有持有 win/sender 引用的资源 map，避免泄漏 + 向已销毁 webContents 发消息。
  // 各清理方式对齐对应的 IPC handler（tcp:close / tcpServer:stop / tcpShare:stop / scripts:stop）。
  ports.forEach(({ port }) => { try { port.close() } catch { } })
  // 关闭所有 Modbus 连接
  modbusClients.forEach((entry) => {
    for (const p of entry.polls.values()) { if (p.timer) clearInterval(p.timer) }
    try { entry.client?.close?.(() => {}) } catch { /* ignore */ }
  })
  modbusClients.clear()
  // TCP 客户端 socket：end + destroy
  sockets.forEach((entry) => { entry.manualClose = true; try { entry.socket?.end(); entry.socket?.destroy() } catch { } })
  sockets.clear()
  // TCP 服务器：销毁客户端 + 关闭监听
  tcpServers.forEach((entry) => {
    for (const c of entry.clients) { try { c.destroy() } catch { } }
    entry.clients.clear()
    try { entry.server?.close() } catch { }
  })
  tcpServers.clear()
  // TCP 共享：复用 stopTcpShare（销毁客户端 + server.close + 解绑 serial data）
  shares.forEach((_id, portId) => { try { stopTcpShare(portId) } catch { } })
  // 运行中脚本：取消 token（避免脚本结束时 e.sender.send 向死 webContents 发消息）。
  // 窗口全关 = 用户意图结束会话，中断后台脚本是预期行为（与 scripts:stop 一致）。
  runningScripts.forEach((token) => {
    try {
      token.aborted = true
      token.abortHandlers?.forEach((rejectFunc: () => void) => rejectFunc())
      token.abortHandlers?.clear()
    } catch { }
  })
  runningScripts.clear()
  if (process.platform !== 'darwin') app.quit()
})

// 自动检查更新由 renderer 侧按设置(appSettings.autoCheckUpdate)触发，主进程仅响应 app:checkUpdate。
const UPDATE_URL = 'https://filebox.satone1008.cn/'
const FILE_PREFIX = '串口助手-'
const FILE_SUFFIX = '-win-x64.exe'

function versionCompare(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number)
  const p2 = v2.split('.').map(Number)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0
    const n2 = p2[i] || 0
    if (n1 > n2) return 1
    if (n1 < n2) return -1
  }
  return 0
}

function checkForUpdates(isManual = false): void {
  // E2E 短路：测试模式下不弹任何更新 dialog，避免模态框阻塞测试窗口。
  if (E2E_MODE) return
  // 自动更新仅支持 Windows（FILE_SUFFIX=-win-x64.exe + runInstallerAndQuit 的 cmd/start）。
  // 非 Windows 短路：手动检查给明确提示，自动检查静默忽略，避免误判或执行跨平台命令。
  if (process.platform !== 'win32') {
    if (isManual && mainWindow && !mainWindow.isDestroyed()) dialog.showMessageBox(mainWindow, { type: 'info', title: '检查更新', message: '当前平台暂不支持自动更新，请前往发布页手动下载。', buttons: ['确定'] })
    return
  }

  console.log('[Updater] Checking for updates...')

  const req = https.get(UPDATE_URL, (res) => {
    let data = ''
    res.on('data', (chunk) => data += chunk)
    res.on('end', () => {
      const verRegex = new RegExp(escapeRegExp(FILE_PREFIX) + '(\\d+\\.\\d+\\.\\d+)' + escapeRegExp(FILE_SUFFIX))
      const linkRegex = /href\s*=\s*["']([^"']+)["']/gi

      let match
      let latestVer = '0.0.0'
      let latestDownloadUrl = ''

      while ((match = linkRegex.exec(data)) !== null) {
        let href = match[1]
        href = href.replace(/&amp;/g, '&')
        let decodedHref = ''
        try { decodedHref = decodeURIComponent(href) } catch (e) { continue }

        const fileMatch = decodedHref.match(verRegex)
        if (fileMatch) {
          const foundVer = fileMatch[1]
          if (versionCompare(foundVer, latestVer) > 0) {
            latestVer = foundVer
            try { latestDownloadUrl = new URL(href, UPDATE_URL).href }
            catch (e) { console.error('[Updater] Invalid URL:', href) }
          }
        }
      }

      const currentVer = app.getVersion()
      console.log(`[Updater] Current: ${currentVer}, Remote Best: ${latestVer}`)

      if (latestVer === '0.0.0' || !latestDownloadUrl || versionCompare(latestVer, currentVer) <= 0) {
        if (isManual && mainWindow && !mainWindow.isDestroyed()) {
          dialog.showMessageBox(mainWindow, { type: 'info', title: '检查更新', message: `当前版本 (${currentVer}) 已是最新。`, buttons: ['确定'] })
        }
        return
      }

      const saveName = `update-${latestVer}.exe`
      const savePath = path.join(os.tmpdir(), saveName)

      if (fs.existsSync(savePath)) {
        console.log('[Updater] File already exists, skipping download.')
        promptToInstall(latestVer, savePath)
      } else {
        const actionText = versionCompare(latestVer, currentVer) > 0 ? '升级' : '变更'
        // 窗口可能在异步检查期间被关闭；此时跳过弹窗（视为「稍后」）
        const msgPromise = (mainWindow && !mainWindow.isDestroyed())
          ? dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '发现新版本',
              message: `检测到新版本 (${latestVer})。\n是否立即下载更新？`,
              buttons: [`下载${actionText}`, '稍后'],
              defaultId: 0,
              cancelId: 1
            })
          : Promise.resolve({ response: 1 } as Electron.MessageBoxReturnValue)
        msgPromise.then(({ response }) => {
          if (response === 0) {
            downloadUpdate(latestDownloadUrl, savePath, latestVer)
          }
        })
      }
    })
  })

  req.on('error', (e) => {
    console.error('[Updater] Check failed:', e.message)
    if (isManual) dialog.showErrorBox('检查失败', '无法连接到更新服务器：' + e.message)
  })
}

function downloadUpdate(fileUrl: string, savePath: string, version: string): void {
  if (mainWindow) mainWindow.setProgressBar(0.1)

  const encodedUrl = new URL(fileUrl).href
  console.log(`[Updater] Downloading to: ${savePath}`)

  const file = fs.createWriteStream(savePath)

  const request = https.get(encodedUrl, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      file.close()
      fs.unlink(savePath, () => { })
      if (response.headers.location) {
        downloadUpdate(response.headers.location, savePath, version)
      } else {
        dialog.showErrorBox('更新失败', '服务器重定向错误。')
      }
      return
    }

    if (response.statusCode !== 200) {
      file.close()
      fs.unlink(savePath, () => { })
      dialog.showErrorBox('更新失败', `HTTP 状态码: ${response.statusCode}`)
      if (mainWindow) mainWindow.setProgressBar(-1)
      return
    }

    response.pipe(file)

    file.on('finish', () => {
      file.close(() => {
        if (mainWindow) mainWindow.setProgressBar(-1)
        promptToInstall(version, savePath)
      })
    })
  })

  request.on('error', (err) => {
    fs.unlink(savePath, () => { })
    if (mainWindow) mainWindow.setProgressBar(-1)
    dialog.showErrorBox('更新失败', '网络错误：' + err.message)
  })
}

function promptToInstall(version: string, filePath: string): void {
  // 窗口可能在下载期间被关闭；此时视为「稍后安装」，避免向已销毁窗口弹窗
  const msgPromise = (mainWindow && !mainWindow.isDestroyed())
    ? dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: '准备安装',
        message: `新版本 ${version} 已准备就绪。\n\n点击【立即安装】将自动退出程序并开始更新。`,
        buttons: ['立即安装', '稍后安装'],
        defaultId: 0,
        cancelId: 1
      })
    : Promise.resolve({ response: 1 } as Electron.MessageBoxReturnValue)
  msgPromise.then(({ response }) => {
    if (response === 0) {
      runInstallerAndQuit(filePath)
    }
  })
}

function runInstallerAndQuit(filePath: string): void {
  console.log('[Updater] Spawning installer, deleting file on finish, and relaunching...')

  const targetAppPath = app.getPath('exe')
  const installCmd = `start /wait "" "${filePath}" /S`
  const deleteCmd = `del /f /q "${filePath}"`
  const relaunchCmd = `start "" "${targetAppPath}"`

  const fullCommand = `${installCmd} & ${deleteCmd} & ${relaunchCmd}`

  try {
    const subprocess = spawn('cmd', ['/c', fullCommand], {
      detached: true,
      windowsVerbatimArguments: true,
      stdio: 'ignore'
    })

    subprocess.unref()

    setTimeout(() => {
      app.quit()
    }, 500)

  } catch (e: any) {
    dialog.showErrorBox('安装启动失败', '无法启动安装程序：' + e.message)
  }
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

