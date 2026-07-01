# React 面板串口工作区集成 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 React `MainWindow` 预览窗里把已建好的 `SerialPanelWorkspace` 与外壳/命令页/脚本页打通，使预览窗内功能对齐 legacy（不切换主窗口入口、不翻转 flag）。

**Architecture:** 新增 `activeBridge` 桥接层做 `panels.activeId ↔ appShell.activePanelId` 双向同步；命令发送逻辑抽成纯函数 `sendCommand.ts`（`routeWrite` + 重复发送 interval 管理），便于单测；`BottomNav` 补 serial tab（`PanelOverviewPanel`）与 script tab（`ScriptEditorDialog` 受控）。

**Tech Stack:** TypeScript/TSX、React 19、zustand（`subscribe` API）、Vitest（node 环境，`globals:false`，需显式 import `describe/it/expect`）、shadcn/ui、Phosphor Icons、路径别名 `@/`→`src/`、`@shared/`→`shared/`。

**Spec:** `docs/superpowers/specs/2026-06-25-serial-workspace-react-integration-design.md`

**约定（AGENTS.md/CLAUDE.md）：**
- 新代码 2 空格缩进、不加分号（与既有 `src/features/**` 一致）。
- 组件 PascalCase，hook/util camelCase，测试 `*.test.ts`。
- 提交用 Conventional Commits + scope，如 `feat(phase2a): ...`。
- 提交前必跑 `npm test` 与 `npm run typecheck`。
- 不新增任何 IPC channel；不改 `electron/main.ts` 入口、不翻转 `useReactPanels`、不动 legacy `renderer.js`。

---

## 文件结构

| 文件 | 责任 | 操作 |
|------|------|------|
| `src/features/serial-panel/types.ts` | 加 `SerialPanelSummary` 类型 | 改 |
| `src/features/serial-panel/activeBridge.ts` | 双向同步 activeId + 暴露 `window.getSerialPanelSummaries`；纯订阅逻辑，无 UI | 新增 |
| `test/active-bridge.test.ts` | 桥接同步单测 | 新增 |
| `src/features/main-window/MainWindow.tsx` | 挂载/卸载 `installActiveBridge` | 改 |
| `src/features/commands/sendCommand.ts` | `routeWrite`（按 type 路由 serial/tcp）+ 重复发送 interval 管理；纯函数 | 新增 |
| `test/commands-send.test.ts` | `routeWrite` + 重复发送单测 | 新增 |
| `src/features/commands/CommandsPage.tsx` | 用 `routeWrite` + `repeaters` 替换 TODO；接 `appShell.activePanelId` | 改 |
| `src/features/commands/components/CommandGrid.tsx` | 翻页（cols/rows/cmdPage）+ 重复发送态视觉 | 改 |
| `src/features/main-window/components/PanelOverviewPanel.tsx` | 串口 tab 概览（只读+聚焦） | 新增 |
| `src/features/main-window/components/BottomNav.tsx` | serial→`PanelOverviewPanel`，script→`ScriptEditorDialog` | 改 |
| `src/mainwindow.tsx` | 引入 `script-editor.css`（独立入口） | 改 |

---

## Task 1: 加 `SerialPanelSummary` 类型

**Files:**
- Modify: `src/features/serial-panel/types.ts`（在文件末尾追加）

- [ ] **Step 1: 追加类型定义**

在 `src/features/serial-panel/types.ts` 末尾（`PanelConfig` interface 之后）追加：

```ts
/**
 * 供脚本编辑器跨轨读取的面板概要。
 * 字段对齐 legacy renderer.js 的 getSerialPanelSummaries（window.getSerialPanelSummaries）。
 */
export interface SerialPanelSummary {
  id: string
  name: string
  type: PanelType
  open: boolean
  active: boolean
  hidden: boolean
  options?: SerialOptions
}
```

- [ ] **Step 2: typecheck 通过**

Run: `npm run typecheck`
Expected: 无错误退出（exit 0）。

- [ ] **Step 3: Commit**

```bash
git add src/features/serial-panel/types.ts
git commit -m "feat(phase2a): add SerialPanelSummary type for cross-track read"
```

---

## Task 2: `activeBridge` 双向同步（TDD）

**Files:**
- Create: `src/features/serial-panel/activeBridge.ts`
- Test: `test/active-bridge.test.ts`

桥接逻辑：两个 zustand store 各 `subscribe`，仅当两边值不同时写对方。`installActiveBridge()` 返回 cleanup（取消两个订阅 + 删除 window 全局）。

- [ ] **Step 1: 写失败测试**

创建 `test/active-bridge.test.ts`：

