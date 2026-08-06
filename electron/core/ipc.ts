import { ipcMain, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron'

/**
 * Router 注册工厂。
 *
 * 分层约束：Service 不 import ipcMain（纯逻辑 + 状态，可单测）；
 * Router 不持状态，只做入参校验 + 调 service + 错误边界。
 * registerRouter 是这条约束的执行点：把一组 handler 注册到 ipcMain，
 * 调用方传入命名空间前缀与 handler 映射，工厂内部统一 try/catch。
 *
 * handler 分两类，对齐现有 main.ts 用法：
 * - invoke handler：异步，返回值经 Promise resolve（对应 ipcMain.handle）→ IpcMainInvokeEvent
 * - send handler：同步 fire-and-forget（对应 ipcMain.on）→ IpcMainEvent（有 reply）
 *
 * 通道名拼接为 `${namespace}:${method}`，与 preload 的命名空间一一对应，
 * 保证通道字符串零变化（renderer 完全无感）。
 */
export type InvokeHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any
export type SendHandler = (event: IpcMainEvent, ...args: any[]) => void

export interface InvokeRoutes {
  [method: string]: InvokeHandler
}

export interface SendRoutes {
  [method: string]: SendHandler
}

export interface RouterOptions {
  /** 通道前缀，如 'config' → 'config:load' */
  namespace: string
  /** invoke（异步有返回）handler 映射 */
  invoke?: InvokeRoutes
  /** send（火忘）handler 映射 */
  send?: SendRoutes
}

/**
 * 注册一个域的 IPC router。
 * 在 main.ts 的 app.whenReady 里逐域调用。
 */
export function registerRouter(options: RouterOptions): void {
  const { namespace, invoke, send } = options

  if (invoke) {
    for (const [method, handler] of Object.entries(invoke)) {
      const channel = `${namespace}:${method}`
      ipcMain.handle(channel, (event, ...args) => {
        try {
          return handler(event, ...args)
        } catch (e: any) {
          // 错误边界：未捕获的同步异常归一为 error 字符串，避免 renderer 收到 reject 后无法收窄。
          // 异步 handler 自身的 reject 由 Node Promise 链处理；service 内应自行 catch 并返回 {ok:false}。
          return { ok: false, error: String(e?.message || e) }
        }
      })
    }
  }

  if (send) {
    for (const [method, handler] of Object.entries(send)) {
      const channel = `${namespace}:${method}`
      ipcMain.on(channel, (event, ...args) => {
        try {
          handler(event, ...args)
        } catch (e: any) {
          // send 是火忘，无返回值；错误仅日志，不向 renderer 回送（保持与现有 ipcMain.on 行为一致）
          console.error(`[router:${channel}]`, e)
        }
      })
    }
  }
}
