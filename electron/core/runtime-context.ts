/**
 * RuntimeContext —— 依赖注入容器。
 *
 * 构造顺序即依赖拓扑序（Serial/Tcp/Modbus 先于 Script），
 * 后续 service 经构造参数注入其依赖，禁止反向 import（防循环依赖）。
 *
 * 组1 阶段只装配 ConfigService + AppService；后续组逐步加入
 * Serial/Tcp/Modbus/Window/Script service。
 *
 * 这是唯一持有所有 service 实例引用的地方——main.ts 装配一次，
 * 各 router 从 ctx 取其 service。Service 间不直接 import 对方模块，
 * 只通过构造注入的引用交互，依赖关系显式可测。
 */
export interface RuntimeContext {
  // 组1
  config: import('../services/config.service').ConfigService
  app: import('../services/app.service').AppService
  // 后续组逐步加入：
  // serial: SerialService
  // tcp: TcpService
  // modbus: ModbusService
  // window: WindowService
  // script: ScriptService
}