```ts
/**
 * activeBridge 双向同步单测。
 * 桥接 panels.activeId ↔ appShell.activePanelId：值变化才写对方，防循环；卸载后不再同步。
 * 暴露 window.getSerialPanelSummaries 供脚本编辑器跨轨读取。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePanelsStore } from '../src/features/serial-panel/store'
import { useAppShell } from '../src/shared/store/appShell'
import { installActiveBridge, getSerialPanelSummaries } from '../src/features/serial-panel/activeBridge'

function resetStores() {
  // 重置两个 store 到初始态，隔离用例
  usePanelsStore.setState({ panels: {}, listOrder: [], activeId: null, zCounter: 0, loaded: true })
  useAppShell.setState({ activeTab: 'serial', activePanelId: null, newPanelDialogOpen: false })
}

describe('activeBridge', () => {
  let cleanup: () => void
  beforeEach(() => {
    resetStores()
    cleanup = installActiveBridge()
  })
  afterEach(() => {
    cleanup()
    resetStores()
  })

  it('panels.activeId → appShell.activePanelId', () => {
    usePanelsStore.getState().setActive('COM1')
    expect(useAppShell.getState().activePanelId).toBe('COM1')
  })

  it('appShell.activePanelId → panels.activeId', () => {
    // 注意：panels.setActive 在面板不存在时只设 activeId，不写 panels，桥接应仍把 id 同步过去
    useAppShell.getState().setActivePanelId('COM2')
    expect(usePanelsStore.getState().activeId).toBe('COM2')
  })

  it('值相同时不写（无循环）', () => {
    usePanelsStore.getState().setActive('COM3')
    expect(useAppShell.getState().activePanelId).toBe('COM3')
    // 再次用同值触发 appShell 订阅：panels.activeId 应仍为 COM3，不抖动
    useAppShell.getState().setActivePanelId('COM3')
    expect(usePanelsStore.getState().activeId).toBe('COM3')
  })

  it('null 同步：setActive(null) → appShell null', () => {
    usePanelsStore.getState().setActive('COM4')
    usePanelsStore.getState().setActive(null)
    expect(useAppShell.getState().activePanelId).toBeNull()
  })

  it('卸载后不再同步', () => {
    cleanup()
    usePanelsStore.getState().setActive('COM5')
    expect(useAppShell.getState().activePanelId).toBeNull()
  })

  it('getSerialPanelSummaries 暴露到 window 且字段对齐', () => {
    const store = usePanelsStore.getState()
    store.addPanel({ id: 'COM6', name: 'COM6', type: 'serial' })
    store.setActive('COM6')
    const summaries = getSerialPanelSummaries()
    const target = summaries.find((s) => s.id === 'COM6')
    expect(target).toBeDefined()
    expect(target).toMatchObject({
      id: 'COM6',
      name: 'COM6',
      type: 'serial',
      open: false,
      active: true,
      hidden: false
    })
    expect(target!.options).toBeDefined()
    expect(typeof window.getSerialPanelSummaries).toBe('function')
  })
})
```

注意：`usePanelsStore.setState({ ..., loaded: true })` 是为避免 `addPanel` 之外没有 `load()`；`addPanel` 已存在且不依赖 `loaded`，可直接用。`setActive('COM2')` 在 panels 无该 id 时，`store.setActive` 内部 `if (!id || !s.panels[id]) return { activeId: id }` —— 仍会设 `activeId`，符合测试预期。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/active-bridge.test.ts`
Expected: FAIL —— `Cannot find module '../src/features/serial-panel/activeBridge'`。

- [ ] **Step 3: 实现 `activeBridge.ts`**

创建 `src/features/serial-panel/activeBridge.ts`：

```ts
import { usePanelsStore } from './store'
import { useAppShell } from '@/shared/store/appShell'
import type { SerialPanelSummary } from './types'

/**
 * 双向同步 panels.activeId ↔ appShell.activePanelId。
 * - 各 store subscribe 只在两边值不同时写「对方」，绝不写自己监听的源 → 天然单向、无循环。
 * - installActiveBridge() 在 MainWindow 挂载时调用一次，返回 cleanup。
 * - 同时把 getSerialPanelSummaries 挂到 window（供脚本编辑器跨轨读取，替代 legacy 同名全局）。
 */
export function installActiveBridge(): () => void {
  const applySafe = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      console.error('[activeBridge] sync error:', e)
    }
  }

  // panels.activeId → appShell.activePanelId
  const unsubPanels = usePanelsStore.subscribe((s) => s.activeId, (activeId) => {
    applySafe(() => {
      if (activeId !== useAppShell.getState().activePanelId) {
        useAppShell.getState().setActivePanelId(activeId)
      }
    })
  })

  // appShell.activePanelId → panels.activeId
  const unsubAppShell = useAppShell.subscribe((s) => s.activePanelId, (activePanelId) => {
    applySafe(() => {
      if (activePanelId !== usePanelsStore.getState().activeId) {
        usePanelsStore.getState().setActive(activePanelId)
      }
    })
  })

  // 暴露跨轨读取（预览窗自己的 window 上下文，不污染 legacy 主窗）
  ;(window as unknown as { getSerialPanelSummaries?: typeof getSerialPanelSummaries }).getSerialPanelSummaries = getSerialPanelSummaries

  return () => {
    unsubPanels()
    unsubAppShell()
    delete (window as unknown as { getSerialPanelSummaries?: typeof getSerialPanelSummaries }).getSerialPanelSummaries
  }
}

