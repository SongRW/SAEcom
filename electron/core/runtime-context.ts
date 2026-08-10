import type { ConfigService } from '../services/config.service'
import type { AppService } from '../services/app.service'
import type { SerialService } from '../services/serial.service'
import type { TcpService } from '../services/tcp.service'
import type { ModbusService } from '../services/modbus.service'
import type { WindowService } from '../services/window.service'
import type { ScriptService } from '../services/script.service'
import type { AgentService } from '../services/agent.service'
import type { ScriptsRepository } from '../repositories/scripts.repository'
import type { CustomComponentsRepository } from '../repositories/custom-components.repository'

/**
 * RuntimeContext —— 主进程依赖注入容器。
 *
 * 装配结果的唯一持有者：所有 service / repository 实例都在 main.ts 构造
 * （构造顺序即依赖拓扑序：Config/App/Serial/Tcp/Modbus/Window 先于 Script，
 * Repository 无依赖），随后经 `register(...)` 登记到本容器。
 *
 * 之后各 router、plugin host 等消费者从 ctx 取其依赖，避免：
 * - service 间反向 import（防循环依赖，依赖关系经构造注入显式化）
 * - 消费者各自持有散落的全局引用（测试/E2E 无法统一替换）
 *
 * 设计取舍：本容器**不内化跨服务的回调注入**（如 serial/tcp 的
 * dataBroadcaster → scriptService.notifyScriptWatchers）。那些装配步骤
 * 带有业务语义，留在 main.ts 显式编排更可读、可测；本容器只做"装好后
 * 提供访问入口"。后续如需为 plugin host 暴露 service，统一从 ctx 取。
 *
 * 字段为 readonly：构造后只读，禁止运行时替换（保证全 app 单例语义）。
 * 扩展点：新增域时，在 RuntimeServices / RuntimeRepositories 接口补字段，
 * 并在 main.ts 装配后 register 进来。
 */
export interface RuntimeServices {
  config: ConfigService
  app: AppService
  serial: SerialService
  tcp: TcpService
  modbus: ModbusService
  window: WindowService
  script: ScriptService
  agent: AgentService
}

export interface RuntimeRepositories {
  scripts: ScriptsRepository
  customComponents: CustomComponentsRepository
}

export class RuntimeContext {
  private readonly services = {} as RuntimeServices
  private readonly repositories = {} as RuntimeRepositories

  /** 登记一个 service（装配后由 main.ts 调用）。重复登记抛错，避免静默覆盖。 */
  registerService<K extends keyof RuntimeServices>(
    key: K,
    service: RuntimeServices[K]
  ): void {
    if (this.services[key] !== undefined) {
      throw new Error(`[RuntimeContext] service '${key}' 已注册（禁止重复登记）`)
    }
    this.services[key] = service
  }

  /** 登记一个 repository。 */
  registerRepository<K extends keyof RuntimeRepositories>(
    key: K,
    repo: RuntimeRepositories[K]
  ): void {
    if (this.repositories[key] !== undefined) {
      throw new Error(`[RuntimeContext] repository '${key}' 已注册（禁止重复登记）`)
    }
    this.repositories[key] = repo
  }

  /** 取一个 service。未注册时抛错（消费侧不应容忍缺失）。 */
  service<K extends keyof RuntimeServices>(key: K): RuntimeServices[K] {
    const s = this.services[key]
    if (!s) throw new Error(`[RuntimeContext] service '${key}' 未注册`)
    return s
  }

  /** 取一个 repository。 */
  repository<K extends keyof RuntimeRepositories>(key: K): RuntimeRepositories[K] {
    const r = this.repositories[key]
    if (!r) throw new Error(`[RuntimeContext] repository '${key}' 未注册`)
    return r
  }

  /** 是否已登记某 service（plugin host 启动前探测依赖齐备性用）。 */
  hasService<K extends keyof RuntimeServices>(key: K): boolean {
    return this.services[key] !== undefined
  }
}
