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

export type NavPage = typeof NAV.pageSerial | typeof NAV.pageCommands | typeof NAV.pageScript

export interface ElectronFixtures {
  /** 已启动的 Electron 应用实例。 */
  electronApp: ElectronApplication
  /** 主窗口（第一个窗口）的 Page。已等待冷启动加载层消失。 */
  page: Page
}

/**
 * 等待主窗口冷启动遮罩消失。
 * mainwindow 有 #app-loader：React 首帧后隐藏，最坏 8s 兜底。
 * 在此之前侧栏按钮虽已在 DOM，但 click 会卡在 actionability。
 */
export async function waitForAppReady(page: Page) {
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 15000 })
  // 等侧栏操作区与底部页签都渲染完，避免首帧后 transition 仍在跑。
  await expect(newPanelButton(page)).toBeVisible()
  await expect(navPageButton(page, NAV.pageSerial)).toBeVisible()
  await expect(navPageButton(page, NAV.pageScript)).toBeVisible()
  await expect(page.getByRole('button', { name: NAV.about, exact: true })).toBeVisible()
}

/**
 * 点击可能因 transition/Tooltip/Dialog 动画而卡在 Playwright "stable" 检查的按钮。
 * 顺序：常规 click（3s）→ force click → 原生 DOM click。
 * 原生 DOM click 能稳定触发 React onClick，适合 Dialog 创建/完成、极小 hit-box。
 */
export async function clickReady(
  page: Page,
  target: {
    click: (opts?: { force?: boolean; timeout?: number }) => Promise<void>
    evaluate: (fn: (el: HTMLElement) => void) => Promise<void>
    first?: () => any
  }
) {
  const locator = typeof target.first === 'function' ? target.first() : target
  await expect(locator).toBeVisible()
  try {
    await locator.click({ timeout: 3000 })
    return
  } catch {
    /* stable 检查卡住时继续 */
  }
  try {
    await locator.click({ force: true, timeout: 2000 })
    return
  } catch {
    /* 再退到原生 DOM click */
  }
  await locator.evaluate((el: HTMLElement) => el.click())
}

/**
 * 等 Dialog 关闭：断言 content 与 overlay 都已从 DOM 卸载（而非仅 data-state 变 closed）。
 *
 * 早期版本只轮询 data-state !== 'open'，但 Radix Presence 退出动画偶发被
 * 重渲染打断（animationcancel 取代 animationend），节点会卡在 unmountSuspended：
 * data-state 已为 closed 却仍挂在 DOM，继续拦截 pointer 事件、让后续工具栏点击
 * 找不到目标。改用 toHaveCount(0) 严格校验卸载完成，从测试侧守住这个 race。
 * 建议对已知目标对话框传入 name 具名锁定（避免误判其它并发 dialog）。
 */
export async function expectDialogClosed(page: Page, name?: string | RegExp) {
  const dialog = name
    ? page.getByRole('dialog', { name })
    : page.getByRole('dialog')
  // content 必须真正卸载
  await expect(dialog).toHaveCount(0, { timeout: 10000 })
  // 所有 overlay 也卸载（Radix 退出动画收尾）
  const overlay = page.locator('[data-slot="dialog-overlay"]')
  await expect(overlay).toHaveCount(0, { timeout: 5000 })
}

/**
 * 点击侧栏 SidebarMenuButton。
 * 这些按钮包在 Tooltip 里且常有 width/padding transition；Playwright 的
 * "stable" 检查偶发 30s 超时（元素已找到、可见、enabled，但布局持续微抖）。
 */
async function clickSidebarMenuButton(page: Page, button: ReturnType<Page['getByRole']>) {
  await clickReady(page, button)
}

/** 侧栏底部页签按钮（role=button，避免命中内部 span 导致 actionability 超时）。 */
export function navPageButton(page: Page, label: NavPage) {
  return page.getByRole('button', { name: label, exact: true })
}

/** 侧栏「新建面板」按钮（exact，避免与空态「（新建面板）」冲突）。 */
export function newPanelButton(page: Page) {
  return page.getByRole('button', { name: NAV.newPanel, exact: true })
}

