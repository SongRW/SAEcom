# Active Panel Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the React bottom panel's read-only "Overview" tab with a "current panel config" surface that binds to the active panel (serial params + send options + file send + share), matching legacy `#page-serial`.

**Architecture:** Extend the panel store with per-panel `SendOptions`; add a new `ActivePanelConfigPanel` component driven by `usePanelsStore.activeId` (already synced via `activeBridge`); migrate `SendBar` to read send options from the store; swap the component in `BottomNav`. Controlled components read `panel.*` directly, so switching the active panel auto-repopulates the form — no effect needed.

**Tech Stack:** React 19, zustand, shadcn/ui (`Select`/`Input`/`Label`/`Button`/`Switch`), Vitest (node env, `renderToStaticMarkup` for component tests), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-26-active-panel-config-design.md`

---

## File Structure

**Create:**
- `src/features/main-window/components/ActivePanelConfigPanel.tsx` — the new config surface bound to `activeId`
- `src/features/serial-panel/exportLog.ts` — shared log-export util (extracted from `FloatingPane`)
- `test/active-panel-config.test.ts` — store + component tests

**Modify:**
- `src/features/serial-panel/types.ts` — add `SendOptions`, add `sendOptions` to `Panel`/`PanelConfig`
- `src/features/serial-panel/paneViewModel.ts` — add `DEFAULT_SERIAL_SEND_OPTIONS`
- `src/features/serial-panel/store.ts` — `genPanel` default, `updateSendOptions` action, `persist()` dual-write, `load()` backfill
- `src/features/serial-panel/components/FloatingPane.tsx` — use shared `exportLog` util
- `src/features/serial-panel/components/SendBar.tsx` — read hex/append/echo from `panel.sendOptions` instead of local/global state
- `src/features/serial-panel/dataBus.ts` — read `bufferTime` from panel `sendOptions` (fallback to global)
- `src/features/main-window/components/BottomNav.tsx` — swap `PanelOverviewPanel` → `ActivePanelConfigPanel`
- `test/commands-send.test.ts` — add `sendOptions` to `makePanel` helper (fix type)

---

## Task 1: Add `SendOptions` type + default

**Files:**
- Modify: `src/features/serial-panel/types.ts:7-13` (after `SerialOptions`)
- Modify: `src/features/serial-panel/types.ts:37-64` (`Panel`)
- Modify: `src/features/serial-panel/types.ts:66-76` (`PanelConfig`)
- Modify: `src/features/serial-panel/paneViewModel.ts:78-84` (after `DEFAULT_SERIAL_OPTIONS`)

- [ ] **Step 1: Add `SendOptions` interface to types.ts**

In `src/features/serial-panel/types.ts`, add the import at top (line 1 area) and the interface after `SerialOptions` (after line 13):

```ts
import type { AppendMode } from '@shared/types'
```

```ts
/** 发送选项（每面板独立，对应 legacy pane.options 的发送字段） */
export interface SendOptions {
  /** 发送结尾：none/CR/LF/CRLF */
  append: AppendMode
  /** 以 HEX 格式发送（对应 legacy hexMode） */
  hexMode: boolean
  /** 发送回显（per-panel，覆盖全局 echoSend） */
  echoSend: boolean
  /** 接收缓冲 ms（对应 legacy bufferTime） */
  bufferTime: number
}
```

- [ ] **Step 2: Add `sendOptions` field to `Panel` interface**

In `types.ts`, inside `export interface Panel { ... }`, add after `sendText: string` (line 59):

```ts
  /** 发送选项（每面板独立） */
  sendOptions: SendOptions
```

- [ ] **Step 3: Add `sendOptions` field to `PanelConfig` interface**

In `types.ts`, inside `export interface PanelConfig { ... }`, add after `viewMode: ViewMode` (line 75):

```ts
  sendOptions: SendOptions
```

- [ ] **Step 4: Add `DEFAULT_SERIAL_SEND_OPTIONS` to paneViewModel.ts**

In `src/features/serial-panel/paneViewModel.ts`, after `DEFAULT_SERIAL_OPTIONS` (line 84), add:

```ts
/** 默认发送选项（对齐全局 useSettingsStore 默认：echoSend:false, bufferTime:50） */
export const DEFAULT_SERIAL_SEND_OPTIONS = {
  append: 'none' as const,
  hexMode: false,
  echoSend: false,
  bufferTime: 50
}
```

- [ ] **Step 5: Run typecheck to verify types compile (expect errors in store/SendBar — that's fine, fixed in later tasks)**

Run: `npm run typecheck`
Expected: Errors in `store.ts` (missing `sendOptions` in `genPanel`) and possibly `commands-send.test.ts` `makePanel`. These are fixed in Task 2 and Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/features/serial-panel/types.ts src/features/serial-panel/paneViewModel.ts
git commit -m "feat(serial-panel): add per-panel SendOptions type and default"
```