/**
 * 从 panels store 派生面板概要数组。字段对齐 legacy getSerialPanelSummaries。
 */
export function getSerialPanelSummaries(): SerialPanelSummary[] {
  const { panels, listOrder, activeId } = usePanelsStore.getState()
  return listOrder.map((id) => {
    const p = panels[id]
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      open: p.open,
      active: activeId === id,
      hidden: p.hidden,
      options: p.type === 'serial' ? p.options : undefined
    }
  })
}
```

注意：zustand v5 的 `subscribe(selector, listener)` 二参形式（`subscribeWithSelector` 增强）需要确认是否默认可用。本项目 `store.ts` 用的是 `create`（未包 `subscribeWithSelector` 中间件）。zustand v5 的 `subscribe` 默认只支持 `(listener)` 全订阅；selector 形式需 `subscribeWithSelector`。**因此改用全订阅 + 内部比较**——见 Step 3b 修正。

- [ ] **Step 3b: 修正为全订阅（zustand v5 默认 API）**

把 `activeBridge.ts` 中两个 subscribe 改为全订阅 + 内部缓存上一值比较：

```ts
export function installActiveBridge(): () => void {
  const applySafe = (fn: () => void) => {
    try {
      fn()
    } catch (e) {
      console.error('[activeBridge] sync error:', e)
    }
  }

  let lastPanelsActive = usePanelsStore.getState().activeId
  const unsubPanels = usePanelsStore.subscribe((s) => {
    if (s.activeId === lastPanelsActive) return
    lastPanelsActive = s.activeId
    applySafe(() => {
      if (s.activeId !== useAppShell.getState().activePanelId) {
        useAppShell.getState().setActivePanelId(s.activeId)
      }
    })
  })

  let lastAppShellActive = useAppShell.getState().activePanelId
  const unsubAppShell = useAppShell.subscribe((s) => {
    if (s.activePanelId === lastAppShellActive) return
    lastAppShellActive = s.activePanelId
    applySafe(() => {
      if (s.activePanelId !== usePanelsStore.getState().activeId) {
        usePanelsStore.getState().setActive(s.activePanelId)
      }
    })
  })

  ;(window as unknown as { getSerialPanelSummaries?: typeof getSerialPanelSummaries }).getSerialPanelSummaries = getSerialPanelSummaries

  return () => {
    unsubPanels()
    unsubAppShell()
    delete (window as unknown as { getSerialPanelSummaries?: typeof getSerialPanelSummaries }).getSerialPanelSummaries
  }
}
```

（`getSerialPanelSummaries` 函数体不变。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/active-bridge.test.ts`
Expected: PASS（全部 6 个用例）。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add src/features/serial-panel/activeBridge.ts test/active-bridge.test.ts
git commit -m "feat(phase2a): add activeBridge for panels.activeId <-> appShell.activePanelId sync"
```

---

## Task 3: 在 `MainWindow` 挂载桥接

**Files:**
- Modify: `src/features/main-window/MainWindow.tsx`

- [ ] **Step 1: 改造 `MainWindow` 加 useEffect 挂载桥接**

把 `src/features/main-window/MainWindow.tsx` 改为（加 `useEffect` import 与调用）：

```tsx
import { useEffect } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { BottomNav } from './components/BottomNav'
import { installActiveBridge } from '@/features/serial-panel/activeBridge'
import './main-window.css'

/**
 * React 主窗口（双轨并行可视）。
 * 基于 shadcn Sidebar 体系：SidebarProvider 包裹 Sidebar + SidebarInset。
 * SidebarInset 内用 react-resizable-panels 做上下分栏：工作区（上）与内容面板（下），
 * 中间 Separator 可鼠标上下拖拽调整两区高度。
 *
 * TooltipProvider 必须在根：SidebarMenuButton 的 tooltip、以及后续 Tooltip 用法都依赖它。
 * activeBridge：双向同步 panels.activeId ↔ appShell.activePanelId，并把
 * getSerialPanelSummaries 挂到 window 供脚本编辑器跨轨读取。
 */
