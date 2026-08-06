import { registerRouter, type InvokeRoutes } from '../core/ipc'
import type { TcpService } from '../services/tcp.service'

/**
 * TcpRouter —— TCP 客户端 + TCP 服务器 域的 IPC 注册。
 *
 * 通道名零变化：
 *   tcp:open / tcp:write / tcp:close
 *   tcpServer:start / tcpServer:stop / tcpServer:status / tcpServer:broadcast
 *
 * 参数解构对齐原 main.ts handler 签名（含默认值 mode='text'/append='none'/encoding='utf-8'）。
 */
export function registerTcpRouter(service: TcpService): void {
  const tcpInvoke: InvokeRoutes = {
    open: (e, { host, port, options }) => service.open(host, port, options, e),
    write: (_e, { id, data, mode = 'text', append = 'none', encoding = 'utf-8' }) =>
      service.write(id, data, mode, append, encoding),
    close: (_e, { id }) => service.close(id)
  }

  const tcpServerInvoke: InvokeRoutes = {
    start: (e, { port, echo }) => service.startServer(port, echo, e),
    stop: (_e, { id }) => service.stopServer(id),
    status: (_e, { id }) => service.serverStatus(id),
    broadcast: (_e, { id, data, mode = 'text', append = 'none', encoding = 'utf-8' }) =>
      service.broadcastServer(id, data, mode, append, encoding)
  }

  registerRouter({ namespace: 'tcp', invoke: tcpInvoke })
  registerRouter({ namespace: 'tcpServer', invoke: tcpServerInvoke })
}