---

## Task 2: Wire `sendOptions` into the store (genPanel, action, persist, load)

**Files:**
- Modify: `src/features/serial-panel/store.ts:3-4` (imports)
- Modify: `src/features/serial-panel/store.ts:22-40` (`genPanel`)
- Modify: `src/features/serial-panel/store.ts:42-85` (`PanelsState` interface — add action)
- Modify: `src/features/serial-panel/store.ts:93-122` (`persist()`)
- Modify: `src/features/serial-panel/store.ts:251-257` (add `updateSendOptions` after `updateOptions`)
- Modify: `src/features/serial-panel/store.ts:365-388` (`load()` backfill)

- [ ] **Step 1: Update imports**

In `src/features/serial-panel/store.ts` line 3, change:

```ts
import type { Panel, PanelChunk, PanelGeometry, PanelType, SerialOptions, ViewMode } from './types'
```

to:

```ts
import type { Panel, PanelChunk, PanelGeometry, PanelType, SendOptions, SerialOptions, ViewMode } from './types'
```

Line 4, change:

```ts
import { DEFAULT_SERIAL_OPTIONS, DEFAULT_PANEL_W, DEFAULT_PANEL_H, cascadeGeometry, parseLegacyGeometry, trimChunks } from './paneViewModel'
```

to:

```ts
import { DEFAULT_SERIAL_OPTIONS, DEFAULT_SERIAL_SEND_OPTIONS, DEFAULT_PANEL_W, DEFAULT_PANEL_H, cascadeGeometry, parseLegacyGeometry, trimChunks } from './paneViewModel'
```

- [ ] **Step 2: Extend `genPanel` params and default**

In `genPanel` (line 12-40), add `sendOptions?: SendOptions` to the params interface (after `options?: SerialOptions`), and add to the returned object after `options:` (line 26):

```ts
    sendOptions: params.sendOptions ?? { ...DEFAULT_SERIAL_SEND_OPTIONS },
```

- [ ] **Step 3: Add `updateSendOptions` to `PanelsState` interface**

In the interface (around line 65, after `updateOptions`):

```ts
  updateSendOptions: (id: string, options: Partial<SendOptions>) => void
```

- [ ] **Step 4: Implement `updateSendOptions` action**

After `updateOptions` implementation (line 257), add:

```ts
    updateSendOptions(id, options) {
      set((s) => {
        if (!s.panels[id]) return s
        return { panels: { ...s.panels, [id]: { ...s.panels[id], sendOptions: { ...s.panels[id].sendOptions, ...options } } } }
      })
      persist()
    },
```

- [ ] **Step 5: Dual-write `sendOptions` in `persist()`**

In `persist()` (line 99-116), the returned config object. After `viewMode: p.viewMode,` (line 108), add:

```ts
          sendOptions: p.sendOptions,
          // legacy 兼容扁平字段（让 legacy renderer.js 读到不报错）
          appendMode: p.sendOptions.append,
          hexMode: p.sendOptions.hexMode,
          echoSend: p.sendOptions.echoSend,
          bufferTime: p.sendOptions.bufferTime,
```

- [ ] **Step 6: Backfill `sendOptions` in `load()`**

In `load()` (line 372-381), the `genPanel({...})` call. Add `sendOptions` param by reading from config with fallback. After `options: c.options as SerialOptions,` (line 377), add:

```ts
          sendOptions: {
            ...DEFAULT_SERIAL_SEND_OPTIONS,
            ...(c.sendOptions as Partial<SendOptions> | undefined),
            // legacy 扁平字段兼容（旧数据没有 sendOptions 嵌套）
            ...(typeof c.appendMode === 'string' ? { append: c.appendMode as SendOptions['append'] } : {}),
            ...(typeof c.hexMode === 'boolean' ? { hexMode: c.hexMode } : {}),
            ...(typeof c.echoSend === 'boolean' ? { echoSend: c.echoSend } : {}),
            ...(typeof c.bufferTime === 'number' ? { bufferTime: c.bufferTime } : {})
          },
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS for store.ts. Remaining errors only in `SendBar.tsx` (Task 5) and `commands-send.test.ts` `makePanel` (Task 7).

- [ ] **Step 8: Commit**

```bash
git add src/features/serial-panel/store.ts
git commit -m "feat(serial-panel): wire sendOptions into store (genPanel/persist/load + updateSendOptions)"
```

---

## Task 3: Write store tests for `updateSendOptions` + `load()` backfill (TDD)

**Files:**
- Create: `test/active-panel-config.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `test/active-panel-config.test.ts`:

