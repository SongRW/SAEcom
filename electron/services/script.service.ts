import { randomUUID } from 'crypto'
import vm from 'node:vm'
import net from 'node:net'
import type { WebContents } from 'electron'
import {
  CapabilityRegistry,
  type RunContext
} from '../core/capability-registry'
import type { ScriptWatcherHost } from '../capabilities/script-watcher-host'
import { CoreCapabilityProvider } from '../capabilities/core-provider'
import { SerialCapabilityProvider } from '../capabilities/serial-provider'
import { TcpCapabilityProvider } from '../capabilities/tcp-provider'
import { ModbusCapabilityProvider } from '../capabilities/modbus-provider'
import { CodecCapabilityProvider } from '../capabilities/codec-provider'
import type { SerialService } from './serial.service'
import type { TcpService } from './tcp.service'
import type { ModbusService } from './modbus.service'
import { createSandboxState } from '../scriptSandbox'

/**
 * ScriptService —— 脚本执行域（组4）。
 *
 * 持有私有状态：
 * - runningScripts：runId → 取消 token（{aborted, abortHandlers}）
 * - scriptWatchers：portId → Map<watcherId, fn>（串口/面板/TCP 客户端数据监听器）
 * - scriptTcpClients：脚本 TCP 客户端连接池（listenTcpPackets 建，sendTCP 复用，实现收+发闭环）
 * - sandboxTcpServers / sandboxTcpServerStarts：沙箱独立 TCP 服务器表（与 TcpService.startServer
 *   分离——沙箱 listenTcpServerPackets 自管生命周期；数据 buffer/watcher 共享 TcpService 池）
 * - registry：CapabilityRegistry（装配时注册 5 个 provider）
 *
 * 实现 ScriptWatcherHost：provider 经此接口访问 watcher/TCP 客户端池/服务器状态，
 * 避免反向 import（ScriptService 构造时注册 provider，provider 不 import ScriptService）。
 *
 * 行为逐函数对照搬移自 main.ts scripts:run handler（main.ts:329-1040）+ 顶层 watcher/
 * TCP 客户端池函数，零变化。trust-model 注释保留在 run() 上方。
 */
export class ScriptService implements ScriptWatcherHost {
  private readonly runningScripts = new Map<string, any>()
  private readonly scriptWatchers = new Map<string, Map<string, any>>()

  /**
   * 脚本 TCP 客户端连接池：listenTcpPackets 建立的连接按 runId+host:port 注册，
   * sendTCP 优先复用同一条连接回写——这样「接收TCP + 发送TCP」可在同一条 TCP
   * 连接上闭环（典型场景：echo server / 一收一发协议）。
   * key = `${runId}|${host}|${port}`
   */
  private readonly scriptTcpClients = new Map<string, { socket: net.Socket; host: string; port: number; runId: string }>()

  // 沙箱独立持有的 TCP 服务器状态（与 TcpService.startServer 的服务器表分离——
  // 沙箱 listenTcpServerPackets 自管生命周期；数据 buffer/watcher 共享 TcpService 池）。
  private readonly sandboxTcpServers = new Map<string, { server: net.Server; port: number; clients: Set<any> }>()
  private readonly sandboxTcpServerStarts = new Map<string, Promise<any>>()

  private readonly registry: CapabilityRegistry

  constructor(
    private readonly serialService: SerialService,
    private readonly tcpService: TcpService,
    _modbusService: ModbusService
  ) {
    this.registry = new CapabilityRegistry()
    // 注册顺序即合并顺序：core → serial → tcp → modbus → codec（domain 间无 key 冲突）。
    this.registry.register(new CoreCapabilityProvider(serialService, tcpService))
    this.registry.register(new SerialCapabilityProvider(serialService, this))
    this.registry.register(new TcpCapabilityProvider(tcpService, this))
    this.registry.register(new ModbusCapabilityProvider())
    this.registry.register(new CodecCapabilityProvider())
  }

  // ── ScriptWatcherHost：watcher 注册表 ──
  addScriptWatcher(portId: string, watcherId: string, fn: any): void {
    if (!this.scriptWatchers.has(portId)) this.scriptWatchers.set(portId, new Map())
    this.scriptWatchers.get(portId)!.set(watcherId, fn)
  }

