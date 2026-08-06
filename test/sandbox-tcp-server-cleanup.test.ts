/**
 * 回归：sandboxTcpServers（脚本 listenTcpServerPackets/waitTcpServer 建的沙箱
 * 独立 TCP 服务器）此前在脚本结束 / window-all-closed 时**不清理**，导致端口
 * 与 net.Server 泄漏存活到进程退出。此测试锁定三处清理点的存在性。
 *
 * 跟随 window-all-closed-cleanup.test.ts 的源码扫描惯例（electron 主进程无法
 * 在 vitest node 环境导入执行）。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const scriptService = fs.readFileSync(path.resolve(__dirname, '../electron/services/script.service.ts'), 'utf-8')

describe('sandboxTcpServers 生命周期清理（防端口泄漏）', () => {
  it('ensureTcpServer 记录创建者 runId（供 run 结束精准清理）', () => {
    // 签名含 runId? 参数
    expect(scriptService).toContain('ensureTcpServer(port: number, serverId = `tcpServer:${port}`, runId?: string)')
    // entry 结构含 runId 字段
    expect(scriptService).toContain('runId?: string }>()')
    // set 时写入 runId 归属
    expect(scriptService).toContain('this.sandboxTcpServers.set(serverId, { server, port, clients, runId })')
  })

  it('run() finally 清理本 run 的沙箱 TCP 服务器', () => {
    const finallyBlock = scriptService.match(/finally \{[\s\S]*?this\.removeScriptTcpClients\(runId\)[\s\S]*?\}/)
    expect(finallyBlock, 'run() finally 块应存在').not.toBeNull()
    expect(finallyBlock![0]).toContain('removeSandboxTcpServers(runId)')
  })

  it('removeSandboxTcpServers 仅清 runId 匹配的（不误伤并发 run 的服务器）', () => {
    const m = scriptService.match(/removeSandboxTcpServers\(runId: string\): void \{[\s\S]*?\n  \}/)
    expect(m, 'removeSandboxTcpServers 方法应存在').not.toBeNull()
    const body = m![0]
    // 守卫：只清归属匹配的
    expect(body).toContain('if (entry.runId !== runId) continue')
    // 关 server + 清 clients + 删 map
    expect(body).toContain('entry.server.close()')
    expect(body).toContain('this.sandboxTcpServers.delete(serverId)')
    // 同步清 TcpService 侧该 serverId 的 buffer/watcher
    expect(body).toContain('removeTcpServerState(serverId)')
  })

  it('abortAllRunning 清理所有沙箱 TCP 服务器（window-all-closed 经此入口）', () => {
    const m = scriptService.match(/abortAllRunning\(\): void \{[\s\S]*?\n  \}/)
    expect(m, 'abortAllRunning 方法应存在').not.toBeNull()
    expect(m![0]).toContain('destroyAllSandboxTcpServers()')
  })

  it('destroyAllSandboxTcpServers 清空两个 map（servers + 启动中 starts）', () => {
    const m = scriptService.match(/destroyAllSandboxTcpServers\(\): void \{[\s\S]*?\n  \}/)
    expect(m, 'destroyAllSandboxTcpServers 方法应存在').not.toBeNull()
    const body = m![0]
    expect(body).toContain('this.sandboxTcpServers.clear()')
    expect(body).toContain('this.sandboxTcpServerStarts.clear()')
  })

  it('TcpService.removeTcpServerState 清 buffer + watchers', () => {
    const tcpService = fs.readFileSync(path.resolve(__dirname, '../electron/services/tcp.service.ts'), 'utf-8')
    const m = tcpService.match(/removeTcpServerState\(serverId: string\): void \{[\s\S]*?\n  \}/)
    expect(m, 'removeTcpServerState 方法应存在').not.toBeNull()
    const body = m![0]
    expect(body).toContain('this.tcpServerDataBuffer.delete(serverId)')
    expect(body).toContain('this.tcpServerWatchers.delete(serverId)')
  })
})