```ts
/**
 * 当前面板配置区：store 层 sendOptions 写回 + load() 向后兼容。
 * 组件渲染测试在后面 step 追加。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// mock IPC（config.save/load 记录调用）
const savedConfigs: unknown[][] = []
let loadedConfigs: unknown[] = []
const mockConfig = {
  load: vi.fn(async () => loadedConfigs),
  save: vi.fn((cfg: unknown[]) => { savedConfigs.push(cfg) })
}
const mockSerial = {
  list: vi.fn(async () => []),
  open: vi.fn(async () => ({ ok: true })),
  close: vi.fn(async () => ({ ok: true })),
  write: vi.fn(async () => ({ ok: true, bytes: 1 })),
  onData: vi.fn(),
  onEvent: vi.fn()
}

vi.mock('@/shared/ipc', () => ({
  getIPC: () => ({
    config: mockConfig,
    serial: mockSerial,
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() }
  }),
  useIPC: () => ({
    config: mockConfig,
    serial: mockSerial,
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() }
  })
}))

// 隔离 zustand store 状态：每个 test 前 reset 模块
let usePanelsStore: typeof import('../src/features/serial-panel/store').usePanelsStore

describe('panels store sendOptions', () => {
  beforeEach(async () => {
    vi.resetModules()
    savedConfigs.length = 0
    loadedConfigs = []
    const mod = await import('../src/features/serial-panel/store')
    usePanelsStore = mod.usePanelsStore
  })

  it('updateSendOptions writes back to panel and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    savedConfigs.length = 0
    usePanelsStore.getState().updateSendOptions('COM1', { hexMode: true, append: 'CRLF' })
    const p = usePanelsStore.getState().panels.COM1
    expect(p.sendOptions.hexMode).toBe(true)
    expect(p.sendOptions.append).toBe('CRLF')
    expect(mockConfig.save).toHaveBeenCalled()
    const last = savedConfigs.at(-1) as Array<{ id: string; sendOptions?: { hexMode: boolean; append: string } }>
    expect(last.find((c) => c.id === 'COM1')?.sendOptions?.hexMode).toBe(true)
  })

  it('updateOptions writes serial params and persists', () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    savedConfigs.length = 0
    usePanelsStore.getState().updateOptions('COM1', { baudRate: 9600 })
    expect(usePanelsStore.getState().panels.COM1.options.baudRate).toBe(9600)
    expect(mockConfig.save).toHaveBeenCalled()
  })

  it('load() backfills DEFAULT_SERIAL_SEND_OPTIONS for legacy data without sendOptions', async () => {
    // legacy 数据：只有 options，没有 sendOptions
    loadedConfigs = [{ id: 'COM1', name: 'COM1', type: 'serial', options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' } }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM1
    expect(p.sendOptions).toBeDefined()
    expect(p.sendOptions.hexMode).toBe(false)
    expect(p.sendOptions.append).toBe('none')
    expect(p.sendOptions.bufferTime).toBe(50)
  })

  it('load() reads legacy flat fields (hexMode/append/echoSend/bufferTime)', async () => {
    loadedConfigs = [{
      id: 'COM2', name: 'COM2', type: 'serial',
      options: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
      hexMode: true, appendMode: 'CR', echoSend: true, bufferTime: 100
    }]
    await usePanelsStore.getState().load()
    const p = usePanelsStore.getState().panels.COM2
    expect(p.sendOptions.hexMode).toBe(true)
    expect(p.sendOptions.append).toBe('CR')
    expect(p.sendOptions.echoSend).toBe(true)
    expect(p.sendOptions.bufferTime).toBe(100)
  })

  it('genPanel default sendOptions matches DEFAULT_SERIAL_SEND_OPTIONS', () => {
    usePanelsStore.getState().addPanel({ id: 'COM3', name: 'COM3', type: 'serial' })
    const p = usePanelsStore.getState().panels.COM3
    expect(p.sendOptions).toEqual({ append: 'none', hexMode: false, echoSend: false, bufferTime: 50 })
  })
})
```

