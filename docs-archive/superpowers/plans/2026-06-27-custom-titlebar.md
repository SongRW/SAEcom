# 自定义窗口栏（TitleBar）覆盖所有 React 窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为所有 React 窗口（主窗 mainwindow.html + panel 弹出窗）实现统一的自定义窗口栏 `TitleBarChrome`，含拖拽区、品牌/标题、串口连接徽章，参考 zcode 窗口栏观感。

**Architecture:** 组合式底座 `TitleBarChrome`（drag 区 + 品牌点 + 标题文字渐变 + 平台留白 + `status`/`right` 插槽）。主窗注入 `ConnectionBadge`（读 panels store）。Win/Mac 用原生窗口按钮（hidden/overlay），Linux 用自绘 `WindowControls`。所有窗口操作 IPC 用 `BrowserWindow.fromWebContents` 定位当前窗。preprocesses 平台检测复用既有 `navigator.platform` 模式。

**Tech Stack:** React 19 + TypeScript + shadcn/ui (Tailwind v4 oklch tokens) + Zustand (panels store) + Vitest (jsdom-free, SSR renderToStaticMarkup pattern) + Electron IPC.

---

## 关键约束与上下文（实施前必读）

1. **样式**：项目用 Tailwind v4 + oklch token（见 `src/styles/globals.css`）。颜色用 `bg-card`/`border-border`/`text-foreground`/`text-primary` 等语义类，**不要**硬编码十六进制（徽章状态点除外）。亮/暗主题靠 `.dark` class，已有 token，组件无需自管。
2. **drag 语义**：拖拽区用 `[app-region:drag]`（Tailwind v4 任意属性语法），交互元素用 `[app-region:no-drag]`。参考 `src/panel.tsx:187` 已有用法。
3. **平台检测**：复用 `src/features/settings/shortcuts.ts:32` 的 `/mac|iphone|ipad|ipod/i.test(navigator.platform || '')` 模式判断 mac。Win/Linux 区分用 `navigator.userAgent`（Win 含 `Win`，Linux 含 `Linux`，**注意**：Android 的 UA 也含 `Linux`，需先排除 `Android`）。
4. **测试模式**：Vitest 环境是 `node`（非 jsdom），React 组件测试用 `renderToStaticMarkup`（SSR），见 `test/active-panel-config.test.ts`。mock IPC 用 `vi.mock('@/shared/ipc', ...)`。zustand 在 SSR 下读不到运行时 setState，所以依赖 store 运行时变更的断言用 store 级断言。
5. **panel 弹出窗已有标题栏**（`src/panel.tsx:186-212`），含 5 个**承载功能**的按钮：置顶/视图模式/开关串口/嵌回主窗/隐藏。改造时这些按钮必须保留并迁入 `right` 插槽，不能丢失功能。
6. **代码风格**：TSX，两空格缩进，**无分号**（见既有文件）。PascalCase 组件，camelCase hook。
7. **IPC 定位**：所有新窗口操作用 `BrowserWindow.fromWebContents(e.sender)`，**不能**用全局 `mainWindow`（panel/关于等多窗口）。

---

## 文件结构

**新建：**
| 文件 | 职责 |
|---|---|
| `src/components/titlebar/TitleBarChrome.tsx` | 底座：drag 区 + 品牌/标题 + 平台留白 + `status`/`right` 插槽 |
| `src/components/titlebar/ConnectionBadge.tsx` | 串口/TCP 连接状态徽章（读 panels store） |
| `src/components/titlebar/WindowControls.tsx` | Linux 自绘最小化/最大化/关闭按钮 |
| `src/components/titlebar/useWindowControls.ts` | 窗口最大化态的 IPC hook |
| `src/components/titlebar/platform.ts` | 平台检测纯函数（mac/win/linux） |
| `src/components/titlebar/index.ts` | 桶导出 |
| `test/titlebar-platform.test.ts` | 平台检测测试 |
| `test/titlebar-chrome.test.ts` | 底座渲染测试 |
| `test/titlebar-connection-badge.test.ts` | 徽章四态测试 |
| `test/titlebar-window-controls.test.ts` | Linux 控件测试 |

**修改：**
| 文件 | 改动 |
|---|---|
| `shared/types.ts` | `WindowControlAPI` 扩展 minimize/toggleMaximize/close/isMaximized/onMaximizeChange |
| `electron/preload.ts` | 实现 `window` 域新方法 |
| `electron/main.ts` | 新增 5 个 window:* IPC（用 fromWebContents）；panel/about/changelog 的 frame 配置 |
| `src/panel.tsx` | 用 `TitleBarChrome` 替换内联标题栏，按钮迁入 `right` 插槽 |
| `src/mainwindow.tsx` | 顶部挂 `TitleBarChrome`（带 `ConnectionBadge`） |

