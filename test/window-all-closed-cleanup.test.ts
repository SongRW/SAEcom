/**
 * window-all-closed 必须清理所有持有 win/sender 引用的资源，
 * 否则泄漏 + 向已销毁 webContents 发消息。
 *
 * 组2 重构后串口/TCP/Modbus/共享 的清理经各 service（状态私有化）；
 * 组4 重构后运行中脚本清理经 scriptService.abortAllRunning()（token 持有 sender 引用，
 * 状态归 ScriptService 私有持有）。service 内部的清理实现各自扫描对应 service 文件。
 *
 * electron 主进程无法在 vitest node 环境导入执行，故跟随 rete-codegen.test.ts 源码扫描惯例。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')
const scriptService = fs.readFileSync(path.resolve(__dirname, '../electron/services/script.service.ts'), 'utf-8')

describe('window-all-closed cleans up resource maps holding sender refs', () => {
  it('window-all-closed handler 经 service 清理串口/TCP/Modbus/共享 + scriptService 清理运行中脚本', () => {
    // 截取 window-all-closed handler 整块。
    const m = main.match(/app\.on\('window-all-closed'[\s\S]*?\r?\n\}\)\r?\n/)
    expect(m, 'window-all-closed handler 块应存在').not.toBeNull()
    const handler = m![0]

    // 串口/共享：经 serialService 清理
    expect(handler).toContain('serialService.closeAllPorts')
    expect(handler).toContain('serialService.stopAllTcpShares')
    // Modbus：经 modbusService 清理
    expect(handler).toContain('modbusService.closeAll')
    // TCP 客户端 + 服务器：经 tcpService 清理
    expect(handler).toContain('tcpService.closeAllSockets')
    expect(handler).toContain('tcpService.destroyAllServers')
    // 运行中脚本：经 scriptService.abortAllRunning() 清理（token 持有 sender，避免向死 sender 发 scripts:ended）
    expect(handler).toContain('scriptService.abortAllRunning()')
    // ScriptService 内部清理实现遍历 runningScripts Map 并 abort
    expect(scriptService).toMatch(/runningScripts/)
    expect(scriptService).toContain('abortAllRunning(): void')
  })
})
