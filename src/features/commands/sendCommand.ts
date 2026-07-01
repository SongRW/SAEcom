import type { Panel } from '@/features/serial-panel/types'
import type { AppendMode, WriteMode, WindowAPI } from '@shared/types'

export interface SendResult {
  ok: boolean
  error?: string
}

/**
 * 按面板类型路由写入：serial → ipc.serial.write，tcp → ipc.tcp.write。
 * 面板未打开 → 直接返回 { ok:false }，不调 write。
 * write 抛异常 → 捕获归一化为 { ok:false, error }。
 * 镜像 legacy sendCommand 的 doWrite 路由（renderer.js:3560-3563）。
 */
export async function routeWrite(
  panel: Panel,
  ipc: Pick<WindowAPI, 'serial' | 'tcp'>,
  data: string,
  mode: WriteMode,
  append: AppendMode,
  encoding: string
): Promise<SendResult> {
  if (!panel.open) return { ok: false, error: '面板未打开' }
  try {
    const res =
      panel.type === 'tcp'
        ? await ipc.tcp.write(panel.id, data, mode, append, encoding)
        : await ipc.serial.write(panel.id, data, mode, append, encoding)
    if (res && res.ok === false) return { ok: false, error: res.error || '发送失败' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  }
}

/**
 * 命令发送回显是否开启：跟随每面板的 sendOptions.echoSend（对齐 SendBar）。
 * 不能用默认关闭的全局 settings.echoSend，否则命令发出但面板不回显（历史回归点）。
 */
export function shouldEcho(panel: Panel): boolean {
  return !!panel.sendOptions?.echoSend
}

/**
 * 重复发送管理：per-cmdId interval（镜像 legacy cmdIntervalMap）。
 * - toggle：未在跑 → 建立 interval（先立即发一次，再每 ms 周期）；已在跑 → 清除。
 * - 连续失败上限：连续 MAX_CONSECUTIVE_FAILS 次发送失败自动停止，避免端口故障时狂刷错误 toast。
 * - clearAll：清空全部（cmdRepeat 关闭/卸载时调用）。
 */
const MAX_CONSECUTIVE_FAILS = 5

export class RepeatManager {
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private fails = new Map<string, number>()

  toggle(cmdId: string, ms: number, doSend: () => Promise<boolean>): void {
    const existing = this.timers.get(cmdId)
    if (existing) {
      clearInterval(existing)
      this.timers.delete(cmdId)
      this.fails.delete(cmdId)
      return
    }
    this.fails.set(cmdId, 0)
    // 不立即发首帧（对齐 legacy renderer.js:3582-3586）：只建 interval，首次发送在 ms 毫秒后。
    const timer = setInterval(() => {
      void doSend().then((ok) => {
        if (!this.timers.has(cmdId)) return // 已停止，忽略迟到的回调
        if (ok) {
          this.fails.set(cmdId, 0)
        } else {
          const n = (this.fails.get(cmdId) ?? 0) + 1
          this.fails.set(cmdId, n)
          if (n >= MAX_CONSECUTIVE_FAILS) {
            clearInterval(timer)
            this.timers.delete(cmdId)
            this.fails.delete(cmdId)
          }
        }
      })
    }, Math.max(1, ms))
    this.timers.set(cmdId, timer)
  }

  isActive(cmdId: string): boolean {
    return this.timers.has(cmdId)
  }

  clearAll(): void {
    for (const t of this.timers.values()) clearInterval(t)
    this.timers.clear()
    this.fails.clear()
  }
}