---

## Task 1: 平台检测纯函数（TDD）

**Files:**
- Create: `src/components/titlebar/platform.ts`
- Test: `test/titlebar-platform.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/titlebar-platform.test.ts`：

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { detectPlatform, isMac } from '@/components/titlebar/platform'

describe('titlebar platform detection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('detects mac via navigator.platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
    expect(detectPlatform()).toBe('mac')
    expect(isMac()).toBe(true)
  })

  it('detects windows via userAgent', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
    expect(detectPlatform()).toBe('win')
    expect(isMac()).toBe(false)
  })

  it('detects linux (excluding android) via userAgent', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    expect(detectPlatform()).toBe('linux')
    expect(isMac()).toBe(false)
  })

  it('classifies android as linux ua but is still not mac/win', () => {
    // Android UA 含 "Linux" 但我们只关心 win/mac/linux 三分；这里确保 Android 不误判为 win/mac
    vi.stubGlobal('navigator', { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 13)' })
    const p = detectPlatform()
    expect(p === 'win' || p === 'mac').toBe(false)
  })

  it('returns linux as default fallback', () => {
    vi.stubGlobal('navigator', { platform: '', userAgent: '' })
    expect(detectPlatform()).toBe('linux')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/titlebar-platform.test.ts`
Expected: FAIL — `Failed to resolve import "@/components/titlebar/platform"`

- [ ] **Step 3: 写最小实现**

创建 `src/components/titlebar/platform.ts`：

```ts
/**
 * 平台检测（渲染进程侧）。
 * - mac：复用既有 navigator.platform 模式（见 shortcuts.ts）
 * - win：navigator.userAgent 含 "Win"
 * - linux：兜底（排除 Android 后含 "Linux"，或无匹配时默认 linux）
 *
 * 注意：Android UA 含 "Linux"，需先排除。Electron 桌面端不会出现 Android，此处仅作健壮性处理。
 */
export type Platform = 'mac' | 'win' | 'linux'

function nav(): { platform: string; userAgent: string } {
  const n = (typeof navigator !== 'undefined' ? navigator : {}) as { platform?: string; userAgent?: string }
  return { platform: n.platform || '', userAgent: n.userAgent || '' }
}

export function detectPlatform(): Platform {
  const { platform, userAgent } = nav()
  if (/mac|iphone|ipad|ipod/i.test(platform)) return 'mac'
  if (/win/i.test(userAgent)) return 'win'
  if (/android/i.test(userAgent)) return 'linux' // Android 不归类为 win/mac
  if (/linux/i.test(userAgent)) return 'linux'
  return 'linux' // 兜底
}

export function isMac(): boolean {
  return detectPlatform() === 'mac'
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/titlebar-platform.test.ts`
Expected: PASS（5 passed）

- [ ] **Step 5: 提交**

```bash
git add src/components/titlebar/platform.ts test/titlebar-platform.test.ts
git commit -m "feat(titlebar): add platform detection helper for windows controls"
```

---

## Task 2: WindowControlAPI 类型扩展

**Files:**
- Modify: `shared/types.ts:206-211`

- [ ] **Step 1: 扩展 WindowControlAPI 接口**

在 `shared/types.ts`，将 `WindowControlAPI`（约 206 行）替换为：

```ts
export interface WindowControlAPI {
  setFullscreen: (flag: boolean) => void
  toggleFullscreen: () => void
  focus: () => void
  setOscilloscopeTop: (flag: boolean) => void
  /** 进程平台（win32/darwin/linux），用于窗口栏按平台分支 */
  platform: () => Promise<'win32' | 'darwin' | 'linux'>
  /** 最小化当前发出请求的窗口 */
  minimize: () => void
  /** 当前窗口最大化/还原切换 */
  toggleMaximize: () => void
  /** 关闭当前窗口 */
  close: () => void
  /** 当前窗口是否已最大化 */
  isMaximized: () => Promise<boolean>
  /** 订阅最大化态变化（返回卸载函数） */
  onMaximizeChange: (cb: (max: boolean) => void) => () => void
}
```

- [ ] **Step 2: 跑 typecheck 确认类型变更被识别**

Run: `npm run typecheck`
Expected: PASS（preload 尚未实现新方法，但类型只是声明，typecheck 应通过——preload 的 `api` 对象缺方法会在下一步修复）

> 说明：如果 typecheck 因 preload 未实现报错，先记下，Task 3 会修复。此步目的是确认 types.ts 改动无语法错误。

- [ ] **Step 3: 提交**

```bash
git add shared/types.ts
git commit -m "feat(titlebar): extend WindowControlAPI with minimize/maximize/close/platform"
```

---

## Task 3: main + preload 实现 window 控制 IPC

**Files:**
- Modify: `electron/main.ts`（新增 5 个 IPC handler）
- Modify: `electron/preload.ts`（window 域实现新方法）

- [ ] **Step 1: main.ts 新增 platform IPC**

在 `electron/main.ts` 中找到既有 `ipcMain.on('window:focus', ...)`（约 705 行）之后，新增平台查询：

```ts
ipcMain.handle('window:platform', () => process.platform as 'win32' | 'darwin' | 'linux')
```

- [ ] **Step 2: main.ts 新增 minimize/toggleMaximize/close/isMaximized**

在 `window:platform` 之后新增：

```ts
ipcMain.on('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize()
})
ipcMain.on('window:toggleMaximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
ipcMain.on('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close()
})
ipcMain.handle('window:isMaximized', (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
})
```

- [ ] **Step 3: main.ts 新增 maximizeChange 事件桥接**

紧接着新增（给每个请求窗口挂 maximize/unmaximize 监听）：

```ts
// 窗口最大化态变化：为请求窗口挂一次性监听，向其 webContents 转发
const maximizeListeners = new WeakMap<BrowserWindow, () => void>()
ipcMain.on('window:subscribeMaximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  // 已订阅则跳过
  if (maximizeListeners.has(win)) return
  const emit = () => {
    if (!win.isDestroyed()) win.webContents.send('window:maximizeChange', win.isMaximized())
  }
  win.on('maximize', emit)
  win.on('unmaximize', emit)
  maximizeListeners.set(win, emit)
})
```

- [ ] **Step 4: preload.ts 实现 window 域新方法**

在 `electron/preload.ts`，将 `window` 域（约 30-35 行）替换为：

```ts
  window: {
    setFullscreen: (flag) => ipcRenderer.send('window:set-fullscreen', { flag }),
    toggleFullscreen: () => ipcRenderer.send('window:toggle-fullscreen'),
    focus: () => ipcRenderer.send('window:focus'),
    setOscilloscopeTop: (flag) => ipcRenderer.send('window:set-oscilloscope-top', { flag }),
    platform: () => ipcRenderer.invoke('window:platform'),
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => {
      ipcRenderer.send('window:subscribeMaximize')
      const listener = (_e: Electron.IpcRendererEvent, max: boolean) => cb(max)
      ipcRenderer.on('window:maximizeChange', listener)
      return () => ipcRenderer.removeListener('window:maximizeChange', listener)
    }
  },
```

- [ ] **Step 5: 跑 typecheck 确认 main/preload/types 三者一致**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat(titlebar): add window control IPC (minimize/maximize/close/platform)"
```

---

## Task 4: useWindowControls hook

**Files:**
- Create: `src/components/titlebar/useWindowControls.ts`

- [ ] **Step 1: 写实现**

创建 `src/components/titlebar/useWindowControls.ts`：

```ts
import { useEffect, useState } from 'react'
import { getIPC } from '@/shared/ipc'

/**
 * 当前窗口最大化态 hook。
 * 初始 query 一次 isMaximized，随后订阅 onMaximizeChange 跟随。
 * 在非 Electron 环境（web 预览 / 测试无 api）安全降级为 false。
 */
export function useWindowControls(): {
  isMaximized: boolean
  minimize: () => void
  toggleMaximize: () => void
  close: () => void
} {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let api: ReturnType<typeof getIPC> | null = null
    try {
      api = getIPC()
    } catch {
      return // 无 api（web 预览/测试），保持默认 false
    }
    api.window.isMaximized().then(setIsMaximized).catch(() => {})
    const off = api.window.onMaximizeChange((max) => setIsMaximized(max))
    return off
  }, [])

  const run = (fn: (w: ReturnType<typeof getIPC>['window']) => void) => {
    try {
      fn(getIPC().window)
    } catch {
      /* 无 api 时忽略 */
    }
  }

  return {
    isMaximized,
    minimize: () => run((w) => w.minimize()),
    toggleMaximize: () => run((w) => w.toggleMaximize()),
    close: () => run((w) => w.close())
  }
}
```

- [ ] **Step 2: 跑 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add src/components/titlebar/useWindowControls.ts
git commit -m "feat(titlebar): add useWindowControls hook for max/min/close"
```

---

## Task 5: WindowControls 组件（Linux 自绘控件，TDD）

**Files:**
- Create: `src/components/titlebar/WindowControls.tsx`
- Test: `test/titlebar-window-controls.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/titlebar-window-controls.test.ts`：

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { WindowControls } from '@/components/titlebar/WindowControls'

// mock useWindowControls：捕获点击回调
const minimize = vi.fn()
const toggleMaximize = vi.fn()
const close = vi.fn()
vi.mock('@/components/titlebar/useWindowControls', () => ({
  useWindowControls: () => ({ isMaximized: false, minimize, toggleMaximize, close })
}))

describe('WindowControls', () => {
  beforeEach(() => { [minimize, toggleMaximize, close].forEach((m) => m.mockClear()) })

  it('renders three buttons (minimize/maximize/close) with aria-labels', () => {
    const html = renderToStaticMarkup(<WindowControls />)
    expect(html).toContain('aria-label="最小化"')
    expect(html).toContain('aria-label="最大化"')
    expect(html).toContain('aria-label="关闭"')
    // 关闭按钮带 destructive 标记 class
    expect(html).toContain('hover:bg-destructive')
  })

  it('all buttons are no-drag', () => {
    const html = renderToStaticMarkup(<WindowControls />)
    expect(html).toContain('app-region:no-drag')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/titlebar-window-controls.test.ts`
Expected: FAIL — 无法 resolve `@/components/titlebar/WindowControls`

- [ ] **Step 3: 写实现**

创建 `src/components/titlebar/WindowControls.tsx`：

```tsx
import React from 'react'
import { useWindowControls } from './useWindowControls'

/**
 * Linux 自绘窗口控件（最小化/最大化/关闭）。
 * 仅在 Linux 平台渲染（由 TitleBarChrome 按平台决定是否挂载）。
 * 关闭按钮 hover 用 destructive 色，类 macOS 红点的桌面习惯。
 */
export function WindowControls() {
  const { minimize, toggleMaximize, close } = useWindowControls()

  return (
    <div className="flex items-center [app-region:no-drag]">
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        onClick={minimize}
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-muted"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor" /></svg>
      </button>
      <button
        type="button"
        aria-label="最大化"
        title="最大化"
        onClick={toggleMaximize}
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-muted"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="9" height="9" /></svg>
      </button>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        onClick={close}
        className="flex size-8 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-white"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor"><path d="M1 1L9 9M9 1L1 9" /></svg>
      </button>
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/titlebar-window-controls.test.ts`
Expected: PASS（2 passed）

- [ ] **Step 5: 提交**

```bash
git add src/components/titlebar/WindowControls.tsx test/titlebar-window-controls.test.ts
git commit -m "feat(titlebar): add WindowControls for Linux self-drawn window buttons"
```

---

## Task 6: TitleBarChrome 底座组件（TDD）

**Files:**
- Create: `src/components/titlebar/TitleBarChrome.tsx`
- Test: `test/titlebar-chrome.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/titlebar-chrome.test.ts`：

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { TitleBarChrome } from '@/components/titlebar/TitleBarChrome'

// WindowControls 仅 Linux 渲染：mock 为带标记占位，便于断言平台分支
vi.mock('@/components/titlebar/WindowControls', () => ({
  WindowControls: () => <div data-testid="wc">WINDOWCONTROLS</div>
}))

afterEach(() => vi.restoreAllMocks())

describe('TitleBarChrome', () => {
  it('renders brand dot + title with drag region', () => {
    const html = renderToStaticMarkup(<TitleBarChrome title="测试标题" />)
    expect(html).toContain('app-region:drag')
    expect(html).toContain('测试标题')
    // 品牌点存在
    expect(html).toMatch(/size-\[18px\]|w-\[18px\]/)
  })

  it('falls back to document.title when title prop omitted', () => {
    const orig = document.title
    document.title = '文档标题'
    const html = renderToStaticMarkup(<TitleBarChrome />)
    expect(html).toContain('文档标题')
    document.title = orig
  })

  it('renders status and right slots', () => {
    const html = renderToStaticMarkup(
      <TitleBarChrome
        title="T"
        status={<span>STATUS_MARKER</span>}
        right={<span>RIGHT_MARKER</span>}
      />
    )
    expect(html).toContain('STATUS_MARKER')
    expect(html).toContain('RIGHT_MARKER')
  })

  it('applies mac left padding (traffic lights) on mac platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })
    const html = renderToStaticMarkup(<TitleBarChrome title="T" />)
    expect(html).toContain('pl-[78px]')
    // mac 不渲染 WindowControls
    expect(html).not.toContain('WINDOWCONTROLS')
  })

  it('applies windows right padding on win platform', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })
    const html = renderToStaticMarkup(<TitleBarChrome title="T" />)
    expect(html).toContain('pr-[138px]')
    expect(html).not.toContain('WINDOWCONTROLS')
  })

  it('renders WindowControls on linux', () => {
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    const html = renderToStaticMarkup(<TitleBarChrome title="T" />)
    expect(html).toContain('WINDOWCONTROLS')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/titlebar-chrome.test.ts`
Expected: FAIL — 无法 resolve `@/components/titlebar/TitleBarChrome`

- [ ] **Step 3: 写实现**

创建 `src/components/titlebar/TitleBarChrome.tsx`：

```tsx
import React from 'react'
import { detectPlatform } from './platform'
import { WindowControls } from './WindowControls'

export interface TitleBarChromeProps {
  /** 显式标题；缺省回退 document.title */
  title?: string
  /** 状态插槽（主窗：连接徽章） */
  status?: React.ReactNode
  /** 右侧插槽（panel：功能按钮；主窗本期为空） */
  right?: React.ReactNode
}

/**
 * 统一窗口栏底座（参考 zcode）。
 * - 整栏 drag，交互元素 no-drag
 * - 品牌：圆角方块（primary）+ 文字渐变标题
 * - 平台留白：mac 左 78px（红绿灯）；win 右 138px（overlay 按钮）；linux 自绘控件
 * - 视觉：bg-card + 底部 border（风格 B：微高亮 + 品牌渐变标题）
 */
export function TitleBarChrome({ title, status, right }: TitleBarChromeProps) {
  const platform = detectPlatform()
  const label = title ?? document.title

  const padClass =
    platform === 'mac' ? 'pl-[78px] pr-2'
    : platform === 'win' ? 'pl-2 pr-[138px]'
    : 'pl-2 pr-2'

  return (
    <div
      className={`flex h-[38px] items-center gap-2 border-b border-border bg-card ${padClass} [app-region:drag] select-none`}
    >
      {/* 品牌：圆角方块 + 渐变标题 */}
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="flex size-[18px] shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
          S
        </span>
        <span className="truncate bg-gradient-to-r from-foreground to-primary bg-clip-text text-sm font-semibold text-transparent">
          {label}
        </span>
      </div>

      {/* 状态插槽（no-drag） */}
      {status ? (
        <div className="[app-region:no-drag]">
          {status}
        </div>
      ) : null}

      {/* 弹性占位 */}
      <div className="flex-1" />

      {/* right 插槽（no-drag） */}
      {right ? (
        <div className="[app-region:no-drag]">
          {right}
        </div>
      ) : null}

      {/* Linux 自绘窗口控件 */}
      {platform === 'linux' ? <WindowControls /> : null}
    </div>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/titlebar-chrome.test.ts`
Expected: PASS（6 passed）

- [ ] **Step 5: 提交**

```bash
git add src/components/titlebar/TitleBarChrome.tsx test/titlebar-chrome.test.ts
git commit -m "feat(titlebar): add TitleBarChrome base with brand, drag region, platform padding"
```

---

## Task 7: ConnectionBadge 组件（TDD）

**Files:**
- Create: `src/components/titlebar/ConnectionBadge.tsx`
- Test: `test/titlebar-connection-badge.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/titlebar-connection-badge.test.ts`：

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, beforeEach } from 'vitest'
import { usePanelsStore } from '@/features/serial-panel/store'
import { ConnectionBadge } from '@/components/titlebar/ConnectionBadge'

function seedStore(panels: Record<string, any>, activeId: string | null) {
  const s = usePanelsStore.getState()
  usePanelsStore.setState({
    ...s,
    panels,
    activeId
  })
}

describe('ConnectionBadge', () => {
  beforeEach(() => {
    seedStore({}, null)
  })

  it('renders nothing when no active panel', () => {
    const html = renderToStaticMarkup(<ConnectionBadge />)
    // 空活动面板时组件返回 null（无徽章文本）
    expect(html).not.toContain('已连接')
    expect(html).not.toContain('未连接')
  })

  it('renders disconnected when active panel open=false', () => {
    seedStore({ 'COM3': { id: 'COM3', name: 'COM3', type: 'serial', open: false } as any }, 'COM3')
    const html = renderToStaticMarkup(<ConnectionBadge />)
    expect(html).toContain('未连接')
  })

  it('renders connected with port id for serial', () => {
    seedStore({ 'COM3': { id: 'COM3', name: 'COM3', type: 'serial', open: true } as any }, 'COM3')
    const html = renderToStaticMarkup(<ConnectionBadge />)
    expect(html).toContain('COM3 已连接')
  })

  it('renders connected with host:port for tcp', () => {
    seedStore({ 'tcp://127.0.0.1:502': { id: 'tcp://127.0.0.1:502', name: 'tcp', type: 'tcp', open: true } as any }, 'tcp://127.0.0.1:502')
    const html = renderToStaticMarkup(<ConnectionBadge />)
    expect(html).toContain('tcp://127.0.0.1:502 已连接')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/titlebar-connection-badge.test.ts`
Expected: FAIL — 无法 resolve `@/components/titlebar/ConnectionBadge`

- [ ] **Step 3: 写实现**

创建 `src/components/titlebar/ConnectionBadge.tsx`：

```tsx
import React from 'react'
import { usePanelsStore } from '@/features/serial-panel/store'

/**
 * 主窗串口/TCP 连接状态徽章。
 * 读 usePanelsStore.activeId → panels[activeId]：
 * - 无活动面板：不渲染
 * - open=false：灰点 + "未连接"
 * - open=true：绿点 + "{id} 已连接"（serial 用端口路径，tcp 用 tcp://host:port）
 */
export function ConnectionBadge() {
  const activeId = usePanelsStore((s) => s.activeId)
  const panel = usePanelsStore((s) => (activeId ? s.panels[activeId] : undefined))

  if (!activeId || !panel) return null

  const connected = panel.open
  const dotColor = connected ? 'bg-[#16a34a] dark:bg-[#4ade80]' : 'bg-muted-foreground'
  const label = connected ? `${panel.id} 已连接` : '未连接'

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  )
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/titlebar-connection-badge.test.ts`
Expected: PASS（4 passed）

> 注意：若 SSR 下 zustand 订阅读不到 setState 后的状态（见 active-panel-config.test.ts 注释），测试可能失败。此时改用 store 级断言或 `usePanelsStore.getState()` 直接读取。若遇到，参考 `test/active-panel-config.test.ts` 顶部的处理说明。

- [ ] **Step 5: 提交**

```bash
git add src/components/titlebar/ConnectionBadge.tsx test/titlebar-connection-badge.test.ts
git commit -m "feat(titlebar): add ConnectionBadge reading active panel state"
```

---

## Task 8: 桶导出 + 主窗挂载 TitleBarChrome

**Files:**
- Create: `src/components/titlebar/index.ts`
- Modify: `src/mainwindow.tsx`

- [ ] **Step 1: 创建桶导出**

创建 `src/components/titlebar/index.ts`：

```ts
export { TitleBarChrome } from './TitleBarChrome'
export type { TitleBarChromeProps } from './TitleBarChrome'
export { ConnectionBadge } from './ConnectionBadge'
export { WindowControls } from './WindowControls'
export { useWindowControls } from './useWindowControls'
export { detectPlatform, isMac } from './platform'
export type { Platform } from './platform'
```

- [ ] **Step 2: 主窗顶部挂载窗口栏**

修改 `src/mainwindow.tsx`，在 `SidebarProvider` **外层**（最顶部）加 `TitleBarChrome`，使栏横跨整个窗口顶部。完整替换文件：

```tsx
import { useEffect } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TitleBarChrome, ConnectionBadge } from '@/components/titlebar'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { BottomNav } from './components/BottomNav'
import { installActiveBridge } from '@/features/serial-panel/activeBridge'
import './main-window.css'

/**
 * React 主窗口（双轨并行可视）。
 * 顶部 TitleBarChrome 横跨全窗（品牌/标题 + 连接徽章 + 原生窗口按钮），
 * 下方 SidebarProvider 包裹 Sidebar + SidebarInset（上下分栏工作区/内容面板）。
 */
export default function MainWindow() {
  useEffect(() => installActiveBridge(), [])
  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <TitleBarChrome status={<ConnectionBadge />} />
        <SidebarProvider style={{ minHeight: 0 }} className="flex-1 min-h-0">
          <Sidebar />
          <SidebarInset className="min-w-0 flex-1 overflow-hidden">
            <PanelGroup orientation="vertical" className="h-full">
              <Panel defaultSize={62} minSize={20}>
                <Workspace />
              </Panel>
              <PanelResizeHandle className="h-1.5 w-full cursor-row-resize bg-border transition-colors hover:bg-primary/40" />
              <Panel defaultSize={38} minSize={12}>
                <BottomNav />
              </Panel>
            </PanelGroup>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  )
}
```

> 说明：原 `minHeight:'100vh'` 改为外层 `h-screen flex-col` + 内层 `flex-1 min-h-0`，让窗口栏占固定 38px、下方区域填充剩余高度，避免溢出。

- [ ] **Step 3: 跑 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/components/titlebar/index.ts src/mainwindow.tsx
git commit -m "feat(titlebar): mount TitleBarChrome + ConnectionBadge on main window"
```

---

## Task 9: panel 弹出窗改用 TitleBarChrome（保留功能按钮）

**Files:**
- Modify: `src/panel.tsx`（替换 186-212 行的内联标题栏）

> ⚠️ panel.tsx 已有 5 个承载功能的按钮（置顶/视图模式/开关串口/嵌回主窗/隐藏），必须保留。把它们迁入 TitleBarChrome 的 `right` 插槽。

- [ ] **Step 1: 修改 panel.tsx import**

在 `src/panel.tsx` 顶部 import 区（已有 button/input 等 import 之后）新增：

```ts
import { TitleBarChrome } from '@/components/titlebar'
```

- [ ] **Step 2: 替换内联标题栏为 TitleBarChrome**

找到 `src/panel.tsx` 约 184-212 行的 `return (` 之后的标题栏 `<div className="flex h-9 ...">`，将其整体替换为：

```tsx
    <div className="flex h-screen flex-col bg-card text-foreground">
      {/* 标题栏：复用 TitleBarChrome，面板功能按钮迁入 right 插槽 */}
      <TitleBarChrome
        title={q.title}
        right={
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={handleTogglePin} title={pinned ? '取消置顶' : '置顶'}>
              {pinned ? <PushPinSlash className="size-4" weight="fill" /> : <PushPin className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => setViewMode(viewMode === 'text' ? 'hex' : 'text')} title="文本/HEX">
              {viewMode === 'hex' ? <Code className="size-4" /> : <TextAa className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`size-7 ${open ? 'text-success' : 'text-muted-foreground'}`}
              onClick={handleToggleOpen}
              title={open ? '关闭' : '打开'}
            >
              <Power className="size-4" weight={open ? 'fill' : 'regular'} />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleDock} title="嵌回主窗口">
              <ArrowsInCardinal className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={handleHide} title="隐藏">
              ✕
            </Button>
          </div>
        }
      />
```

删除原内联的 `select-none [app-region:drag]` 标题栏 div（含 `<span className="flex-1 ...">{q.title}</span>` 及其下按钮容器）。注意：`q.title` 现在通过 `title` prop 传给 TitleBarChrome，由底座渲染标题。

- [ ] **Step 3: 跑 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/panel.tsx
git commit -m "feat(titlebar): adopt TitleBarChrome on panel popout, preserve panel action buttons"
```

---

## Task 10: electron 窗口 frame 配置（panel 改 hidden）

**Files:**
- Modify: `electron/main.ts`（panel:popout 的 BrowserWindow 配置）

> 主窗 React 预览窗（`dev:open-react-mainwindow`）在 Task 11 改。legacy 主窗、about/changelog 本期不动（见 spec 第 7 节）。

- [ ] **Step 1: panel:popout 改用 titleBarStyle**

在 `electron/main.ts` 找到 `panel:popout` handler（约 817 行起），定位其 `new BrowserWindow({...})`（约 829 行）。当前是 `frame: false`。将其改为按平台配置：

```ts
  const win = new BrowserWindow({
    width: 600,
    height: 420,
    minWidth: 550,
    minHeight: 300,
    alwaysOnTop: alwaysOnTop !== false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: '#f5f7fa', symbolColor: '#1f2937', height: 38 }
      : undefined,
    frame: process.platform === 'linux' ? false : undefined,
    resizable: true,
    webPreferences: { preload: PRELOAD_PATH, contextIsolation: true }
  })
```

> 说明：Win 用 hidden + overlay（拿回原生最小化/关闭按钮，之前 frame:false 全丢了）；Mac 用 hiddenInset（红绿灯）；Linux 仍 frame:false（靠 WindowControls 自绘）。

- [ ] **Step 2: 跑 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add electron/main.ts
git commit -m "feat(titlebar): use hidden titlebar on panel popout for native controls"
```

---

## Task 11: React 预览主窗 frame 配置

**Files:**
- Modify: `electron/main.ts`（`dev:open-react-mainwindow` 的 BrowserWindow 配置）

- [ ] **Step 1: 预览主窗改用 titleBarStyle**

在 `electron/main.ts` 找到 `ipcMain.on('dev:open-react-mainwindow', ...)`（约 783 行），其 `new BrowserWindow({...})`（约 791 行）。当前无 frame 配置（默认带标题栏）。改为：

```ts
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    title: '串口助手 (React 预览)',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: '#f5f7fa', symbolColor: '#1f2937', height: 38 }
      : undefined,
    frame: process.platform === 'linux' ? false : undefined,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true
    }
  })