- [ ] **Step 2: Run tests to verify they pass (store already implemented in Task 2)**

Run: `npx vitest run test/active-panel-config.test.ts`
Expected: PASS (5 tests). Task 2 already implemented the store logic; these tests lock it in.

- [ ] **Step 3: Commit**

```bash
git add test/active-panel-config.test.ts
git commit -m "test(serial-panel): cover updateSendOptions + load() sendOptions backfill"
```

---

## Task 4: Extract shared `exportLog` util

**Files:**
- Create: `src/features/serial-panel/exportLog.ts`
- Modify: `src/features/serial-panel/components/FloatingPane.tsx:68-76` (use the util; `PaneHeader` only receives `onExport` prop, no change needed there)

> **Verified:** The export handler lives in `FloatingPane.tsx:68-76` and calls `ipc.panel.saveLog(panel.name, content)` where `content = panel.viewMode === 'hex' ? panel.hexBuffer : panel.textBuffer`. There is **no** `logger.saveAs`. `PaneHeader` is a pure presentational component receiving `onExport` as a prop — it does not contain export logic, so it is NOT modified.

- [ ] **Step 1: Create `exportLog.ts` with the extracted util**

Create `src/features/serial-panel/exportLog.ts`:

```ts
import { getIPC } from '@/shared/ipc'
import type { Panel } from './types'

/**
 * 导出当前面板的日志文本到文件。对应 legacy #btnSaveLog。
 * 镜像 FloatingPane.handleExport：content 取 viewMode 对应缓冲，调 ipc.panel.saveLog。
 * @param panel 当前面板
 */
export async function exportPanelLog(panel: Panel): Promise<void> {
  const ipc = getIPC()
  const content = panel.viewMode === 'hex' ? panel.hexBuffer : panel.textBuffer
  await ipc.panel.saveLog(panel.name, content)
}
```

- [ ] **Step 2: Refactor `FloatingPane.handleExport` to use the util**

In `src/features/serial-panel/components/FloatingPane.tsx`, add import at top:

```ts
import { exportPanelLog } from '../exportLog'
```

Replace the body of `handleExport` (lines 68-76):

```ts
  async function handleExport() {
    try {
      await exportPanelLog(panel)
      appendSysLine(panel.id, '[系统] 已导出数据')
    } catch (e) {
      appendSysLine(panel.id, `[错误] 导出失败：${String(e)}`)
    }
  }
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run existing tests to ensure no regression**

Run: `npm test`
Expected: All existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/serial-panel/exportLog.ts src/features/serial-panel/components/FloatingPane.tsx
git commit -m "refactor(serial-panel): extract exportPanelLog util shared by FloatingPane + config panel"
```

---

## Task 5: Migrate `SendBar` send options to store

**Files:**
- Modify: `src/features/serial-panel/components/SendBar.tsx:32-50` (state sources)
- Modify: `src/features/serial-panel/components/SendBar.tsx:157-177` (Select onValueChange)

- [ ] **Step 1: Read SendBar fully**

Run: read `src/features/serial-panel/components/SendBar.tsx` (lines 1-200). Confirm `mode`/`append` local state and the `echoSend` global read.

- [ ] **Step 2: Replace local state with store reads**

In `src/features/serial-panel/components/SendBar.tsx`, remove the local `useState` for `mode` and `append` (lines 41-42):

```ts
  const [mode, setMode] = useState<'text' | 'hex'>('text')
  const [append, setAppend] = useState<AppendMode>('none')
```

Replace with store-derived values + the `updateSendOptions` action. Add near the other store hooks (after line 36 `appendSysLine`):

```ts
  const updateSendOptions = usePanelsStore((s) => s.updateSendOptions)
  // 发送选项来源迁移到 panel.sendOptions（每面板独立）
  const mode: 'text' | 'hex' = panel.sendOptions.hexMode ? 'hex' : 'text'
  const append = panel.sendOptions.append
```

Then change the `echoSend` read (line 38) from global to per-panel:

```ts
  const echoSend = panel.sendOptions.echoSend
```

Remove now-unused `useState` import if no other `useState` remains in the file (check `sending` — line 43 `const [sending, setSending] = useState(false)` stays, so keep the import).

