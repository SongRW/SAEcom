/**
 * 自动更新仅支持 Windows（FILE_SUFFIX=-win-x64.exe，runInstallerAndQuit 用 cmd/start），
 * 应在 checkForUpdates 入口按平台短路，避免 mac/linux 误判或执行 Windows 专属命令。
 *
 * electron/main.ts 无法在 vitest node 环境导入执行，故跟随 rete-codegen.test.ts 源码扫描惯例。
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const main = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf-8')

describe('auto-update guards by platform', () => {
  it('checkForUpdates 在非 Windows 平台短路（platform === win32 守卫）', () => {
    // 截取 checkForUpdates 函数体头部，确认存在平台守卫
    const m = main.match(/function checkForUpdates\(isManual = false\): void \{[\s\S]*?https\.get/)
    expect(m, 'checkForUpdates 函数应存在').not.toBeNull()
    const head = m![0]
    expect(head).toMatch(/process\.platform\s*[!=]==?\s*['"]win32['"]/)
  })
})