```

- [ ] **Step 2: 跑 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add electron/main.ts
git commit -m "feat(titlebar): apply hidden titlebar to React preview main window"
```

---

## Task 12: 全量验证

**Files:** 无（仅验证）

- [ ] **Step 1: 跑全部 titlebar 测试**

Run: `npx vitest run test/titlebar-platform.test.ts test/titlebar-chrome.test.ts test/titlebar-connection-badge.test.ts test/titlebar-window-controls.test.ts`
Expected: 全部 PASS

- [ ] **Step 2: 跑全量测试确保无回归**

Run: `npm test`
Expected: 全部 PASS（关注 serial-panel / panel 相关测试是否因 panel.tsx 改动受影响）

- [ ] **Step 3: 跑 typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: 成功（renderer bundle 含 titlebar 组件）

- [ ] **Step 5: 手动验证清单（写入 PR 说明）**

启动 `npm run dev`，通过 legacy 主窗侧栏「🧪 React 预览」打开 React 主窗，逐项验证：
- [ ] 主窗顶部出现窗口栏（品牌 S 点 + 渐变标题 + 连接徽章）
- [ ] 连接徽章：无面板时不显示；打开串口后显示「COMx 已连接」绿点；断开显示「未连接」
- [ ] 拖拽窗口栏空白处可移动窗口
- [ ] 双击窗口栏空白处最大化/还原
- [ ] Win：右上角原生最小化/最大化/关闭按钮可用
- [ ] Mac：左上角红绿灯不与标题重叠
- [ ] Linux：自绘三按钮可点，关闭 hover 变红
- [ ] 亮/暗主题切换，窗口栏样式跟随
- [ ] 弹出面板（panel popout）：窗口栏含面板 5 个功能按钮（置顶/视图/开关/嵌回/隐藏），功能正常
- [ ] 面板隐藏按钮（✕）仍能通知主窗（panel:request-hide 流程未坏）

