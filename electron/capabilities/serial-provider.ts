import type { CapabilityProvider, RunContext } from '../core/capability-registry'
import type { SerialService } from '../services/serial.service'
import type { ScriptWatcherHost } from './script-watcher-host'
import {
  normalizeScriptListenOptions,
  trimScriptPacketEnding,
  type ScriptListenOptions
} from './script-listen-helpers'
import { updateLastRecv } from '../scriptSandbox'

/**
 * SerialCapabilityProvider —— 串口/面板收包监听能力。
 *
 * 对照搬移自 main.ts sandbox 对象字面量中以下 key：
 *   waitOnePacket / waitPanelPacket /
 *   listenCurrentPackets / listenPanelPackets / listenSerialPackets
 *
 * listenScriptPackets 是 listen* 共用的内部闭包（原 main.ts:449-554 内联于 run handler），
 * 此处作为 provider 私有方法重建（用 rc 引用替代 run 闭包变量），行为逐行对照搬移，零变化。
 *
 * 注入：
 * - serialService：listenSerialPackets 用 ensureSerialOpen（显式串口目标）
 * - host(ScriptWatcherHost)：addScriptWatcher / removeScriptWatcherExact
 *   （watcher 注册表归 ScriptService 私有持有，避免 provider 间状态耦合）
 *
 * watcher id 格式保持不变：
 *   一次性 wait：`${runId}:wait:${++listenerIndex}`
 *   持续 listen：`${runId}:${++listenerIndex}`
 */
export class SerialCapabilityProvider implements CapabilityProvider {
  readonly id = 'serial'

  constructor(
    private readonly serialService: SerialService,
    private readonly host: ScriptWatcherHost
  ) {}

  apis(rc: RunContext): Record<string, any> {
    const { token, ctx, sandboxState, runId, listenerIndex } = rc

    const listenScriptPackets = (
      targetId: string,
      handler: (value: string) => Promise<void> | void,
      listenOptions: ScriptListenOptions = {}
    ): Promise<void> => {
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
        const watcherId = `${runId}:${++listenerIndex.n}`
        const cleanup = () => {
          if (bufferTimer) clearTimeout(bufferTimer)
          this.host.removeScriptWatcherExact(watcherId)
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
        this.host.addScriptWatcher(targetId, watcherId, onDataHandler)
      })
    }

    return {
      waitOnePacket: (timeout: number = 5000) => new Promise<string>((resolve, reject) => {
        if (token.aborted) return reject(new Error('ABORTED'))

        if (ctx.id === 'test') {
          setTimeout(() => resolve(updateLastRecv(sandboxState, '[测试模式: 无数据]')), 100)
          return
        }
        if (!ctx.id) {
          return reject(new Error('未选择面板：waitOnePacket 默认作用在当前面板，请先选择面板或改用 waitPanelPacket(panelId) 显式指定目标'))
        }

        let onDataHandler: any
        let timeoutTimer: any
        const watcherId = `${runId}:wait:${++listenerIndex.n}`
        const stopNow = () => {
          this.host.removeScriptWatcherExact(watcherId)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          reject(new Error('ABORTED'))
        }
        token.abortHandlers.add(stopNow)

        timeoutTimer = setTimeout(() => {
          token.abortHandlers.delete(stopNow)
          this.host.removeScriptWatcherExact(watcherId)
          resolve(updateLastRecv(sandboxState, '[超时: 无数据]'))
        }, Number(timeout) || 5000)

        onDataHandler = (payload: any) => {
          token.abortHandlers.delete(stopNow)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          this.host.removeScriptWatcherExact(watcherId)
          const txt = (typeof payload === 'string') ? payload :
            (payload.text ? payload.text : '')
          resolve(updateLastRecv(sandboxState, txt))
        }
        this.host.addScriptWatcher(ctx.id, watcherId, onDataHandler)
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
        const watcherId = `${runId}:wait:${++listenerIndex.n}`
        const stopNow = () => {
          this.host.removeScriptWatcherExact(watcherId)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          reject(new Error('ABORTED'))
        }
        token.abortHandlers.add(stopNow)

        timeoutTimer = setTimeout(() => {
          token.abortHandlers.delete(stopNow)
          this.host.removeScriptWatcherExact(watcherId)
          resolve(updateLastRecv(sandboxState, '[超时: 无数据]'))
        }, Number(timeout) || 5000)

        const onDataHandler = (payload: any) => {
          token.abortHandlers.delete(stopNow)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          this.host.removeScriptWatcherExact(watcherId)
          const txt = (typeof payload === 'string') ? payload :
            (payload.text ? payload.text : '')
          resolve(updateLastRecv(sandboxState, txt))
        }
        this.host.addScriptWatcher(targetId, watcherId, onDataHandler)
      }),

      listenCurrentPackets: () => (handler: (value: string) => Promise<void> | void) => {
        if (!ctx.id) throw new Error('未选择面板：listenCurrentPackets 默认监听当前面板，请先选择面板或改用 listenPanelPackets(panelId)/listenSerialPackets(port) 显式指定目标')
        return listenScriptPackets(ctx.id, handler)
      },
      listenPanelPackets: (panelId: string) => (handler: (value: string) => Promise<void> | void) => {
        const targetId = String(panelId || '').trim()
        if (!targetId) throw new Error('未选择串口面板')
        return listenScriptPackets(targetId, handler)
      },
      listenSerialPackets: (portPath: string, options: any = {}, listenOptions: ScriptListenOptions = {}) => async (handler: (value: string) => Promise<void> | void) => {
        const targetId = this.serialService.getPortId(String(portPath || '').trim())
        if (!targetId) throw new Error('未选择串口')
        const opened = await this.serialService.ensureSerialOpen(portPath, options)
        if (!opened.ok) throw new Error(opened.error || '串口打开失败')
        return listenScriptPackets(targetId, handler, listenOptions)
      }
    }
  }
}