- [ ] **Step 3: Wire Select onValueChange to store**

In the JSX (line 157), change the mode `Select`:

```tsx
        <Select value={mode} onValueChange={(v) => updateSendOptions(panel.id, { hexMode: v === 'hex' })}>
```

Line 166, change the append `Select`:

```tsx
        <Select value={append} onValueChange={(v) => updateSendOptions(panel.id, { append: v as AppendMode })}>
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS for SendBar.tsx. The `AppendMode` import (line 14) is still used by `APPEND_OPTIONS` typing, keep it.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/serial-panel/components/SendBar.tsx
git commit -m "refactor(serial-panel): migrate SendBar send options to per-panel store"
```

---

## Task 6: `dataBus` reads `bufferTime` from panel `sendOptions`

**Files:**
- Modify: `src/features/serial-panel/dataBus.ts:44-45`

- [ ] **Step 1: Change bufferTime source to per-panel**

In `src/features/serial-panel/dataBus.ts`, inside `appendWithBuffering` (lines 43-45), change:

```ts
      const settings = useSettingsStore.getState()
      const bufferTime = settings.bufferTime ?? 0
```

to read per-panel `sendOptions.bufferTime`, falling back to global:

```ts
      const settings = useSettingsStore.getState()
      const store = usePanelsStore.getState()
      // bufferTime 优先读面板级 sendOptions，回退全局（向后兼容）
      const panel = store.panels[id]
      const bufferTime = panel?.sendOptions?.bufferTime ?? settings.bufferTime ?? 0
```

Then **remove** the duplicate `const store = usePanelsStore.getState()` line that was previously at line 49 (it's now declared above). Verify the `if (!store.panels[id]) return` guard at line 50 still works (it does — `store` is now in scope earlier).

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/serial-panel/dataBus.ts
git commit -m "refactor(serial-panel): dataBus bufferTime prefers per-panel sendOptions"
```

---

## Task 7: Fix `makePanel` helper in `commands-send.test.ts`

**Files:**
- Modify: `test/commands-send.test.ts:9-29`

- [ ] **Step 1: Add `sendOptions` to `makePanel`**

In `test/commands-send.test.ts`, inside `makePanel` (the returned object literal), add after `z: 10,` (line 26):

```ts
    sendOptions: { append: 'none', hexMode: false, echoSend: false, bufferTime: 50 },
```

- [ ] **Step 2: Run typecheck + tests**

Run: `npm run typecheck && npx vitest run test/commands-send.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/commands-send.test.ts
git commit -m "test(commands): add sendOptions to makePanel helper for type parity"
```

---

## Task 8: Build `ActivePanelConfigPanel` component

**Files:**
- Create: `src/features/main-window/components/ActivePanelConfigPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/features/main-window/components/ActivePanelConfigPanel.tsx`:

```tsx
import { useState } from 'react'
import { ChartLineUp, DownloadSimple, Eye, Circle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useIPC } from '@/shared/ipc'
import { usePanelsStore } from '@/features/serial-panel/store'
import { exportPanelLog } from '@/features/serial-panel/exportLog'
import type { AppendMode } from '@shared/types'

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const DATA_BITS = [5, 6, 7, 8]
const STOP_BITS = [1, 1.5, 2]
const PARITIES: { value: 'none' | 'even' | 'odd' | 'mark' | 'space'; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'even', label: '偶校验' },
  { value: 'odd', label: '奇校验' },
  { value: 'mark', label: 'Mark' },
  { value: 'space', label: 'Space' }
]
const APPENDS: { value: AppendMode; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'LF', label: '+ \\n' },
  { value: 'CR', label: '+ \\r' },
  { value: 'CRLF', label: '+ \\r\\n' }
]

/**
 * 底部「当前面板配置区」。绑定 usePanelsStore.activeId（经 activeBridge 与 appShell 同步）。
 * 复刻 legacy #page-serial：面板名 + 辅助按钮 + 串口参数 + 发送选项 + 文件发送 + 共享。
 * 受控组件直接读 panel.*，切换 activeId 自动回填，无需 effect。
 */