- [ ] **Step 6: 最终提交（如有遗留改动）**

```bash
git add -A
git commit -m "test(titlebar): full verification pass"
```

---

## 自检记录

**Spec 覆盖**：spec 各节 → 任务映射：
- 4.1 TitleBarChrome → Task 6 ✓
- 4.2 ConnectionBadge → Task 7 ✓
- 4.3 right 插槽预留 → Task 6（插槽存在，Task 8 主窗不传）/ Task 9（panel 传入按钮）✓
- 4.4 平台适配 → Task 6（padClass 分支）+ Task 1（平台检测）✓
- 4.5 WindowControls → Task 5 ✓
- 4.6 electron 配置 → Task 10（panel）+ Task 11（预览主窗）✓（legacy/关于/日志按 spec 第 7 节本期不动）
- 4.7 preload + IPC → Task 2（类型）+ Task 3（实现）✓
- 4.8 useWindowControls → Task 4 ✓
- 测试计划 → Task 1/5/6/7 单测 + Task 12 全量 + 手动 ✓

**占位符扫描**：无 TBD/TODO；所有代码块完整。

**类型一致性**：`WindowControlAPI` 方法名（minimize/toggleMaximize/close/isMaximized/onMaximizeChange/platform）在 types.ts、preload.ts、useWindowControls.ts、Task 间一致。`detectPlatform/isMac/Platform` 导出名一致。`TitleBarChromeProps`（title/status/right）一致。

**发现并纳入**：panel.tsx 已有功能按钮（spec 未提），Task 9 明确保留，避免功能回归。
