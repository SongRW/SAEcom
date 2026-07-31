/**
 * 外链防护应为全局单一权威，而非依赖主窗逐窗口注册（脆弱 + 其他窗口漏防护）。
 *
 * 背景：主窗 createMainWindow 在 webContents 上注册 setWindowOpenHandler deny 外链，
 * 但全局 app.on('web-contents-created') 又对所有 webContents 注册了 SerialWave-only handler，
 * 非 SerialWave 分支恒返回 allow。两者谁胜出取决于注册时机（脆弱），且 popout/示波器/
 * 脚本编辑器/about/changelog 等窗口只有全局 handler，完全无外链拦截。
 *
 * 修复要求：全局 web-contents-created handler 的非 SerialWave 分支也必须对外链
 * （http/https/mailto）走 shell.openExternal 并 deny，成为所有窗口的统一防线。
 *
 * electron/main.ts 无法在 vitest node 环境导入执行，故跟随 rete-codegen.test.ts 源码扫描惯例。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

describe('external-link guard is a global authority', () => {
  it('全局 web-contents-created handler 的非 SerialWave 分支拦截外链（deny 外链 url）', () => {
    // 截取全局 web-contents-created handler 整块
    const block = main.match(/app\.on\('web-contents-created'[\s\S]*?\r?\n\}\)\r?\napp\.on\('window-all-closed'/)
    expect(block, 'web-contents-created → window-all-closed 块应存在').not.toBeNull()
    const handler = block![0]
    // 非 SerialWave 分支不能只是无条件 allow——必须对外链 url 调 openExternal 并 deny
    expect(handler).toContain('openExternal')
    // 且存在 deny 分支（拦截外链，不允许内嵌打开）
    expect(handler).toContain("action: 'deny'")
  })
})
