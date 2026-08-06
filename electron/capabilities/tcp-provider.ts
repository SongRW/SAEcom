import net from 'node:net'
import type { CapabilityProvider, RunContext } from '../core/capability-registry'
import type { TcpService } from '../services/tcp.service'
import type { ScriptWatcherHost } from './script-watcher-host'
import { buildWriteBuffer } from '../core/buffer'
import { updateLastRecv } from '../scriptSandbox'

/**
 * TcpCapabilityProvider —— 脚本沙箱 TCP 客户端/服务器能力。
 *
 * 对照搬移自 main.ts sandbox 对象字面量中以下 key：
 *   sendTCP / listenTcpPackets / listenTcpServerPackets /
 *   broadcastTcpServer / waitTcpServer
 *
 * waitTcpServerPacket 是 waitTcpServer 的内部实现（原 main.ts run handler 内联），
 * 此处作为 provider 私有方法，行为逐行对照搬移，零变化。
 *
 * 注入：
 * - tcpService：pushTcpServerData / shiftTcpServerData / add/remove TcpServerWatcher /
 *   notifyTcpServerWatchers（TCP 服务器数据 buffer/watcher 共享池，组2 迁移）
 * - host(ScriptWatcherHost)：registerScriptTcpClient / findScriptTcpClient（客户端连接池，供
 *   sendTCP 复用 listenTcpPackets 的连接实现「收+发」闭环）+ ensureTcpServer / getSandboxTcpServer
 *   （沙箱独立 TCP 服务器表，生命周期自管，与 TcpService.startServer 分离）
 *
 * watcher id 格式保持不变：`${runId}:tcpServer:${++listenerIndex}`
 */
export class TcpCapabilityProvider implements CapabilityProvider {
  readonly id = 'tcp'

  constructor(
    private readonly tcpService: TcpService,
    private readonly host: ScriptWatcherHost
  ) {}

  private async waitTcpServerPacket(rc: RunContext, port: number, timeout: number = 2147483647): Promise<string> {
    const { token, ctx, sandboxState } = rc
    if (token.aborted) throw new Error('ABORTED')

    if (ctx.id === 'test') {
      await new Promise(r => setTimeout(r, 100))
      return updateLastRecv(sandboxState, `[测试模式: TCP服务器${port}收到数据]`)
    }

    const serverId = `tcpServer:${port}`
    const result = await this.host.ensureTcpServer(port, serverId)
    if (!result.ok) throw new Error('服务器启动失败: ' + result.error)

    const immediateData = this.tcpService.shiftTcpServerData(serverId)
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
        const data = this.tcpService.shiftTcpServerData(serverId)
        if (!data) return
        resolveOnce(data)
      }, 20)

      timeoutTimer = setTimeout(() => resolveOnce('[超时: 无数据]'), Number(timeout) || 2147483647)
    })
  }

  apis(rc: RunContext): Record<string, any> {
    const { token, ctx, sandboxState, runId, listenerIndex } = rc

    return {
      sendTCP: async (host: string, port: number, data: string, mode: string = 'text') => {
        if (token.aborted) throw new Error('ABORTED')

        if (ctx.id === 'test') {
          return { ok: true, sent: data, host, port }
        }

        // 优先复用 listenTcpPackets 已建立的同 host:port 连接，实现「接收+发送」闭环
        const pooled = this.host.findScriptTcpClient(runId, String(host), Number(port))
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
          return await this.waitTcpServerPacket(rc, port, timeout)
        } catch (err: any) {
          if (err?.message?.startsWith('服务器启动失败: ')) return `[${err.message}]`
          throw err
        }
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
          this.host.registerScriptTcpClient(runId, String(host), Number(port), socket)
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
        const result = await this.host.ensureTcpServer(port, serverId)
        if (!result.ok) throw new Error('服务器启动失败: ' + result.error)

        await new Promise<void>((resolve, reject) => {
          if (token.aborted) return reject(new Error('ABORTED'))

          let settled = false
          let stopNow: () => void
          const watcherId = `${runId}:tcpServer:${++listenerIndex.n}`
          const cleanup = () => {
            this.tcpService.removeTcpServerWatcher(serverId, watcherId)
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
          this.tcpService.addTcpServerWatcher(serverId, watcherId, onDataHandler)
        })
      },

      broadcastTcpServer: async (port: number, data: string, mode: string = 'text') => {
        if (token.aborted) throw new Error('ABORTED')

        if (ctx.id === 'test') {
          return { ok: true, sent: data, port, clients: 1 }
        }

        const serverId = `tcpServer:${port}`

        const entry = this.host.getSandboxTcpServer(serverId)
        if (!entry) {
          return { ok: false, error: '服务器未启动，请先使用接收节点' }
        }

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
      }
    }
  }
}