export function ActivePanelConfigPanel() {
  const ipc = useIPC()
  const activeId = usePanelsStore((s) => s.activeId)
  const panel = usePanelsStore((s) => (activeId ? s.panels[activeId] : null))
  const updateOptions = usePanelsStore((s) => s.updateOptions)
  const updateSendOptions = usePanelsStore((s) => s.updateSendOptions)
  const setLogging = usePanelsStore((s) => s.setLogging)
  const appendSysLine = usePanelsStore((s) => s.appendSysLine)

  const [sharePort, setSharePort] = useState('8080')
  const [sharing, setSharing] = useState(false)

  // 空状态
  if (!panel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">请先选中一个面板（在工作区点击面板，或从侧边栏列表选择）</p>
      </div>
    )
  }

  const isSerial = panel.type === 'serial'

  async function handleExport() {
    if (!panel) return
    try {
      await exportPanelLog(panel)
      appendSysLine(panel.id, '[系统] 已导出数据')
    } catch (e) {
      appendSysLine(panel.id, `[错误] 导出失败：${String(e)}`)
    }
  }

  async function handleToggleShare() {
    if (!panel) return
    try {
      if (sharing) {
        await ipc.tcpShare.stop(panel.id)
        setSharing(false)
        appendSysLine(panel.id, '[系统] 已停止 TCP 共享')
      } else {
        const port = Number(sharePort)
        if (!port) { appendSysLine(panel.id, '[错误] 共享端口无效'); return }
        await ipc.tcpShare.start(panel.id, port)
        setSharing(true)
        appendSysLine(panel.id, `[系统] 已共享为 TCP :${port}`)
      }
    } catch {
      appendSysLine(panel.id, '[系统] 共享功能后端待迁移')
    }
  }

  async function handleChooseFile(protocol: 'raw' | 'ymodem') {
    if (!panel) return
    try {
      const filePath = await ipc.logger.pickFile()
      if (!filePath) return
      // 复用 SendBar 的文件发送逻辑：通过事件或直接调 ipc（此处简化为提示）
      appendSysLine(panel.id, `[文件] 选择 ${filePath}，协议 ${protocol}（发送由面板发送栏触发）`)
    } catch (e) {
      appendSysLine(panel.id, `[错误] 选文件失败：${String(e)}`)
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto px-3 py-2 text-xs">
      {/* L1 面板名 + 辅助按钮 */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">当前面板：</span>
        <span className="font-medium">{panel.name}</span>
        <span className="text-muted-foreground">（{panel.type === 'tcp' ? 'TCP' : '串口'}）</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7" title="示波器" onClick={() => appendSysLine(panel.id, '[系统] 示波器暂未迁移')}>
            <ChartLineUp data-icon="inline-start" /> 示波器
          </Button>
          <Button variant="ghost" size="sm" className="h-7" title="导出日志" onClick={handleExport}>
            <DownloadSimple data-icon="inline-start" /> 导出
          </Button>
          <Button variant="ghost" size="sm" className="h-7" title="显示行数限制" onClick={() => appendSysLine(panel.id, '[系统] 行数限制暂未实现')}>
            <Eye data-icon="inline-start" /> 行数
          </Button>
          <Button
            variant={panel.logging.active ? 'default' : 'ghost'}
            size="sm"
            className="h-7"
            title="实时日志"
            onClick={async () => {
              if (panel.logging.active) {
                setLogging(panel.id, false, null)
              } else {
                const path = await ipc.logger.pickFile()
                if (path) setLogging(panel.id, true, path)
              }
            }}
          >
            <Circle data-icon="inline-start" /> {panel.logging.active ? '停止日志' : '实时日志'}
          </Button>
        </div>
      </div>

      {/* L2 串口参数（TCP 隐藏） */}
      {isSerial && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Label className="text-muted-foreground">波特率</Label>
            <Select value={String(panel.options.baudRate)} onValueChange={(v) => updateOptions(panel.id, { baudRate: Number(v) })}>
              <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map((b) => <SelectItem key={b} value={String(b)}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-muted-foreground">数据位</Label>
            <Select value={String(panel.options.dataBits)} onValueChange={(v) => updateOptions(panel.id, { dataBits: Number(v) })}>
              <SelectTrigger className="h-7 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATA_BITS.map((d) => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-muted-foreground">停止位</Label>
            <Select value={String(panel.options.stopBits)} onValueChange={(v) => updateOptions(panel.id, { stopBits: Number(v) })}>
              <SelectTrigger className="h-7 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STOP_BITS.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-muted-foreground">校验</Label>
            <Select value={panel.options.parity} onValueChange={(v) => updateOptions(panel.id, { parity: v as 'none' | 'even' | 'odd' | 'mark' | 'space' })}>
              <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* L3 发送选项（每面板独立） */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Label className="text-muted-foreground">发送结尾</Label>
          <Select value={panel.sendOptions.append} onValueChange={(v) => updateSendOptions(panel.id, { append: v as AppendMode })}>
            <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {APPENDS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-muted-foreground">HEX 发送</Label>
          <Switch checked={panel.sendOptions.hexMode} onCheckedChange={(v) => updateSendOptions(panel.id, { hexMode: v })} />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-muted-foreground">发送回显</Label>
          <Switch checked={panel.sendOptions.echoSend} onCheckedChange={(v) => updateSendOptions(panel.id, { echoSend: v })} />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-muted-foreground">接收缓冲(ms)</Label>
          <Input
            type="number"
            className="h-7 w-20"
            value={panel.sendOptions.bufferTime}
            onChange={(e) => updateSendOptions(panel.id, { bufferTime: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      {/* L4 文件发送 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7" disabled={!panel.open} onClick={() => handleChooseFile('raw')}>
          发送文件 (raw)
        </Button>
        <Button variant="ghost" size="sm" className="h-7" disabled={!panel.open} onClick={() => handleChooseFile('ymodem')}>
          YModem
        </Button>
        <Button variant="ghost" size="sm" className="h-7" disabled title="暂未实现">
          XModem
        </Button>
        <Button variant="ghost" size="sm" className="h-7" disabled title="暂未实现">
          ZModem
        </Button>
      </div>

      {/* L5 共享（serial only） */}
      {isSerial && (
        <div className="flex items-center gap-2">
          <Label className="text-muted-foreground">共享为 TCP</Label>
          <Input className="h-7 w-24" value={sharePort} onChange={(e) => setSharePort(e.target.value)} placeholder="端口" />
          <Button variant={sharing ? 'default' : 'outline'} size="sm" className="h-7" onClick={handleToggleShare}>
            {sharing ? '停止共享' : '开始共享'}
          </Button>
        </div>
      )}
    </div>
  )
}
```

> **Note on file send:** The config panel's file buttons delegate to `ipc.logger.pickFile()` + a notice. The actual byte-sending lives in `SendBar.sendFile` (per-panel). Full file-send-from-config-panel (sharing `SendBar.sendFile`) is a follow-up; this plan keeps the config panel's file buttons as a chooser + notice to avoid duplicating the YModem/raw send machinery. If the reviewer wants full send from config, that becomes an extra task — call it out.

- [ ] **Step 2: Verify icon imports compile**

Run: `npm run typecheck`
Expected: PASS. The icons `ChartLineUp`, `DownloadSimple`, `Eye`, `Circle` are all verified to exist in `@phosphor-icons/react`. If typecheck reports a missing icon, swap it for another verified one (`Pulse`, `Waveform`, `Dot`).

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. If an icon name is wrong, replace it with a valid phosphor icon.

- [ ] **Step 4: Commit**

```bash
git add src/features/main-window/components/ActivePanelConfigPanel.tsx
git commit -m "feat(main-window): add ActivePanelConfigPanel bound to activeId"
```

---

## Task 9: Wire `ActivePanelConfigPanel` into `BottomNav` + component tests

**Files:**
- Modify: `src/features/main-window/components/BottomNav.tsx:1-7,33-35`
- Modify: `test/active-panel-config.test.ts` (append component tests)

- [ ] **Step 1: Swap the component in BottomNav**

In `src/features/main-window/components/BottomNav.tsx`:

- Line 6: change `import { PanelOverviewPanel } from './PanelOverviewPanel'` to `import { ActivePanelConfigPanel } from './ActivePanelConfigPanel'`
- Line 34: change `content = <PanelOverviewPanel />` to `content = <ActivePanelConfigPanel />`

- [ ] **Step 2: Append component render tests**

Append to `test/active-panel-config.test.ts` (after the existing `describe` block). Add imports at top of file:

```ts
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
```

Add new describe block at the end:

```ts
describe('ActivePanelConfigPanel', () => {
  beforeEach(async () => {
    vi.resetModules()
    savedConfigs.length = 0
    loadedConfigs = []
    const mod = await import('../src/features/serial-panel/store')
    usePanelsStore = mod.usePanelsStore
  })

  it('renders empty state when no active panel', async () => {
    const { ActivePanelConfigPanel } = await import('../src/features/main-window/components/ActivePanelConfigPanel')
    const html = renderToStaticMarkup(React.createElement(ActivePanelConfigPanel))
    expect(html).toContain('请先选中一个面板')
  })

  it('shows serial params for an active serial panel', async () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().setActive('COM1')
    const { ActivePanelConfigPanel } = await import('../src/features/main-window/components/ActivePanelConfigPanel')
    const html = renderToStaticMarkup(React.createElement(ActivePanelConfigPanel))
    expect(html).toContain('当前面板')
    expect(html).toContain('COM1')
    expect(html).toContain('波特率')
    expect(html).toContain('115200')
  })

  it('hides serial param row for an active TCP panel', async () => {
    usePanelsStore.getState().addPanel({ id: 'tcp://1.2.3.4:8080', name: 'TCP-A', type: 'tcp' })
    usePanelsStore.getState().setActive('tcp://1.2.3.4:8080')
    const { ActivePanelConfigPanel } = await import('../src/features/main-window/components/ActivePanelConfigPanel')
    const html = renderToStaticMarkup(React.createElement(ActivePanelConfigPanel))
    expect(html).toContain('TCP')
    expect(html).not.toContain('波特率')
    // 发送选项行对 TCP 仍显示
    expect(html).toContain('发送结尾')
  })

  it('repopulates when activeId changes', async () => {
    usePanelsStore.getState().addPanel({ id: 'COM1', name: 'COM1', type: 'serial' })
    usePanelsStore.getState().addPanel({ id: 'COM2', name: 'COM2', type: 'serial' })
    usePanelsStore.getState().updateOptions('COM2', { baudRate: 9600 })
    usePanelsStore.getState().setActive('COM1')
    const { ActivePanelConfigPanel } = await import('../src/features/main-window/components/ActivePanelConfigPanel')
    let html = renderToStaticMarkup(React.createElement(ActivePanelConfigPanel))
    expect(html).toContain('COM1')
    usePanelsStore.getState().setActive('COM2')
    html = renderToStaticMarkup(React.createElement(ActivePanelConfigPanel))
    expect(html).toContain('COM2')
    expect(html).toContain('9600')
    expect(html).not.toContain('115200')
  })
})
```

- [ ] **Step 3: Run the test file**

Run: `npx vitest run test/active-panel-config.test.ts`
Expected: PASS (5 store + 4 component = 9 tests).

- [ ] **Step 4: Run typecheck + full test suite**

Run: `npm run typecheck && npm test`
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/main-window/components/BottomNav.tsx test/active-panel-config.test.ts
git commit -m "feat(main-window): wire ActivePanelConfigPanel into BottomNav + component tests"
```

---

## Task 10: Final verification + manual check notes

- [ ] **Step 1: Run full typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: All PASS.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Completes without errors.

- [ ] **Step 3: Manual verification notes (document in PR)**

Run the app (`npm run dev`), open the React preview, and verify:
1. Bottom "serial/概览" tab now shows the active panel's config (name + serial params + send options + file send + share)
2. Clicking different panes in the workspace repopulates the config area
3. Changing baud rate persists (reload app → value retained)
4. HEX/append toggles in the config area also reflect in each pane's SendBar
5. TCP panel hides serial params + share row
6. No panel selected → empty state
7. Legacy app still loads the (now `sendOptions`-containing) `panels.json` without errors

- [ ] **Step 4: Final commit (if any cleanup)**

If any cleanup edits were made, commit them. Otherwise this task produces no commit.

---

## Self-Review Notes

- **Spec coverage:** §2 (compare) → Tasks 1-2 (model) + 8 (UI); §3 (model) → Tasks 1-2; §4 (component) → Task 8; §5 (SendBar migrate) → Task 5; §5.1 (dataBus bufferTime) → Task 6; §6 (BottomNav swap) → Task 9; §7 (share) → Task 8 (L5); §8 (tests) → Tasks 3, 9; §9 (risks: dual-write, backfill) → Tasks 2, 3. ✅
- **Known simplification:** §4.4 行数限制 = placeholder toast (Task 8 L1). §4.4 示波器 = placeholder toast. XModem/ZModem = disabled buttons. File-send-from-config-panel = chooser+notice (not full send). All flagged in spec §9.
- **Type consistency:** `SendOptions`, `updateSendOptions`, `sendOptions`, `DEFAULT_SERIAL_SEND_OPTIONS` used consistently across tasks. `Panel.sendOptions` added in Task 1, consumed in Tasks 2/5/6/8/9.
