import { test as base, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * E2E 测试夹具：封装 Electron 启动 + 临时 userData 隔离 + 多窗口辅助。
 *
 * 启动走 build 产物（out/main/index.js），通过 env 钩子让主进程：
 *  - SAECOM_FORCE_PROD=1：强制 prod 分支加载 out/renderer（绕过 isDev 陷阱）
 *  - SAECOM_USER_DATA=<临时目录>：隔离 panels.json/commands.json/scripts，不污染本地
 *  - SAECOM_E2E=1：关闭更新检查弹窗，避免模态 dialog 阻塞测试
 */

const MAIN_ENTRY = resolve(__dirname, '../out/main/index.js')

/** 侧栏底部页签 / 菜单文案（来自 i18n zh-CN mainWindow.sidebar）。 */
export const NAV = {
  pageSerial: '串口',
  pageCommands: '命令',
  pageScript: '脚本',
  about: '关于',
  settings: '设置',
  newPanel: '新建面板'
} as const

export interface ElectronFixtures {
  /** 已启动的 Electron 应用实例。 */
  electronApp: ElectronApplication
  /** 主窗口（第一个窗口）的 Page。 */
  page: Page
}

/**
 * 扩展夹具：每个 test 自动启动一个干净的 Electron 实例，结束时关闭并清理临时目录。
 */
export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const userData = mkdtempSync(join(tmpdir(), 'saecom-e2e-'))
    const app = await electron.launch({
      args: [MAIN_ENTRY],
      env: {
        ...process.env,
        SAECOM_FORCE_PROD: '1',
        SAECOM_USER_DATA: userData,
        SAECOM_E2E: '1'
      }
    })
    await use(app)
    await app.close()
    // 关闭后再清理，避免主进程仍持有文件句柄
    try {
      rmSync(userData, { recursive: true, force: true })
    } catch {
      /* Windows 上偶发占用，忽略 */
    }
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await use(page)
  }
})

export { expect }

/**
 * 等待并返回符合 URL 片段的窗口。主进程给各窗口加载的 file 路径含 html 名：
 *   主窗口 mainwindow.html / 关于 about.html / 更新日志 changelog.html / 面板 panel.html / 脚本 script-editor.html
 */
export async function waitForWindow(
  app: ElectronApplication,
  fileFragment: string,
  timeout = 15000
): Promise<Page> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const win = app.windows().find((w) => w.url().includes(fileFragment))
    if (win) return win
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`等待窗口超时：未找到含 "${fileFragment}" 的窗口`)
}

/**
 * 等待窗口数量变为预期值（用于"打开新窗口后窗口数 +1"断言）。
 */
export async function waitForWindowCount(
  app: ElectronApplication,
  expected: number,
  timeout = 15000
): Promise<number> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (app.windows().length >= expected) return app.windows().length
    await new Promise((r) => setTimeout(r, 200))
  }
  return app.windows().length
}
