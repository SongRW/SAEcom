import type { IpcMainInvokeEvent } from 'electron'
import net from 'node:net'
import { buildWriteBuffer } from '../core/buffer'

/**
 * TcpService —— TCP 客户端 + TCP 服务器 + 服务器数据 watcher 域。
 *
 * 持有私有状态：sockets（客户端连接表）/ tcpServers（服务器表）/ tcpServerStarts /
 *   tcpServerDataBuffer / tcpServerWatchers。
 * 行为逐函数对照搬移自 main.ts，零变化：
 * - tcp:open / tcp:write / tcp:close（main.ts:360-443）
 * - tcpServer:start / stop / status / broadcast（main.ts:445-540）
 * - pushTcpServerData / shiftTcpServerData / add/remove/notify TcpServerWatcher（main.ts:316-358）
 *
 * 解耦点：dataBroadcaster 注入（TCP 客户端收到数据时通知脚本监听器，等同 notifyScriptWatchers）。
 *   组4 ScriptService 装配时注入；默认 no-op。
 *   注意：TCP 服务器数据 watcher（addTcpServerWatcher 等）是脚本 listenTcpServerPackets 用的，
 *   其注册/通知方法在此 service 暴露，组4 的 sandbox 通过注入的 service 引用调用（非 broadcaster）。
 */
const TCP_DEFAULTS = {
  timeoutMs: 2500,
  keepAlive: true,
  keepAliveSec: 60,
  noDelay: true,
  autoReconnect: false,
  reconnectMs: 2000
}
const TCP_SERVER_DATA_QUEUE_LIMIT = 256

export class TcpService {
  private readonly sockets = new Map<string, any>()
  private readonly tcpServers = new Map<string, any>()
  private readonly tcpServerStarts = new Map<string, Promise<any>>()
  private readonly tcpServerDataBuffer = new Map<string, string[]>()
  private readonly tcpServerWatchers = new Map<string, Map<string, (value: string) => Promise<void> | void>>()

  /** TCP 客户端数据到达时通知脚本监听器。组4 注入；默认 no-op。 */
  private dataBroadcaster: (portId: string, buf: Buffer) => void = () => {}

  setDataBroadcaster(fn: (portId: string, buf: Buffer) => void): void {
    this.dataBroadcaster = fn
  }

  // ── TCP 客户端 ──
  async open(host: string, port: number, options: any, e: IpcMainInvokeEvent): Promise<any> {
    const opts = Object.assign({}, TCP_DEFAULTS, options || {})
    const id = `tcp://${host}:${port}`
    if (this.sockets.has(id)) return { ok: true, id, already: true }

    const entry: any = { id, host, port, opts, win: e.sender, manualClose: false, socket: null }

    const start = (resolveOpen?: (r: any) => void, rejectOpen?: (r: any) => void) => {
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
        // 直传 Buffer（Uint8Array 子类）：Electron IPC structured clone 零拷贝传输
        try { entry.win.send('tcp:data', { id, bytes: dataBuffer, ts: Date.now() }) } catch { }
        this.dataBroadcaster(id, dataBuffer)
      })
      s.on('error', (err) => {
        try { entry.win.send('tcp:event', { id, type: 'error', message: String(err?.message || err) }) } catch { }
        rejectOpen && rejectOpen({ ok: false, error: String(err?.message || err) })
      })
      s.on('close', () => {
        try { entry.win.send('tcp:event', { id, type: 'close' }) } catch { }
        if (entry.manualClose) { this.sockets.delete(id); return }
        if (opts.autoReconnect) setTimeout(() => { if (this.sockets.has(id)) start() }, opts.reconnectMs)
        else this.sockets.delete(id)
      })

      try { s.connect({ host, port }) } catch (err: any) {
        // 同步抛错也必须 settle 外层 promise，否则渲染层 await 永久挂起。
        this.sockets.delete(id)
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

    this.sockets.set(id, entry)
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
  }

  async write(id: string, data: string, mode: string, append: string, encoding: string): Promise<any> {
    const entry = this.sockets.get(id)
    if (!entry || !entry.socket) return { ok: false, error: 'NOT_OPEN' }
    let buf
    try { buf = buildWriteBuffer(data, mode, append, encoding) } catch (e: any) { return { ok: false, error: e.message } }
    return await new Promise(res => entry.socket.write(buf, (err: any) => res(err ? { ok: false, error: err.message } : { ok: true, bytes: buf.length })))
  }

  async close(id: string): Promise<any> {
    const entry = this.sockets.get(id)
    if (!entry) return { ok: true, notOpen: true }
    entry.manualClose = true
    try { entry.socket.end(); entry.socket.destroy() } catch { }
    this.sockets.delete(id)
    return { ok: true }
  }