  removeScriptWatcherExact(watcherId: string): void {
    for (const [portId, m] of this.scriptWatchers) {
      m.delete(watcherId)
      if (!m.size) this.scriptWatchers.delete(portId)
    }
  }

  /** 按 runId（或 watcherId）移除该 run 的所有持续监听器。 */
  removeScriptWatcher(runIdOrWatcherId: string): void {
    for (const [portId, m] of this.scriptWatchers) {
      for (const id of Array.from(m.keys())) {
        if (id === runIdOrWatcherId || id.startsWith(`${runIdOrWatcherId}:`)) m.delete(id)
      }
      if (!m.size) this.scriptWatchers.delete(portId)
    }
  }

  /** 串口/TCP 数据到达时通知监听器（注入为 serial/tcp service 的 dataBroadcaster）。 */
  notifyScriptWatchers(portId: string, buf: Buffer): void {
    const m = this.scriptWatchers.get(portId); if (!m) return
    // text 用 latin1：逐字节映射到 charCode 0..255，二进制协议可经 textToHex 无损还原。
    // UI 展示仍走 tcp:data/serial 的原始 bytes，不受影响。
    const payload = {
      bytes: Uint8Array.from(buf),
      text: (() => { try { return buf.toString('latin1') } catch { return '' } })(),
      hex: (() => { try { return buf.toString('hex').toUpperCase() } catch { return '' } })()
    }
    for (const fn of m.values()) try { fn(payload) } catch { }
  }

  // ── ScriptWatcherHost：脚本 TCP 客户端池 ──
  private scriptTcpClientKey(runId: string, host: string, port: number): string {
    return `${runId}|${host}|${port}`
  }

  registerScriptTcpClient(runId: string, host: string, port: number, socket: net.Socket): void {
    const key = this.scriptTcpClientKey(runId, host, port)
    const prev = this.scriptTcpClients.get(key)
    if (prev && prev.socket !== socket) {
      try { prev.socket.destroy() } catch { /* ignore */ }
    }
    this.scriptTcpClients.set(key, { socket, host, port, runId })
    socket.once('close', () => {
      const cur = this.scriptTcpClients.get(key)
      if (cur && cur.socket === socket) this.scriptTcpClients.delete(key)
    })
  }

  findScriptTcpClient(runId: string, host: string, port: number): net.Socket | null {
    const key = this.scriptTcpClientKey(runId, host, port)
    const entry = this.scriptTcpClients.get(key)
    return entry && !entry.socket.destroyed ? entry.socket : null
  }

  removeScriptTcpClients(runId: string): void {
    for (const [key, entry] of Array.from(this.scriptTcpClients.entries())) {
      if (entry.runId === runId) {
        try { entry.socket.destroy() } catch { /* ignore */ }
        this.scriptTcpClients.delete(key)
      }
    }
  }

  // ── ScriptWatcherHost：沙箱独立 TCP 服务器 ──
  getSandboxTcpServer(serverId: string): { clients: Set<any> } | undefined {
    return this.sandboxTcpServers.get(serverId)
  }

