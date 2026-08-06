import type { WebContents } from 'electron'

/**
 * CapabilityRegistry —— 脚本沙箱能力的可插拔注册中心。
 *
 * 背景：组4 把原 main.ts 内联的 sandbox 对象字面量（~450 行）拆分为
 *   per-domain CapabilityProvider，使能力可插拔（为后续 Python/插件铺路）。
 *
 * 设计：
 * - RunContext 承载单次执行（scripts:run）的闭包状态：runId/ctx(面板 id)/token(取消)/
 *   sandboxState(_last_recv+globalVars)/sender+emitLog(日志)/listenerIndex(共享 watcher 计数器)。
 *   每个 provider 的 apis(rc) 用 rc 重建原本依赖 run 闭包的函数，行为逐行对照搬移，零变化。
 * - CapabilityProvider 按 domain 拆分：core/serial/tcp/modbus/codec。
 *   每个 provider 持有跨 run 共享的服务引用（serial/tcp/modbus service、脚本监听器 helpers、
 *   modbus clients、buildWriteBuffer 等），apis(rc) 返回该域注入沙箱的方法集合。
 * - buildSandbox(rc) 合并所有 provider 的 apis()：后注册的同名 key 覆盖先注册的（warn 打印冲突）。
 *   合并顺序 = 注册顺序，由 ScriptService 装配时固定：core → serial → tcp → modbus → codec。
 *
 * 信任模型：node:vm 非沙箱（见 ScriptService.run 注释），本注册中心仅做能力拼装，
 *   不负责隔离。
 */

/** 单次脚本执行的上下文（原 main.ts scripts:run handler 内的闭包变量集合）。 */
export interface RunContext {
  /** 本次执行的唯一 id（ipcMain handler 生成）。 */
  runId: string
  /** 面板上下文：ctx.id 为活跃面板 id（可空 ''，'test' 走测试短路）。 */
  ctx: { id?: string }
  /** 取消令牌：abort 时 aborted=true 并触发 abortHandlers。 */
  token: { aborted: boolean; abortHandlers: Set<() => void> }
  /** 沙箱状态：globalVars（用户变量）+ _last_recv（最近收包文本）。 */
  sandboxState: { globalVars: any; _last_recv: string }
  /** 触发脚本的 webContents（用于 emit scripts:log / scripts:ended）。 */
  sender: WebContents
  /** 追加一条日志并经 sender 发 scripts:log。 */
  emitLog: (line: string) => void
  /** 跨 provider 共享的可变 watcher id 计数器（原 `let listenerIndex = 0`）。 */
  listenerIndex: { n: number }
}

/** 能力提供者：按 domain 暴露一组沙箱 API，apis(rc) 在每次 run 时重建闭包。 */
export interface CapabilityProvider {
  /** 提供者唯一 id：'core' | 'serial' | 'tcp' | 'modbus' | 'codec'。 */
  id: string
  /** 返回该 domain 注入沙箱的 API 映射（key=沙箱 API 名，value=函数/对象）。 */
  apis(rc: RunContext): Record<string, any>
}

/**
 * 能力注册中心。ScriptService 持有一个实例，装配时注册 5 个 provider。
 * 每次 run 调用 buildSandbox(rc) 得到完整 sandbox 对象。
 */
export class CapabilityRegistry {
  private readonly providers: CapabilityProvider[] = []

  /** 注册一个 provider；重复 id 打印 warn（便于发现装配错误）。 */
  register(provider: CapabilityProvider): void {
    if (this.providers.some((p) => p.id === provider.id)) {
      console.warn(`[CapabilityRegistry] duplicate provider id: ${provider.id}`)
    }
    this.providers.push(provider)
  }

  /**
   * 合并所有 provider 的 apis(rc) 生成沙箱对象。
   * 后注册的同名 key 覆盖先注册的（默认 domain 之间无冲突；若冲突打印 warn）。
   */
  buildSandbox(rc: RunContext): Record<string, any> {
    const sandbox: Record<string, any> = {}
    for (const provider of this.providers) {
      const apis = provider.apis(rc)
      for (const [key, value] of Object.entries(apis)) {
        if (Object.prototype.hasOwnProperty.call(sandbox, key)) {
          console.warn(`[CapabilityRegistry] sandbox key collision: ${key} (overwritten by provider '${provider.id}')`)
        }
        sandbox[key] = value
      }
    }
    return sandbox
  }
}