export default function MainWindow() {
  useEffect(() => installActiveBridge(), [])
  return (
    <TooltipProvider>
      <SidebarProvider style={{ minHeight: '100vh' }}>
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
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git add src/features/main-window/MainWindow.tsx
git commit -m "feat(phase2a): mount activeBridge in MainWindow"
```

---

## Task 4: 命令发送纯函数 `sendCommand.ts`（TDD）

**Files:**
- Create: `src/features/commands/sendCommand.ts`
- Test: `test/commands-send.test.ts`

`routeWrite`：按 panel.type 选 `serial.write`/`tcp.write`，返回归一化 `{ ok, error? }`。
重复发送：`RepeatManager` 类管 `Map<cmdId, timer>`，`toggle` 建立/清除 interval，`clearAll` 清空。

- [ ] **Step 1: 写失败测试**

创建 `test/commands-send.test.ts`：

```ts
/**
 * 命令发送纯逻辑单测：routeWrite（serial/tcp 路由 + 未开降级）+ RepeatManager（interval 建/清）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Panel } from '../src/features/serial-panel/types'
import type { WindowAPI } from '../shared/types'
import { routeWrite, RepeatManager } from '../src/features/commands/sendCommand'

function makePanel(over: Partial<Panel> = {}): Panel {
  return {
    id: 'COM1',
    name: 'COM1',
    type: 'serial',
    options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' },
    open: true,
    viewMode: 'text',
    pinned: false,
    hidden: false,
    geometry: { x: 0, y: 0, w: 100, h: 100 },
    chunks: [],
    textBuffer: '',
    hexBuffer: '',
    autoScroll: true,
    sendText: '',
    logging: { active: false, path: null },
    z: 10,
    ...over
  }
}

function makeIpc(over: Partial<Pick<WindowAPI, 'serial' | 'tcp'>> = {}): Pick<WindowAPI, 'serial' | 'tcp'> {
  return {
    serial: {
      list: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      write: vi.fn().mockResolvedValue({ ok: true, bytes: 1 }),
      onData: vi.fn(),
      onEvent: vi.fn()
    } as unknown as WindowAPI['serial'],
    tcp: {
      open: vi.fn(),
      write: vi.fn().mockResolvedValue({ ok: true, bytes: 1 }),
      close: vi.fn(),
      onData: vi.fn(),
      onEvent: vi.fn()
    } as unknown as WindowAPI['tcp'],
    ...over
  }
}

describe('routeWrite', () => {
  it('serial 面板 → 调 serial.write', async () => {
    const ipc = makeIpc()
    const res = await routeWrite(makePanel({ type: 'serial' }), ipc, 'A1', 'hex', 'none', 'utf-8')
    expect(ipc.serial.write).toHaveBeenCalledWith('COM1', 'A1', 'hex', 'none', 'utf-8')
    expect(ipc.tcp.write).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('tcp 面板 → 调 tcp.write', async () => {
    const ipc = makeIpc()
    const res = await routeWrite(makePanel({ id: 'tcp://1.2.3.4:9', type: 'tcp' }), ipc, 'hi', 'text', 'CRLF', 'utf-8')
    expect(ipc.tcp.write).toHaveBeenCalledWith('tcp://1.2.3.4:9', 'hi', 'text', 'CRLF', 'utf-8')
    expect(ipc.serial.write).not.toHaveBeenCalled()
    expect(res.ok).toBe(true)
  })

  it('面板未打开 → { ok:false } 不调 write', async () => {
    const ipc = makeIpc()
    const res = await routeWrite(makePanel({ open: false }), ipc, 'A1', 'hex', 'none', 'utf-8')
    expect(ipc.serial.write).not.toHaveBeenCalled()
    expect(res.ok).toBe(false)
    expect(res.error).toBe('面板未打开')
  })

  it('write 抛异常 → 捕获返回 { ok:false }', async () => {
    const ipc = makeIpc({
      serial: {
        list: vi.fn(), open: vi.fn(), close: vi.fn(),
        write: vi.fn().mockRejectedValue(new Error('boom')),
        onData: vi.fn(), onEvent: vi.fn()
      } as unknown as WindowAPI['serial']
    })
    const res = await routeWrite(makePanel(), ipc, 'A1', 'hex', 'none', 'utf-8')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('boom')
  })
})

describe('RepeatManager', () => {
  afterEach(() => vi.useRealTimers())

  it('toggle 开启 → 周期执行 doSend；再次 toggle → 停止', () => {
    vi.useFakeTimers()
    const mgr = new RepeatManager()
    const doSend = vi.fn().mockResolvedValue(undefined)
    mgr.toggle('cmd-1', 1000, doSend)
    // 立即触发一次（开启即发，对齐 legacy sendCommand 重复分支也先发一次后再周期）
    expect(doSend).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(doSend).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(doSend).toHaveBeenCalledTimes(3)
    mgr.toggle('cmd-1', 1000, doSend) // 再点 → 停止
    vi.advanceTimersByTime(5000)
    expect(doSend).toHaveBeenCalledTimes(3)
  })

  it('isActive 反映状态', () => {
    vi.useFakeTimers()
    const mgr = new RepeatManager()
    expect(mgr.isActive('cmd-1')).toBe(false)
    mgr.toggle('cmd-1', 1000, vi.fn())
    expect(mgr.isActive('cmd-1')).toBe(true)
    mgr.toggle('cmd-1', 1000, vi.fn())
    expect(mgr.isActive('cmd-1')).toBe(false)
  })

  it('clearAll 清空所有', () => {
    vi.useFakeTimers()
    const mgr = new RepeatManager()
    const a = vi.fn().mockResolvedValue(undefined)
    const b = vi.fn().mockResolvedValue(undefined)
    mgr.toggle('a', 1000, a)
    mgr.toggle('b', 1000, b)
    mgr.clearAll()
    vi.advanceTimersByTime(5000)
    expect(a).toHaveBeenCalledTimes(1) // 仅开启时的首发
    expect(b).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/commands-send.test.ts`
Expected: FAIL —— `Cannot find module '../src/features/commands/sendCommand'`。

- [ ] **Step 3: 实现 `sendCommand.ts`**

创建 `src/features/commands/sendCommand.ts`：

```ts
import type { Panel } from '@/features/serial-panel/types'
import type { AppendMode, WriteMode, WindowAPI } from '@shared/types'

export interface SendResult {
  ok: boolean
  error?: string
}

/**
 * 按面板类型路由写入：serial → ipc.serial.write，tcp → ipc.tcp.write。
 * 面板未打开 → 直接返回 { ok:false }，不调 write。
 * write 抛异常 → 捕获归一化为 { ok:false, error }。
 * 镜像 legacy sendCommand 的 doWrite 路由（renderer.js:3560-3563）。
 */
export async function routeWrite(
  panel: Panel,
  ipc: Pick<WindowAPI, 'serial' | 'tcp'>,
  data: string,
  mode: WriteMode,
  append: AppendMode,
  encoding: string
): Promise<SendResult> {
  if (!panel.open) return { ok: false, error: '面板未打开' }
  try {
    const res =
      panel.type === 'tcp'
        ? await ipc.tcp.write(panel.id, data, mode, append, encoding)
        : await ipc.serial.write(panel.id, data, mode, append, encoding)
    if (res && res.ok === false) return { ok: false, error: res.error || '发送失败' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) }
  }
}

/**
 * 重复发送管理：per-cmdId interval（镜像 legacy cmdIntervalMap）。
 * - toggle：未在跑 → 建立 interval（先立即发一次，再每 ms 周期）；已在跑 → 清除。
 * - clearAll：清空全部（cmdRepeat 关闭/卸载时调用）。
 */
export class RepeatManager {
  private timers = new Map<string, ReturnType<typeof setInterval>>()

  toggle(cmdId: string, ms: number, doSend: () => Promise<void>): void {
    const existing = this.timers.get(cmdId)
    if (existing) {
      clearInterval(existing)
      this.timers.delete(cmdId)
      return
    }
    // 立即发一次（对齐 legacy：重复开启时先发首帧）
    void doSend()
    const timer = setInterval(() => void doSend(), Math.max(1, ms))
    this.timers.set(cmdId, timer)
  }

  isActive(cmdId: string): boolean {
    return this.timers.has(cmdId)
  }

  clearAll(): void {
    for (const t of this.timers.values()) clearInterval(t)
    this.timers.clear()
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/commands-send.test.ts`
Expected: PASS（routeWrite 4 例 + RepeatManager 3 例）。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 6: Commit**

```bash
git add src/features/commands/sendCommand.ts test/commands-send.test.ts
git commit -m "feat(phase2a): add routeWrite + RepeatManager for command sending"
```

---

## Task 5: `CommandsPage` 接桥（替换 TODO）

**Files:**
- Modify: `src/features/commands/CommandsPage.tsx`

把 `handleSend` 的 TODO 替换为：读 `appShell.activePanelId` + `panels.panels[id]`，用 `routeWrite` 路由，echo 回显，并加重复发送（`cmdRepeat` toggle + `cmdRepeatMs` + `RepeatManager`）。卸载清空 interval。

- [ ] **Step 1: 重写 `CommandsPage.tsx`**

把整个 `src/features/commands/CommandsPage.tsx` 替换为：

```tsx
import { useEffect, useRef, useState } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import { CommandGrid } from './components/CommandGrid'
import { CommandEditor } from './components/CommandEditor'
import { useCommandsStore, type Command } from './store'
import { useAppShell } from '@/shared/store/appShell'
import { usePanelsStore } from '@/features/serial-panel/store'
import { useSettingsStore } from '@/shared/store/settings'
import { useIPC } from '@/shared/ipc'
import { routeWrite, RepeatManager } from './sendCommand'
import { nowTs } from '@/features/serial-panel/paneViewModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * 命令页容器。镜像 legacy #page-commands + sendCommand（renderer.js:3551）。
 * - 读 appShell.activePanelId + panels.panels[id] 拿 type/open。
 * - routeWrite 按 type 路由 serial/tcp.write，编码跟随设置，echo 回显。
 * - 重复发送：repeat toggle + repeatMs，RepeatManager 管 per-cmd interval。
 */
export function CommandsPage() {
  const ipc = useIPC()
  const load = useCommandsStore((s) => s.load)
  const activePanelId = useAppShell((s) => s.activePanelId)
  const echoSend = useSettingsStore((s) => s.echoSend)
  const txTimestamp = useSettingsStore((s) => s.txTimestamp)
  const charEncoding = useSettingsStore((s) => s.charEncoding)
  const [editorOpen, setEditorOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [repeat, setRepeat] = useState(false)
  const [repeatMs, setRepeatMs] = useState('1000')
  // repeatTick：repeaters 是 ref，内部 Map 变化不会触发渲染；
  // 在 toggle/clearAll 后 bump 它，让传给 CommandGrid 的 isRepeatActive 回调闭包刷新。
  const [repeatTick, setRepeatTick] = useState(0)
  const repeaters = useRef(new RepeatManager()).current

  useEffect(() => {
    load()
  }, [load])

  // 卸载时清空所有重复发送
  useEffect(() => () => repeaters.clearAll(), [repeaters])

  function flash(msg: string) {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 2500)
  }

  function echoIfEnabled(data: string) {
    if (!echoSend) return
    const ts = txTimestamp !== false ? `[${nowTs()}] ` : ''
    const id = activePanelId
    if (!id) return
    usePanelsStore.getState().appendChunk(id, {
      text: ts + data + '\n',
      hex: ts + data + '\n',
      isEcho: true
    })
  }

  /** 单次发送到当前活动面板 */
  async function sendOnce(cmd: Command) {
    const id = activePanelId
    if (!id) {
      flash('请先选择一个面板')
      return
    }
    const panel = usePanelsStore.getState().panels[id]
    if (!panel) {
      flash('面板不存在')
      return
    }
    const res = await routeWrite(panel, ipc, cmd.data || '', (cmd.mode || 'text') as 'text' | 'hex', 'none', charEncoding || 'utf-8')
    if (!res.ok) {
      flash('发送失败：' + (res.error || ''))
      return
    }
    echoIfEnabled(cmd.data || '')
  }

  /** 点击命令卡片：repeat 开 → toggle 重复；否则单次 */
  function handleSend(cmd: Command) {
    if (repeat) {
      const ms = parseInt(repeatMs || '1000', 10)
      repeaters.toggle(cmd.id, ms, () => sendOnce(cmd))
      setRepeatTick((n) => n + 1) // 刷新 CommandGrid 的 isRepeatActive 高亮
    } else {
      void sendOnce(cmd)
    }
  }

  function toggleRepeat() {
    const next = !repeat
    setRepeat(next)
    if (!next) repeaters.clearAll()
    setRepeatTick((n) => n + 1)
  }

  return (
    <div className="relative h-full">
      <CommandGrid
        onSend={handleSend}
        onEdit={() => setEditorOpen(true)}
        isRepeatActive={(cmdId) => {
          void repeatTick // toggle/clearAll 后触发重渲染
          return repeaters.isActive(cmdId)
        }}
        repeatBar={
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant={repeat ? 'default' : 'outline'}
              size="sm"
              className="h-7"
              onClick={toggleRepeat}
              title={repeat ? '关闭重复发送' : '开启重复发送'}
            >
              <ArrowsClockwise data-icon="inline-start" />
              {repeat ? '重复中' : '重复发送'}
            </Button>
            <Input
              type="number"
              value={repeatMs}
              onChange={(e) => setRepeatMs(e.target.value)}
              className="h-7 w-24"
              disabled={!repeat}
            />
            <span className="text-muted-foreground">ms</span>
          </div>
        }
      />
      <CommandEditor open={editorOpen} onOpenChange={setEditorOpen} />
      {notice && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          {notice}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 暂不运行（依赖 Task 6 的 CommandGrid 新 props）**

Task 5 与 Task 6 相互依赖：`CommandsPage` 传 `isRepeatActive`/`repeatBar`，而 `CommandGrid` 在 Task 6 才声明这两个 props。typecheck 会因 `CommandGrid` 缺 props 暂时失败。**先做 Task 6 再一起验证**。

- [ ] **Step 3: Commit（与 Task 6 合并提交）**

不单独提交，等 Task 6 完成后一起 `git add` 两文件。

---

## Task 6: `CommandGrid` 翻页 + 重复发送态

**Files:**
- Modify: `src/features/commands/components/CommandGrid.tsx`

加翻页（cols 按容器宽度算，rows=4 固定，对齐 legacy `calcCmdLayout`）、`cmdPage`、上一页/下一页；卡片在 `isRepeatActive(cmd.id)` 时加 `auto` 高亮；顶部插 `repeatBar`。

- [ ] **Step 1: 重写 `CommandGrid.tsx`**

把整个 `src/features/commands/components/CommandGrid.tsx` 替换为：

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ListPlus, PaperPlane, CaretLeft, CaretRight } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useCommandsStore, type Command } from '../store'

interface CommandGridProps {
  onSend: (cmd: Command) => void
  onEdit: () => void
  /** 卡片是否处于重复发送态（高亮） */
  isRepeatActive?: (cmdId: string) => boolean
  /** 顶部插入的重复发送控制条（由 CommandsPage 传入） */
  repeatBar?: ReactNode
}

/** 计算可见命令（镜像 legacy getVisibleCommands） */
function selectVisibleCommands(state: { commands: Command[]; groupsMeta: { visible: string[] } }): Command[] {
  const visSet = new Set(state.groupsMeta.visible)
  return state.commands.filter((c) => visSet.has(c.group || '默认分组'))
}

/** 列数按容器宽度算，每列 ~308px，行数固定 4（对齐 legacy calcCmdLayout: renderer.js:3457-3464） */
function calcCols(width: number): number {
  return Math.max(1, Math.floor(width / (300 + 8)))
}
const ROWS = 4

/**
 * 命令卡片网格 + 翻页。镜像 legacy renderCmdGrid + calcCmdLayout + pageSlice。
 * - cols 由容器宽度算（ResizeObserver），rows 固定 4；pageSize = cols*rows。
 * - cmdPage 翻页（不持久化，切回回首页）。
 * - 卡片 isRepeatActive 时加 auto 高亮。
 */
export function CommandGrid({ onSend, onEdit, isRepeatActive, repeatBar }: CommandGridProps) {
  const commands = useCommandsStore(useShallow(selectVisibleCommands))
  const gridRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(4)
  const [page, setPage] = useState(0)

  // 容器宽度变化 → 重算列数（镜像 legacy ResizeObserver / calcCmdLayout）
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => setCols(calcCols(el.clientWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pageSize = cols * ROWS
  const totalPages = Math.max(1, Math.ceil(commands.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * pageSize
  const pageItems = commands.slice(start, start + pageSize)

  // 命令总数变化导致页数收缩时，回正页码
  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1))
  }, [page, totalPages])

  if (commands.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <ListPlus className="size-8" />
        <p className="text-sm">暂无可见命令</p>
        <Button variant="outline" size="sm" onClick={onEdit}>
          打开命令编辑器
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm text-muted-foreground">
          共 {commands.length} 条 · 第 {safePage + 1}/{totalPages} 页 · 点击发送
        </span>
        <Button variant="outline" size="sm" onClick={onEdit}>
          编辑命令
        </Button>
      </div>
      {repeatBar && <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">{repeatBar}</div>}
      <ScrollArea className="flex-1">
        <div ref={gridRef} className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {pageItems.map((cmd) => {
            const repeating = isRepeatActive?.(cmd.id)
            return (
              <button
                key={cmd.id}
                type="button"
                onClick={() => onSend(cmd)}
                className={`group flex flex-col gap-1 rounded-md border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent ${repeating ? 'border-primary ring-2 ring-primary/40' : ''}`}
              >
                <span className="truncate text-sm font-medium">{cmd.name || '(未命名)'}</span>
                <span className="truncate font-mono text-xs text-muted-foreground group-hover:text-foreground">
                  {cmd.data || '(空)'}
                </span>
                <span className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                  <PaperPlane className="size-3" weight="fill" />
                  {cmd.mode === 'hex' ? 'HEX' : '文本'}
                  {repeating && <span className="text-primary">· 重复</span>}
                </span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 border-t py-1.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setPage((p) => (p - 1 + totalPages) % totalPages)} title="上一页">
            <CaretLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{safePage + 1} / {totalPages}</span>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setPage((p) => (p + 1) % totalPages)} title="下一页">
            <CaretRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: typecheck（含 Task 5）**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 3: 运行既有测试不破**

Run: `npx vitest run`
Expected: 全绿（含新增 active-bridge / commands-send + 既有回归）。

- [ ] **Step 4: Commit**

```bash
git add src/features/commands/CommandsPage.tsx src/features/commands/components/CommandGrid.tsx
git commit -m "feat(phase2a): wire command sending to active panel with repeat + paging"
```

---

## Task 7: `PanelOverviewPanel`（串口 tab 实质内容）

**Files:**
- Create: `src/features/main-window/components/PanelOverviewPanel.tsx`

轻量概览：列出所有面板，点击 → `panels.setActive(id)`（→ 经桥接 → appShell）。空态提示。

- [ ] **Step 1: 创建组件**

创建 `src/features/main-window/components/PanelOverviewPanel.tsx`：

```tsx
import { useShallow } from 'zustand/react/shallow'
import { Circle, Plugs } from '@phosphor-icons/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePanelsStore } from '@/features/serial-panel/store'

/**
 * 串口 tab 概览面板（只读 + 聚焦）。
 * 与侧栏 PaneList 互补：侧栏可折叠为图标，这里始终列出全部面板做概览。
 * 仅聚焦（setActive → 经 activeBridge → appShell.activePanelId），不重复增删改。
 */
export function PanelOverviewPanel() {
  const panels = usePanelsStore(useShallow((s) => s.listOrder.map((id) => s.panels[id]).filter(Boolean)))
  const activeId = usePanelsStore((s) => s.activeId)
  const setActive = usePanelsStore((s) => s.setActive)

  if (panels.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Plugs className="size-8" />
        <p className="text-sm">暂无面板，在侧栏点击「新建面板」创建</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b px-3 py-2 text-sm text-muted-foreground">
        共 {panels.length} 个面板 · 点击聚焦
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {panels.map((p) => {
            const isActive = activeId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(p.id)}
                className={`flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-accent ${isActive ? 'border-primary ring-1 ring-primary/30' : ''} ${p.hidden ? 'opacity-50' : ''}`}
              >
                <span className={p.open ? 'text-success' : 'text-muted-foreground'}>
                  <Circle className="size-3" weight={p.open ? 'fill' : 'regular'} />
                </span>
                <span className="flex-1 truncate text-sm font-medium">{p.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{p.type}</span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: exit 0（此时组件未被引用，但仍需编译通过）。

- [ ] **Step 3: Commit（与 Task 8 合并）**

不单独提交，等 Task 8 在 BottomNav 引用后一起提交。

---

## Task 8: `BottomNav` 补 serial/script tab + `mainwindow.tsx` 引 CSS

**Files:**
- Modify: `src/features/main-window/components/BottomNav.tsx`
- Modify: `src/mainwindow.tsx`

- [ ] **Step 1: 重写 `BottomNav.tsx`**

把整个 `src/features/main-window/components/BottomNav.tsx` 替换为：

```tsx
import { useState } from 'react'
import { Code } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useAppShell } from '@/shared/store/appShell'
import { CommandsPage } from '@/features/commands/CommandsPage'
import { PanelOverviewPanel } from './PanelOverviewPanel'
import { ScriptEditorDialog } from '@/features/script-editor/ScriptEditorDialog'

/**
 * 主区底部内容面板。页面切换由 Sidebar Footer 驱动（appShell.activeTab）：
 * - serial：PanelOverviewPanel（面板概览，上区工作区常驻）
 * - commands：CommandsPage
 * - script：脚本编辑器入口（ScriptEditorDialog 受控全屏对话框）
 * 「关于」已独立成单独窗口，不再在此。
 */
export function BottomNav() {
  const activeTab = useAppShell((s) => s.activeTab)
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)

  let content: React.ReactNode
  if (activeTab === 'commands') {
    content = <CommandsPage />
  } else if (activeTab === 'script') {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Code className="size-8" />
        <p className="text-sm">脚本编辑器</p>
        <Button variant="outline" size="sm" onClick={() => setScriptEditorOpen(true)}>
          打开脚本编辑器
        </Button>
      </div>
    )
  } else {
    content = <PanelOverviewPanel />
  }

  return (
    <>
      <div className="h-full">{content}</div>
      <ScriptEditorDialog open={scriptEditorOpen} onClose={() => setScriptEditorOpen(false)} />
    </>
  )
}
```

- [ ] **Step 2: `mainwindow.tsx` 引入 `script-editor.css`**

把 `src/mainwindow.tsx` 改为（加第 5 行 import）：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import '@/features/script-editor/script-editor.css'
import MainWindow from './features/main-window/MainWindow'

// React 主窗口入口（双轨并行可视）：
// 与 legacy src/index.html 完全独立，仅加载 globals.css（shadcn token）+ script-editor.css（Rete 画布）+ React。
// 通过 dev 预览窗口或浏览器直接访问 /src/mainwindow.html 预览。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MainWindow />
  </React.StrictMode>
)
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 4: 运行全部测试**

Run: `npx vitest run`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/features/main-window/components/PanelOverviewPanel.tsx src/features/main-window/components/BottomNav.tsx src/mainwindow.tsx
git commit -m "feat(phase2a): wire serial overview + script editor tabs in BottomNav"
```

---

## Task 9: 全量验证

**Files:** 无（仅验证）

- [ ] **Step 1: typecheck**

Run: `npm run typecheck`
Expected: exit 0（app + node 两套 tsconfig）。

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: 全绿（含新增 `test/active-bridge.test.ts`、`test/commands-send.test.ts` + 既有回归）。

- [ ] **Step 3: 手动验证（写进 PR）**

1. `npm run dev` 启动；通过 dev 菜单触发 `dev:open-react-mainwindow` 打开 React 预览窗。
2. 侧栏「新建面板」→ 建 COM 串口面板与 TCP 面板，收发数据正常。
3. 侧栏点击面板 / 串口 tab 概览点击面板 → 命令页能识别当前面板（发送不报"请先选择面板"）。
4. 命令页：点命令卡片 → 数据进面板；开启「重复发送」+ ms → 周期发送、卡片高亮、再点停止；翻页正常。
5. 脚本 tab：点「打开脚本编辑器」→ Rete 画布正常显示（CSS 已生效）。
6. 关闭/重开面板、popout/dock（既有功能）不受影响。

- [ ] **Step 4: 汇总**

如以上全过，本计划完成。在 PR 描述里附 typecheck/test 输出 + 手动验证记录。
