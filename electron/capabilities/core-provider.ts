import fs from 'node:fs'
import type { CapabilityProvider, RunContext } from '../core/capability-registry'
import type { SerialService } from '../services/serial.service'
import type { TcpService } from '../services/tcp.service'
import { buildWriteBuffer } from '../core/buffer'
import { updateLastRecv } from '../scriptSandbox'

/**
 * CoreCapabilityProvider —— 沙箱核心能力（无 IO 依赖的通用 API）。
 *
 * 对照搬移自 main.ts sandbox 对象字面量（原 ~561-1016 行）中以下 key：
 *   console / globalVars / _last_recv(getter+setter) / checkStop / sleep /
 *   readFile / writeFile / send / sendToPanel / sendToSerial / writeGeneric(内部)
 *
 * 注入：
 * - serialService：sendToSerial 用 ensureSerialOpen + writeToSerial；
 *   send/sendToPanel 经 writeGeneric 分派到 serial（id 不以 tcp:// 开头）。
 * - tcpService：writeGeneric 分派到 tcp（id 以 tcp:// 开头时取 socket）。
 *
 * writeGeneric 原为 main.ts 顶层函数，现移入此 provider 私有方法（仅 send/sendToPanel 用）。
 * 行为逐行对照搬移，零变化。
 */
export class CoreCapabilityProvider implements CapabilityProvider {
  readonly id = 'core'

  constructor(
    private readonly serialService: SerialService,
    private readonly tcpService: TcpService
  ) {}

  apis(rc: RunContext): Record<string, any> {
    const { token, ctx, sandboxState } = rc

    const writeGeneric = (id: string, data: string, mode: string, append: string): Promise<any> => {
      if (id.startsWith('tcp://')) {
        const entry = this.tcpService.getSocket(id)
        if (!entry || !entry.socket) return Promise.resolve({ ok: false, error: 'NOT_OPEN' })
        let buf
        try { buf = buildWriteBuffer(data, mode, append) } catch (e: any) { return Promise.resolve({ ok: false, error: e.message }) }
        return new Promise(res => entry.socket.write(buf, (err: any) => res(err ? { ok: false, error: err.message } : { ok: true, bytes: buf.length })))
      } else {
        return this.serialService.writeToSerial(id, data, mode, append)
      }
    }

    return {
      console: { log: (...a: any[]) => rc.emitLog(a.join(' ')) },
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

      send: async (d: string, m: string = 'text', a: string = 'none') => {
        if (token.aborted) throw new Error('ABORTED')

        if (ctx.id === 'test') {
          return { ok: true, sent: d }
        }
        if (!ctx.id) {
          throw new Error('未选择面板：send 默认作用在当前面板，请先选择面板或改用 sendToPanel(panelId)/sendToSerial(port) 显式指定目标')
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

        const targetId = this.serialService.getPortId(String(portPath || '').trim())
        if (!targetId) throw new Error('未选择串口')

        if (ctx.id === 'test') {
          return { ok: true, id: targetId, sent: d }
        }

        const opened = await this.serialService.ensureSerialOpen(portPath, options)
        if (!opened.ok) throw new Error(opened.error || '串口打开失败')
        const r = await this.serialService.writeToSerial(targetId, d, m, a)
        if (!r.ok) throw new Error(r.error)
        return r
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
  }
}
