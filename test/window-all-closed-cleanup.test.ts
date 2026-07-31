/**
 * window-all-closed 必须清理所有持有 win/sender 引用的资源 map，
 * 否则泄漏 + 向已销毁 webContents 发消息。
 *
 * 涉及 map（均持有 e.sender/win 引用）：
 *   - sockets（tcp:open 的 entry.win）→ 应 socket.end/destroy
 *   - tcpServers（tcpServer:start 的 win）→ 应 server.close + clients.destroy
 *   - shares（tcpShare 的 server + onSerialData）→ 应 stopTcpShare
 *   - runningScripts（scripts 的 token + e.sender）→ 应取消（token.aborted=true + abortHandlers）
 *
 * electron/main.ts 无法在 vitest node 环境导入执行，故跟随 rete-codegen.test.ts 源码扫描惯例。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

describe('window-all-closed cleans up resource maps holding sender refs', () => {
  it('window-all-closed handler 同时清理 sockets/tcpServers/shares/runningScripts', () => {
    // 截取 window-all-closed handler 整块（多行，直到下一个顶层 app.on / 注释）。
    // 用从 'window-all-closed' 到下一个 '// ' 行注释或 'app.on(' 的区间。
    const m = main.match(/app\.on\('window-all-closed'[\s\S]*?\r?\n\}\)\r?\n/)
    expect(m, 'window-all-closed handler 块应存在').not.toBeNull()
    const handler = m![0]

    // 串口（既有）：ports.forEach port.close
    expect(handler).toContain('ports.forEach')
    // TCP 客户端 socket：应销毁 sockets 中的 socket
    expect(handler).toMatch(/sockets/)
    // TCP 服务器：应关闭
    expect(handler).toMatch(/tcpServers/)
    // TCP 共享：应停止
    expect(handler).toMatch(/shares/)
    // 运行中脚本：应取消（清理 token，避免向死 sender 发 scripts:ended）
    expect(handler).toMatch(/runningScripts/)
  })
})