  ensureTcpServer(port: number, serverId = `tcpServer:${port}`): Promise<any> {
    if (this.sandboxTcpServers.has(serverId)) return Promise.resolve({ ok: true, id: serverId, port, already: true })
    const pending = this.sandboxTcpServerStarts.get(serverId)
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
          this.tcpService.pushTcpServerData(serverId, dataText)
          this.tcpService.notifyTcpServerWatchers(serverId, dataText)
        })

        sock.on('close', () => clients.delete(sock))
        sock.on('error', () => { try { sock.destroy() } catch { } clients.delete(sock) })
      })

      server.on('error', (err) => {
        console.error('TCP Server error:', err?.message || err)
      })

      server.listen(port, '0.0.0.0', () => {
        this.sandboxTcpServers.set(serverId, { server, port, clients })
        resolve({ ok: true, id: serverId, port })
      }).on('error', (err) => {
        resolve({ ok: false, error: err?.message || '启动失败' })
      })
    }).finally(() => {
      this.sandboxTcpServerStarts.delete(serverId)
    })
    this.sandboxTcpServerStarts.set(serverId, startPromise)
    return startPromise
  }

  // ── 执行 / 停止 ──
  /**
   * scripts:run handler 的核心。行为逐行对照搬移自 main.ts:329-1040，零变化。
   *
   * ── 脚本沙箱（review 第 7 项）信任模型说明 ──
   * 本沙箱服务于「用户在本机工具里自写的脚本」，脚本被视为可信。
   * 因此 readFile/writeFile 故意保留对任意路径的读写能力（便于脚本处理设备数据文件）。
   * 信任前提：渲染层不可被攻破。一旦渲染层遭 XSS（配合 CSP 缺失），脚本代码本身可控，
   * 此沙箱即无意义——见下方 vm 注释。CSP（installCsp）+ contextIsolation 是真正的第一道防线。
   */
  run(code: string, ctxInput: any, sender: WebContents): { ok: true; runId: string } {
    // ctx.id 可空（面板可选）。归一化为字符串：未提供面板时为 ''，便于后续 `=== 'test'`
    // 等判断；隐式 send()/waitOnePacket()/listenCurrentPackets() 默认作用在当前面板，
    // 无面板时各自抛清晰错误，提示改用显式目标 API。
    const ctx = { id: (ctxInput && typeof ctxInput.id === 'string') ? ctxInput.id : '' }
    const runId = randomUUID()
    const logs: string[] = []
    const emitLog = (line: string) => {
      logs.push(line)
      if (!sender.isDestroyed()) sender.send('scripts:log', { runId, line })
    }
    const sandboxState = createSandboxState()
    const token: any = {
      aborted: false,
      abortHandlers: new Set<() => void>()
    }
    const listenerIndex = { n: 0 }
    this.runningScripts.set(runId, token)

    const rc: RunContext = {
      runId,
      ctx,
      token,
      sandboxState,
      sender,
      emitLog,
      listenerIndex
    }
    const sandbox = this.registry.buildSandbox(rc)

    ; (async () => {
      try {
        // ⚠️ 安全边界说明：node:vm 的 vm.createContext / runInContext **不是**沙箱！
        // 官方文档明确：vm 不提供安全的隔离，恶意脚本可逃逸拿到主进程 require/进程句柄。
        // 这里之所以可接受，是因为脚本信任模型=用户自写（见上方 sandbox 注释），
        // 且 CSP + contextIsolation 已作为前置防线挡住渲染层 XSS 注入脚本的可能。
        // 若将来需要支持不可信脚本，必须改用真正的隔离：utilityProcess + MessagePort，
        // 或进程级沙箱（--enable-sandbox + 受限 IPC），绝不能依赖 vm。
        await new vm.Script(`(async()=>{${code || ''}})()`).runInContext(vm.createContext(sandbox))
        sender.send('scripts:ended', { runId, ok: true, logs })
      }
      catch (err: any) {
        if (err.message !== 'ABORTED') {
          emitLog('[ERROR] ' + (err?.message || String(err)))
        }
        sender.send('scripts:ended', { runId, ok: false, error: err?.message, logs })
      }
      finally {
        this.runningScripts.delete(runId)
        this.removeScriptWatcher(runId)
        this.tcpService.removeTcpServerWatchers(runId)
        this.removeScriptTcpClients(runId)
      }
    })()
    return { ok: true, runId }
  }

  /** scripts:stop：置 aborted 并触发所有 abortHandlers。 */
  stop(runId: string): { ok: true } {
    const token = this.runningScripts.get(runId)
    if (token) {
      token.aborted = true
      token.abortHandlers.forEach((rejectFunc: () => void) => rejectFunc())
      token.abortHandlers.clear()
    }
    return { ok: true }
  }

  /**
   * window-all-closed 清理：取消所有运行中脚本 token。
   * 窗口全关 = 用户意图结束会话，中断后台脚本是预期行为（与 scripts:stop 一致）。
   * 避免脚本结束时 sender.send 向已销毁 webContents 发消息。
   */
  abortAllRunning(): void {
    this.runningScripts.forEach((token) => {
      try {
        token.aborted = true
        token.abortHandlers?.forEach((rejectFunc: () => void) => rejectFunc())
        token.abortHandlers?.clear()
      } catch { }
    })
    this.runningScripts.clear()
  }

  /** 当前是否有运行中脚本（供 lifecycle 判断）。 */
  hasRunning(): boolean {
    return this.runningScripts.size > 0
  }
}
