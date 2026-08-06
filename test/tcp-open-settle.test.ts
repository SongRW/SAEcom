/**
 * tcp:open 的同步 s.connect() 抛错时必须 settle 外层 promise，
 * 否则渲染层 await 永久挂起（main.ts 旧实现：start() 的 catch 只 delete+return，
 * 丢弃了返回值，外层 new Promise 永不 resolve）。
 *
 * electron 主进程无法在 vitest node 环境导入执行（import 'electron'），
 * 故跟随 rete-codegen.test.ts 的源码扫描惯例：断言修复所要求的代码形状存在。
 * 注：组2 重构后该逻辑迁移至 electron/services/tcp.service.ts，扫描目标随之更新。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const tcpService = fs.readFileSync(path.resolve(__dirname, '../electron/services/tcp.service.ts'), 'utf-8')

describe('tcp:open settles on synchronous connect() throw', () => {
  it('start() 的 s.connect catch 块调用 rejectOpen（而非仅 delete+return）', () => {
    // 定位 tcp:open 的 start() 内 s.connect 同步 catch 块。
    // 修复要求：catch 中必须 rejectOpen(...)，让外层 Promise 在同步抛错时也能 settle。
    const connectBlock = tcpService.match(/try \{ s\.connect\(\{ host, port \}\) \} catch[\s\S]*?\n    \}/)
    expect(connectBlock, 'tcp:open 的 s.connect 同步 try/catch 块应存在').not.toBeNull()
    expect(connectBlock![0]).toContain('rejectOpen')
  })
})