/** 切换侧栏底部页签。 */
export async function openNavPage(page: Page, label: NavPage) {
  await clickSidebarMenuButton(page, navPageButton(page, label))
}

/** 打开「新建面板」对话框。 */
export async function openNewPanelDialog(page: Page) {
  await clickSidebarMenuButton(page, newPanelButton(page))
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  return dialog
}

/**
 * 新建并确认关闭「新建面板」对话框。
 * Dialog 的「创建」回调对 Playwright force 点击不稳定，统一用原生 DOM click；
 * 关闭后以侧栏列表项为锚点确认面板已创建。
 */
export async function confirmNewPanelDialog(page: Page, dialog: ReturnType<Page['getByRole']>) {
  await dialog.getByRole('button', { name: '创建' }).evaluate((el: HTMLElement) => el.click())
  // 具名锁定「新建面板」：严格断言其 content+overlay 已卸载，守住 Radix 退出动画 race。
  await expectDialogClosed(page, '新建面板')
  await expect(page.locator('[title*="双击重命名"]').first()).toBeVisible({ timeout: 15000 })
}

/**
 * 新建 Modbus TCP 面板（打开对话框 → 切 Modbus → 填 host/port → 创建）。
 * 返回推导出的 panelId（与 NewPanelDialog 命名规则一致）。
 */
export async function createModbusTcpPanel(page: Page, port: number, host = '127.0.0.1') {
  const dialog = await openNewPanelDialog(page)
  await expect(dialog).toBeVisible()
  // 模式切换按钮偶发卡 stable，优先 force / DOM click
  await dialog.getByRole('button', { name: 'Modbus', exact: true }).evaluate((el: HTMLElement) => el.click())
  await expect(dialog.locator('label', { hasText: 'Modbus TCP' })).toBeVisible()
  await dialog.locator('input').nth(0).fill(host)
  await dialog.locator('input').nth(1).fill(String(port))
  await confirmNewPanelDialog(page, dialog)
  // 工具栏挂载略晚于侧栏列表；创建成功后应出现「新增区块」
  await expect(page.getByRole('button', { name: /新增区块/ })).toBeVisible({ timeout: 15000 })
  return `modbus://tcp/${host}:${port}`
}

/** 打开关于独立窗口（侧栏 Footer「关于」）。 */
export async function openAbout(page: Page) {
  await clickSidebarMenuButton(page, page.getByRole('button', { name: NAV.about, exact: true }))
}

/**
 * 通过 IPC 往返确认脚本操作（创建/重命名/删除）已在主进程完成。
 *
 * Radix Dialog 嵌套关闭后，父 dialog 的 pointer-events/可见性恢复有延迟，
 * 导致 Playwright 定位器在恢复期内找不到编辑器按钮。直接在 UI 层等待不可靠。
 * 改为用 renderer→main→renderer 的 IPC 往返（scripts.list）作为屏障：
 * 主进程文件操作完成后 list 才会返回最新结果，往返完成即可安全继续 UI 交互。
 */
export async function waitForScriptsSync(page: Page) {
  await page.evaluate(async () => {
    await window.api.scripts.list()
  })
}

/**
 * 填写 PromptDialog 输入框并提交，然后用 IPC 屏障等待操作完成。
 *
 * 用原生 DOM click 触发确定按钮的 React onClick（form submit），
 * 不依赖焦点位置或 Playwright actionability。
 * 提交后用 IPC 往返替代 expectDialogClosed 作为完成屏障。
 */
export async function fillPromptAndSubmit(
  page: Page,
  dialog: ReturnType<Page['getByRole']>,
  value: string
) {
  const input = dialog.getByRole('textbox')
  await input.waitFor()
  await input.fill(value)
  await dialog.getByRole('button', { name: '确定' }).evaluate((el: HTMLElement) => el.click())
  await waitForScriptsSync(page)
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
    // 统一等冷启动遮罩消失，避免各 spec 在「按钮已出现但不可点」时 30s 超时。
    await waitForAppReady(page)
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
