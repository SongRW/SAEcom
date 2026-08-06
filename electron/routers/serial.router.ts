import { registerRouter, type InvokeRoutes } from '../core/ipc'
import type { SerialService } from '../services/serial.service'

/**
 * SerialRouter —— 串口 + TCP 共享(LAN 转发) 域的 IPC 注册。
 *
 * 通道名零变化：serial:list / serial:open / serial:close / serial:write /
 *   tcpShare:start / tcpShare:stop / tcpShare:status。
 *
 * serial:write 用 spread 传参（原 main.ts: `writeToSerial(a.id, a.data, a.mode, a.append, a.encoding)`），
 * 此处展开对齐。tcpShare 用 parseInt 兜底 port（原行为）。
 */
export function registerSerialRouter(service: SerialService): void {
  const serialInvoke: InvokeRoutes = {
    list: () => service.listSerialPortsSafe(),
    open: (_e, { path: p, options }) => service.ensureSerialOpen(p, options),
    close: (_e, { id }) => service.closeSerial(id),
    write: (_e, a: any) => service.writeToSerial(a.id, a.data, a.mode, a.append, a.encoding)
  }

  const tcpShareInvoke: InvokeRoutes = {
    start: (_e, { id, port }) => {
      const p = parseInt(port, 10) || 9000
      const rec = service.startTcpShare(id, p)
      const ips = service.listLanIPv4()
      const addrs = ips.map(ip => `${ip}:${rec.port}`)
      return { ok: true, port: rec.port, addrs, best: addrs[0], candidates: addrs }
    },
    stop: (_e, { id }) => { service.stopTcpShare(id); return { ok: true } },
    status: (_e, { id }) => {
      // tcpShare:status 原直接读 shares.get(id)；此处经 service 暴露的状态查询。
      // 为零回归，复用 startTcpShare 已登记的 rec：若无则 active:false。
      // 但 service 内部 shares 私有，需一个查询方法。见 SerialService.hasTcpShare —— 这里
      // 需要完整的 rec（含 port）。改用一个 queryTcpShare 方法返回 rec 或 null。
      const rec = service.queryTcpShare(id)
      if (!rec) return { ok: true, active: false }
      const ips = service.listLanIPv4()
      const addrs = ips.map(ip => `${ip}:${rec.port}`)
      return { ok: true, active: true, port: rec.port, addrs, best: addrs[0], candidates: addrs }
    }
  }

  registerRouter({ namespace: 'serial', invoke: serialInvoke })
  registerRouter({ namespace: 'tcpShare', invoke: tcpShareInvoke })
}
