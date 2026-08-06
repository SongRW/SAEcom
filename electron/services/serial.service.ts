import { BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'
import { execFile } from 'node:child_process'
import net from 'node:net'
import os from 'node:os'
import { buildWriteBuffer } from '../core/buffer'

/**
 * SerialService —— 串口 + TCP 共享(LAN 转发) 域。
 *
 * 持有私有状态：ports（串口连接表）/ shares（TCP 共享服务表）。
 * 行为逐函数对照搬移自 main.ts，零变化：
 * - listSerialPortsSafe（main.ts:775-814）
 * - buildWriteBuffer → 抽至 core/buffer.ts（共享）
 * - writeToSerial / normalizeSerialOpenOptions / ensureSerialOpen（main.ts:560-643）
 * - startTcpShare / stopTcpShare（main.ts:644-697）
 * - listLanIPv4 / isRfc1918 / looksVirtual（main.ts:208-301，tcpShare 地址列举用）
 * - getPortId（恒等，main.ts:141）
 * - shouldSuppressPortError（main.ts:102-107）
 *
 * 解耦点（注入回调）：
 * - dataBroadcaster：串口收到数据时通知脚本监听器（notifyScriptWatchers）。
 *   组4 ScriptService 装配时注入；默认 no-op。
 * - 窗口广播：BrowserWindow.getAllWindows 直接用（与原行为一致，不抽 broadcaster）。
 */
export class SerialService {
  private readonly ports = new Map<string, any>()
  private readonly shares = new Map<string, any>()

  /** 串口数据到达时通知脚本监听器。组4 注入；默认 no-op。 */
  private dataBroadcaster: (portId: string, buf: Buffer) => void = () => {}

  /** 注入脚本数据广播回调（main.ts 装配时调用）。 */
  setDataBroadcaster(fn: (portId: string, buf: Buffer) => void): void {
    this.dataBroadcaster = fn
  }

  // ── 端口 id 工具 ──
  getPortId(portPath: string): string {
    return portPath
  }

  // ── 串口列表 ──
  async listSerialPortsSafe(): Promise<any[]> {
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

  // ── 串口写 ──
  writeToSerial(id: string, data: string, mode: string = 'text', append: string = 'none', encoding: string = 'utf-8'): Promise<any> {
    const entry = this.ports.get(id)
    if (!entry) return Promise.resolve({ ok: false, error: 'PORT_NOT_OPEN' })
    let buf; try { buf = buildWriteBuffer(data, mode, append, encoding) } catch (e: any) { return Promise.resolve({ ok: false, error: e.message }) }
    return new Promise(r => entry.port.write(buf, (err: any) => r(err ? { ok: false, error: err.message } : { ok: true, bytes: buf.length })))
  }

  private normalizeSerialOpenOptions(options: any = {}): any {
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

  private shouldSuppressPortError(entry: any, err: any): boolean {
    if (!entry) return true
    if (entry.suppressErrorUntil && Date.now() < entry.suppressErrorUntil) return true
    const msg = String(err?.message || '').toLowerCase()
    if (msg.includes('port is not open')) return true
    return false
  }

  async ensureSerialOpen(portPath: string, options: any = {}): Promise<any> {
    const id = this.getPortId(String(portPath || '').trim())
    if (!id) return { ok: false, error: '未选择串口' }
    const normalized = this.normalizeSerialOpenOptions(options)
    const existing = this.ports.get(id)
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
          this.dataBroadcaster(id, b)
        })
        port.on('close', () => {
          sendAll('serial:event', { id, type: 'close' })
          try { if (this.shares.has(id)) this.stopTcpShare(id) } catch { }
          this.ports.delete(id)
        })
        port.on('error', (e: any) => {
          const ent = this.ports.get(id)
          if (this.shouldSuppressPortError(ent, e)) return
          sendAll('serial:event', { id, type: 'error', message: e?.message || String(e) })
        })

        this.ports.set(id, { port, options: normalized })
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

  async closeSerial(id: string): Promise<any> {
    const entry = this.ports.get(id)
    if (!entry) return { ok: true, notOpen: true }

    entry.suppressErrorUntil = Date.now() + 800

    if (entry.port && entry.port.isOpen === false) {
      this.ports.delete(id)
      return { ok: true, notOpen: true }
    }
    return await new Promise((resolve) => {
      entry.port.close((err: any) => {
        if (err) return resolve({ ok: false, error: err.message })
        resolve({ ok: true })
      })
    })
  }

  // ── TCP 共享（LAN 转发串口数据）──
  private isRfc1918(ip: string): boolean {
    if (/^10\./.test(ip)) return true
    const m172 = ip.match(/^172\.(\d+)\./)
    if (m172) {
      const n = parseInt(m172[1], 10)
      if (n >= 16 && n <= 31) return true
    }
    if (/^192\.168\./.test(ip)) return true
    return false
  }

  private looksVirtual(ifname: string = ''): boolean {
    const n = (ifname || '').toLowerCase()
    return /(vmnet|vmware|virtualbox|vbox|hyper[- ]?v|wsl|docker|hamachi|zerotier|bridge|npcap|npf|tap|tun|loopback)/i.test(n)
  }

  listLanIPv4(): string[] {
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
          virt: this.looksVirtual(name)
        }
        if (this.isRfc1918(ip)) entry.score += 100
        else if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) entry.score += 20
        else entry.score += 5
        if (entry.virt) entry.score -= 50

        all.push(entry)
      }
    }

    if (!all.length) return ['127.0.0.1']
    const hasPrivate = all.some(a => this.isRfc1918(a.ip) && !a.virt)
    const cand = hasPrivate ? all.filter(a => this.isRfc1918(a.ip)) : all

    cand.sort((a, b) => b.score - a.score)
    return cand.map(a => a.ip)
  }

  startTcpShare(portId: string, sharePort: number = 9000): any {
    if (this.shares.has(portId)) return this.shares.get(portId)
    const ent = this.ports.get(portId)
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
    this.shares.set(portId, rec)
    return rec
  }

  stopTcpShare(portId: string): void {
    const rec = this.shares.get(portId)
    if (!rec) return
    try {
      for (const c of rec.clients) { try { c.destroy() } catch { } }
      rec.clients.clear()
      rec.server.close()
    } catch { }
    const ent = this.ports.get(portId)
    if (ent?.port && rec.onSerialData) {
      try { ent.port.off('data', rec.onSerialData) } catch { }
    }
    this.shares.delete(portId)
  }

  hasTcpShare(portId: string): boolean {
    return this.shares.has(portId)
  }

  /** tcpShare:status 查询：返回 share rec（含 port）或 null。 */
  queryTcpShare(portId: string): { port: number } | null {
    const rec = this.shares.get(portId)
    return rec ? { port: rec.port } : null
  }

  // ── 关闭时清理（window-all-closed）──
  closeAllPorts(): void {
    this.ports.forEach(({ port }) => { try { port.close() } catch { } })
  }

  stopAllTcpShares(): void {
    for (const portId of Array.from(this.shares.keys())) {
      try { this.stopTcpShare(portId) } catch { }
    }
  }
}
