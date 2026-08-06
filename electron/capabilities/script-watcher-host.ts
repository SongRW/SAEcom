import type net from 'node:net'

/**
 * ScriptWatcherHost —— provider 对 ScriptService 持有状态的访问契约。
 *
 * 这些函数/状态原为 main.ts 顶层（addScriptWatcher / scriptTcpClients / sandboxTcpServers），
 * 组4 迁移后归 ScriptService 私有持有。provider 不直接 import ScriptService
 * （避免循环依赖：ScriptService 构造时注册 provider），而是依赖此接口；
 * ScriptService 实现该接口并把自身引用注入 provider 构造参数。
 *
 * 行为签名逐函数对照搬移自 main.ts，零变化：
 * - addScriptWatcher(portId, watcherId, fn)：注册一个监听器（watcherId 含 runId 前缀）
 * - removeScriptWatcherExact(watcherId)：精确删一个 watcher
 * - notifyScriptWatchers(portId, buf)：串口/TCP 数据到达时广播（注入为 dataBroadcaster）
 *
 * 脚本 TCP 客户端池（sendTCP 复用 listenTcpPackets 的连接）：
 * - registerScriptTcpClient / findScriptTcpClient / removeScriptTcpClients
 *
 * 沙箱独立 TCP 服务器（listenTcpServerPackets/broadcastTcpServer/waitTcpServerPacket 用）：
 * - sandboxTcpServers（运行中的服务器表）+ sandboxTcpServerStarts（启动中 Promise 去重）
 * - ensureTcpServer(port, serverId?)：启动或复用，返回 {ok, id, port, already?}
 *   注意：数据 buffer/watcher 共享 TcpService 池（pushTcpServerData/notifyTcpServerWatchers），
 *   仅 server socket 由沙箱自管生命周期。
 */
export interface ScriptWatcherHost {
  addScriptWatcher(portId: string, watcherId: string, fn: any): void
  removeScriptWatcherExact(watcherId: string): void
  notifyScriptWatchers(portId: string, buf: Buffer): void

  registerScriptTcpClient(runId: string, host: string, port: number, socket: net.Socket): void
  findScriptTcpClient(runId: string, host: string, port: number): net.Socket | null
  removeScriptTcpClients(runId: string): void

  /** 沙箱独立 TCP 服务器表（broadcastTcpServer 检查 clients 用）。 */
  getSandboxTcpServer(serverId: string): { clients: Set<any> } | undefined
  /** 启动/复用沙箱 TCP 服务器。 */
  ensureTcpServer(port: number, serverId?: string): Promise<any>
}