  /** writeGeneric（脚本 send/sendToPanel）按 id 前缀分派到 tcp 或 serial；tcp 部分由此暴露。 */
  getSocket(id: string): any {
    return this.sockets.get(id)
  }

  // ── TCP 服务器 ──
  async startServer(port: number, echo: boolean, e: IpcMainInvokeEvent): Promise<any> {
    const wantEcho = !!echo
    const serverId = `tcpServer:${port}${wantEcho ? ':echo' : ''}`
    if (this.tcpServers.has(serverId)) {
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
        this.pushTcpServerData(serverId, dataText)
        this.notifyTcpServerWatchers(serverId, dataText)
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
        this.tcpServers.set(realId, { server, port: realPort, clients, win })
        resolve({ ok: true, id: realId, port: realPort, echo: wantEcho })
      }).on('error', (err) => {
        resolve({ ok: false, error: err?.message || '启动失败' })
      })
    })
  }

  async stopServer(id: string): Promise<any> {
    const entry = this.tcpServers.get(id)
    if (!entry) return { ok: true, notOpen: true }

    for (const c of entry.clients) { try { c.destroy() } catch { } }
    entry.clients.clear()
    try { entry.server.close() } catch { }
    this.tcpServers.delete(id)
    this.tcpServerDataBuffer.delete(id)
    this.tcpServerWatchers.delete(id)
    return { ok: true }
  }

  async serverStatus(id: string): Promise<any> {
    const entry = this.tcpServers.get(id)
    if (!entry) return { ok: true, active: false }
    return { ok: true, active: true, port: entry.port, clients: entry.clients.size }
  }

  async broadcastServer(id: string, data: string, mode: string, append: string, encoding: string): Promise<any> {
    const entry = this.tcpServers.get(id)
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
  }

  // ── TCP 服务器数据 watcher（脚本 listenTcpServerPackets 用）──
  /** 沙箱 ensureTcpServer（独立 TCP 服务器）收到数据时调用，与 startServer 共享同一 buffer/watcher 池。 */
  pushTcpServerData(serverId: string, data: string): void {
    const queue = this.tcpServerDataBuffer.get(serverId) || []
    queue.push(data)
    while (queue.length > TCP_SERVER_DATA_QUEUE_LIMIT) queue.shift()
    this.tcpServerDataBuffer.set(serverId, queue)
  }

  shiftTcpServerData(serverId: string): string | undefined {
    const queue = this.tcpServerDataBuffer.get(serverId)
    if (!queue?.length) return undefined
    const data = queue.shift()
    if (!queue.length) this.tcpServerDataBuffer.delete(serverId)
    return data
  }

  addTcpServerWatcher(serverId: string, watcherId: string, fn: (value: string) => Promise<void> | void): void {
    if (!this.tcpServerWatchers.has(serverId)) this.tcpServerWatchers.set(serverId, new Map())
    this.tcpServerWatchers.get(serverId)!.set(watcherId, fn)
  }

  removeTcpServerWatcher(serverId: string, watcherId: string): void {
    const watchers = this.tcpServerWatchers.get(serverId)
    if (!watchers) return
    watchers.delete(watcherId)
    if (!watchers.size) this.tcpServerWatchers.delete(serverId)
  }

  removeTcpServerWatchers(runIdOrWatcherId: string): void {
    for (const [serverId, watchers] of this.tcpServerWatchers) {
      for (const id of Array.from(watchers.keys())) {
        if (id === runIdOrWatcherId || id.startsWith(`${runIdOrWatcherId}:`)) watchers.delete(id)
      }
      if (!watchers.size) this.tcpServerWatchers.delete(serverId)
    }
  }

  /** 沙箱 ensureTcpServer 收到数据时通知 watchers（与 startServer 共享池）。 */
  notifyTcpServerWatchers(serverId: string, data: string): void {
    const watchers = this.tcpServerWatchers.get(serverId)
    if (!watchers) return
    for (const fn of watchers.values()) {
      try { void Promise.resolve(fn(data)).catch(() => { }) } catch { }
    }
  }

  // ── 关闭时清理（window-all-closed）──
  closeAllSockets(): void {
    this.sockets.forEach((entry) => { entry.manualClose = true; try { entry.socket?.end(); entry.socket?.destroy() } catch { } })
    this.sockets.clear()
  }

  destroyAllServers(): void {
    this.tcpServers.forEach((entry) => {
      for (const c of entry.clients) { try { c.destroy() } catch { } }
      entry.clients.clear()
      try { entry.server?.close() } catch { }
    })
    this.tcpServers.clear()
  }
}
