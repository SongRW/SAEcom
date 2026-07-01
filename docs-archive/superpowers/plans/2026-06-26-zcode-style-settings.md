# zcode 风格设置界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有单列 `SettingsDialog` 改造成 zcode 风格的「左导航 + 右分区」设置界面,新增字体大小、重置默认、快捷键三个功能。

**Architecture:** 沿用现有 shadcn `Dialog`(加宽到 `max-w-2xl`),内部拆成左侧导航 + 右侧 ScrollArea 内容区。设置仍由 zustand store `src/shared/store/settings.ts` 管理,持久化到 `localStorage['appSettings']`(与 legacy 共享)。新增 `fontSize` 字段,新增 `shortcuts.ts` 提供只读快捷键表 + 全局键盘监听 hook。

**Tech Stack:** React 19 + TypeScript + zustand + shadcn/ui (Dialog/Switch/Select/Input/Button/ScrollArea) + Vitest

**Spec:** `docs/superpowers/specs/2026-06-26-zcode-style-settings-design.md`

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/shared/store/settings.ts` | 设置 store;新增 `fontSize` | Modify |
| `src/features/settings/shortcuts.ts` | `SHORTCUTS` 表 + `useGlobalShortcuts()` hook + 平台检测 | Create |
| `src/features/settings/ToggleRow.tsx` | 通用开关行(从 SettingsForm 抽出) | Create |
| `src/features/settings/sections/GeneralSection.tsx` | 通用分区 | Create |
| `src/features/settings/sections/AppearanceSection.tsx` | 外观分区(含字体大小) | Create |
| `src/features/settings/sections/SerialSection.tsx` | 串口分区(迁移 SettingsForm 逻辑) | Create |
| `src/features/settings/sections/ShortcutsSection.tsx` | 快捷键只读清单 | Create |
| `src/features/settings/sections/AboutSection.tsx` | 关于分区 | Create |
| `src/features/settings/SettingsNav.tsx` | 左侧导航 | Create |
| `src/features/settings/SettingsContent.tsx` | 右侧内容区(按分区渲染) | Create |
| `src/features/settings/SettingsDialog.tsx` | 容器:加宽 Dialog + 左右布局 + 副作用 | Modify |
| `src/features/settings/SettingsForm.tsx` | 旧单列表单 | Delete |
| `src/features/main-window/components/Sidebar.tsx` | 挂载 `useGlobalShortcuts` | Modify |
| `test/settings-store.test.ts` | store `fontSize`/reset 测试 | Create |
| `test/settings-shortcuts.test.ts` | 快捷键表与平台展示测试 | Create |

---

## Task 1: settings store 新增 fontSize 字段

**Files:**
- Modify: `src/shared/store/settings.ts`
- Test: `test/settings-store.test.ts`

> **测试环境须知**:vitest 配置为 `environment: 'node'`(见 `vitest.config.ts:12`),**没有 `window`/`localStorage`**。而 `settings.ts` 在 `loadFromStorage()` 里调了 `localStorage.getItem`。因此测试必须在顶层注入一个最小 `localStorage` shim(参照 `test/active-bridge.test.ts:17-29` 的 window shim 模式)。

- [ ] **Step 1: 写失败测试**

创建 `test/settings-store.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from '@/shared/store/settings'

// vitest 为 node 环境(无 localStorage);settings.ts 的 loadFromStorage 读 localStorage,
// 故注入最小 shim。store 模块在首次 import 时执行 loadFromStorage,shim 必须在 import 前生效。
let store: Record<string, string> = {}
;(globalThis as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v)
  },
  removeItem: (k: string) => {
    delete store[k]
  },
  clear: () => {
    store = {}
  },
  key: () => null,
  length: 0
} as Storage

describe('settings store — fontSize', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({
      fontSize: 14,
      dark: false,
      fullscreen: false,
      rxTimestamp: true,
      txTimestamp: true,
      confirmClear: true,
      confirmDelete: true,
      charEncoding: 'utf-8',
      bufferTime: 50,
      echoSend: false,
      longCommandThreshold: 80
    })
  })

  it('默认 fontSize 为 14', () => {
    expect(useSettingsStore.getState().fontSize).toBe(14)
  })

  it('setField 可修改 fontSize 并持久化', () => {
    useSettingsStore.getState().setField('fontSize', 18)
    expect(useSettingsStore.getState().fontSize).toBe(18)
    const stored = JSON.parse(localStorage.getItem('appSettings') || '{}')
    expect(stored.fontSize).toBe(18)
  })

  it('reset 把 fontSize 恢复为 14', () => {
    useSettingsStore.getState().setField('fontSize', 20)
    useSettingsStore.getState().reset()
    expect(useSettingsStore.getState().fontSize).toBe(14)
  })

  it('loadFromStorage 对越界 fontSize 回退到 14', () => {
    localStorage.setItem('appSettings', JSON.stringify({ fontSize: 99 }))
    // 重新 import 触发 loadFromStorage(新模块实例)
    vi.resetModules()
    return import('@/shared/store/settings').then(({ useSettingsStore: fresh }) => {
      expect(fresh.getState().fontSize).toBe(14)
    })
  })
})
```

在文件顶部 `import` 区补充 `vi`:`import { beforeEach, describe, expect, it, vi } from 'vitest'`

> **关于 `vi.resetModules()` + 动态 import**:node 环境下 `vi` 来自 vitest 全局注入(虽然 `globals: false`,但 `vi` 仍需显式 import,见上面那行)。`loadFromStorage` 被包在 try/catch 里,shim 的 localStorage 不会抛错,越界值(99)会被 `>= 12 && <= 20` 判断拦截回退到 14。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/settings-store.test.ts`
Expected: FAIL(类型错误 `fontSize` 不存在 / 默认值 undefined)

- [ ] **Step 3: 实现 fontSize 字段**

修改 `src/shared/store/settings.ts`:

`SettingKey` 联合类型末尾新增:
```ts
export type SettingKey =
  | 'fullscreen'
  | 'dark'
  | 'rxTimestamp'
  | 'txTimestamp'
  | 'confirmClear'
  | 'confirmDelete'
  | 'charEncoding'
  | 'bufferTime'
  | 'echoSend'
  | 'longCommandThreshold'
  | 'fontSize'
```

`Settings` interface 末尾新增字段:
```ts
  /** 长命令阈值(字符数):命令数据超过此长度时,编辑器自动展开为多行文本框。 */
  longCommandThreshold: number
  /** 基础字号 px,通过 CSS 变量 --font-size-base 应用到 <html>。 */
  fontSize: number
}
```

`DEFAULTS` 末尾新增:
```ts
const DEFAULTS: Settings = {
  fullscreen: false,
  dark: false,
  rxTimestamp: true,
  txTimestamp: true,
  confirmClear: true,
  confirmDelete: true,
  charEncoding: 'utf-8',
  bufferTime: 50,
  echoSend: false,
  longCommandThreshold: 80,
  fontSize: 14
}
```

`loadFromStorage` 的 return 对象末尾新增(在 `longCommandThreshold` 之后):
```ts
      longCommandThreshold:
        typeof s.longCommandThreshold === 'number' && s.longCommandThreshold > 0
          ? s.longCommandThreshold
          : 80,
      fontSize:
        typeof s.fontSize === 'number' && s.fontSize >= 12 && s.fontSize <= 20
          ? s.fontSize
          : 14
```

`reset()` 无需改动(它 `set({ ...DEFAULTS })`,已含 fontSize)。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/settings-store.test.ts`
Expected: PASS(4 个用例)

- [ ] **Step 5: typecheck + 提交**

Run: `npm run typecheck`
Expected: 无错误

```bash
git add src/shared/store/settings.ts test/settings-store.test.ts
git commit -m "feat(settings): add fontSize field to settings store"
```

---

## Task 2: shortcuts 数据表 + 平台展示 + 纯按键处理函数

**Files:**
- Create: `src/features/settings/shortcuts.ts`
- Test: `test/settings-shortcuts.test.ts`

> **设计说明**:vitest 为 `node` 环境(无 `window`/`@testing-library/react`)。为使快捷键逻辑可单测,把按键判定抽成**纯函数** `handleShortcutKey(event, actions)`,返回是否命中(`true`=已处理并应 preventDefault)。Task 6 的 hook 只负责把该函数接到 `window.addEventListener` 上,不再含可测逻辑。这样所有按键行为在此 Task 用纯函数测,无需 React 渲染器。

- [ ] **Step 1: 写失败测试**

创建 `test/settings-shortcuts.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  SHORTCUTS,
  isMac,
  getDisplayCombo,
  handleShortcutKey,
  type ShortcutActions
} from '@/features/settings/shortcuts'

describe('shortcuts data table', () => {
  it('包含 5 条快捷键', () => {
    expect(SHORTCUTS).toHaveLength(5)
  })

  it('每条都有 id/label/combo', () => {
    for (const s of SHORTCUTS) {
      expect(s.id).toBeTruthy()
      expect(s.label).toBeTruthy()
      expect(s.combo).toBeTruthy()
    }
  })

  it('包含打开设置 Ctrl+,', () => {
    expect(SHORTCUTS.some((s) => s.id === 'settings' && s.combo === 'Ctrl+,')).toBe(true)
  })
})

describe('isMac', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: '' })
  })

  it('Mac 平台返回 true', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' })
    expect(isMac()).toBe(true)
  })

  it('Win 平台返回 false', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' })
    expect(isMac()).toBe(false)
  })
})

describe('getDisplayCombo', () => {
  it('Mac 下使用 platformCombo', () => {
    const s = { id: 'x', label: '侧边栏', combo: 'Ctrl+B', platformCombo: '⌘B' }
    expect(getDisplayCombo(s, true)).toBe('⌘B')
  })

  it('非 Mac 使用 combo', () => {
    const s = { id: 'x', label: '侧边栏', combo: 'Ctrl+B', platformCombo: '⌘B' }
    expect(getDisplayCombo(s, false)).toBe('Ctrl+B')
  })

  it('无 platformCombo 时回退到 combo', () => {
    const s = { id: 'x', label: '全屏', combo: 'F11' }
    expect(getDisplayCombo(s, true)).toBe('F11')
  })
})

// 构造最小 KeyboardEvent-like 对象(纯函数不依赖 DOM 事件构造器)
function key(opts: {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  target?: unknown
}): KeyboardEvent {
  return {
    key: opts.key,
    ctrlKey: !!opts.ctrlKey,
    metaKey: !!opts.metaKey,
    shiftKey: !!opts.shiftKey,
    altKey: !!opts.altKey,
    target: (opts.target ?? null) as EventTarget,
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent
}

describe('handleShortcutKey', () => {
  const actions: ShortcutActions = {
    openSettings: vi.fn(),
    toggleDark: vi.fn(),
    toggleFullscreen: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Ctrl+, 命中并调用 openSettings', () => {
    const e = key({ key: ',', ctrlKey: true })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.openSettings).toHaveBeenCalledTimes(1)
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('Cmd+, 命中(mac 用 metaKey)', () => {
    const e = key({ key: ',', metaKey: true })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.openSettings).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Shift+L 命中并调用 toggleDark', () => {
    const e = key({ key: 'L', ctrlKey: true, shiftKey: true })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.toggleDark).toHaveBeenCalledTimes(1)
  })

  it('F11 命中并调用 toggleFullscreen', () => {
    const e = key({ key: 'F11' })
    expect(handleShortcutKey(e, actions)).toBe(true)
    expect(actions.toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('未命中组合返回 false 且不调用任何 action', () => {
    const e = key({ key: 'x', ctrlKey: true })
    expect(handleShortcutKey(e, actions)).toBe(false)
    expect(actions.openSettings).not.toHaveBeenCalled()
    expect(actions.toggleDark).not.toHaveBeenCalled()
    expect(actions.toggleFullscreen).not.toHaveBeenCalled()
  })

  it('输入框 target 时不拦截(返回 false)', () => {
    const inputEl = { tagName: 'INPUT' } as HTMLElement
    const e = key({ key: ',', ctrlKey: true, target: inputEl })
    expect(handleShortcutKey(e, actions)).toBe(false)
    expect(actions.openSettings).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/settings-shortcuts.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 shortcuts.ts(数据表 + 平台检测 + 纯按键函数)**

创建 `src/features/settings/shortcuts.ts`(此 Task 只写纯逻辑,hook 在 Task 6 实现):

```ts
/**
 * 快捷键只读数据表 + 按键处理 + 全局监听 hook(Task 6)。
 * 数据表驱动「快捷键」分区 UI;handleShortcutKey 是纯函数,便于在 node 环境单测。
 *
 * 注意:`Ctrl+B`(侧边栏)已存在于 sidebar.tsx,此处不重复监听。
 */

export interface ShortcutDef {
  id: string
  label: string
  /** win/linux 展示用,如 "Ctrl+B" */
  combo: string
  /** mac 展示用,如 "⌘B";无则回退 combo */
  platformCombo?: string
}

/** 快捷键只读清单(驱动「快捷键」分区)。 */
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'sidebar', label: '切换侧边栏', combo: 'Ctrl+B', platformCombo: '⌘B' },
  { id: 'settings', label: '打开设置', combo: 'Ctrl+,', platformCombo: '⌘,' },
  { id: 'theme', label: '切换夜间模式', combo: 'Ctrl+Shift+L', platformCombo: '⌘⇧L' },
  { id: 'fullscreen', label: '切换全屏', combo: 'F11' },
  { id: 'close', label: '关闭设置', combo: 'Esc' }
]

/** 是否为 Mac 平台(决定快捷键展示用 ⌘ 还是 Ctrl)。 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || '')
}

/** 根据平台返回展示用组合键字符串。 */
export function getDisplayCombo(s: ShortcutDef, mac: boolean): string {
  if (mac && s.platformCombo) return s.platformCombo
  return s.combo
}

/** handleShortcutKey 触发的动作集合(由调用方提供具体实现)。 */
export interface ShortcutActions {
  openSettings: () => void
  toggleDark: () => void
  toggleFullscreen: () => void
}

/** 判断事件 target 是否为可编辑元素(输入框/文本域/选择框/contenteditable)。 */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/**
 * 纯按键处理函数。返回 true 表示命中快捷键(调用方应 preventDefault)。
 * - Ctrl/Cmd+,  → openSettings
 * - Ctrl/Cmd+Shift+L → toggleDark
 * - F11 → toggleFullscreen
 * 输入框聚焦时不拦截。不含 Ctrl+B(侧边栏由 sidebar.tsx 处理)。
 */
export function handleShortcutKey(e: KeyboardEvent, actions: ShortcutActions): boolean {
  if (isEditableTarget(e)) return false
  const mod = e.ctrlKey || e.metaKey

  // Ctrl/Cmd+, 打开设置(无 shift/alt)
  if (mod && !e.shiftKey && !e.altKey && e.key === ',') {
    e.preventDefault()
    actions.openSettings()
    return true
  }
  // Ctrl/Cmd+Shift+L 切换夜间
  if (mod && e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
    e.preventDefault()
    actions.toggleDark()
    return true
  }
  // F11 切换全屏
  if (!mod && !e.shiftKey && !e.altKey && e.key === 'F11') {
    e.preventDefault()
    actions.toggleFullscreen()
    return true
  }
  return false
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/settings-shortcuts.test.ts`
Expected: PASS(13 个用例:数据表3 + isMac2 + getDisplayCombo3 + handleShortcutKey5)

- [ ] **Step 5: typecheck + 提交**

Run: `npm run typecheck`

```bash
git add src/features/settings/shortcuts.ts test/settings-shortcuts.test.ts
git commit -m "feat(settings): add shortcuts table, platform detection, key handler"
```

---

## Task 3: ToggleRow 通用组件

**Files:**
- Create: `src/features/settings/ToggleRow.tsx`

(纯展示组件,无逻辑,不单独测试;随分区组件的渲染测试覆盖。)

- [ ] **Step 1: 实现 ToggleRow**

创建 `src/features/settings/ToggleRow.tsx`(从现有 `SettingsForm.tsx:16-25` 抽出,接口不变):

```tsx
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface ToggleRowProps {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}

/** 单个开关行:Label + Switch 横向两端对齐(各分区复用)。 */
export function ToggleRow({ id, label, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
```

- [ ] **Step 2: typecheck + 提交**

Run: `npm run typecheck`
Expected: 无错误

```bash
git add src/features/settings/ToggleRow.tsx
git commit -m "feat(settings): extract ToggleRow shared component"
```

---

## Task 4: General / Serial / About 分区组件

**Files:**
- Create: `src/features/settings/sections/GeneralSection.tsx`
- Create: `src/features/settings/sections/SerialSection.tsx`
- Create: `src/features/settings/sections/AboutSection.tsx`

(这三个分区逻辑直接从现有 SettingsForm 迁移,纯展示 + store 读写,合并为一个 Task。)

- [ ] **Step 1: 实现 GeneralSection**

创建 `src/features/settings/sections/GeneralSection.tsx`:

```tsx
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/button'
import { ToggleRow } from '../ToggleRow'
import { useSettingsStore, type SettingKey } from '@/shared/store/settings'

/** 通用分区:全屏 / 清除确认 / 删除确认 + 重置全部为默认。 */
export function GeneralSection() {
  const { fullscreen, confirmClear, confirmDelete } = useSettingsStore(
    useShallow((s) => ({
      fullscreen: s.fullscreen,
      confirmClear: s.confirmClear,
      confirmDelete: s.confirmDelete
    }))
  )
  const setField = useSettingsStore((s) => s.setField)
  const reset = useSettingsStore((s) => s.reset)
  const toggle = (key: SettingKey) => (v: boolean) => setField(key, v)

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">通用</h3>
      <p className="text-xs text-muted-foreground mb-2">界面行为与操作确认</p>
      <ToggleRow id="fullscreen" label="全屏模式" checked={fullscreen} onCheckedChange={toggle('fullscreen')} />
      <ToggleRow id="confirmClear" label="清除前确认" checked={confirmClear} onCheckedChange={toggle('confirmClear')} />
      <ToggleRow id="confirmDelete" label="删除前确认" checked={confirmDelete} onCheckedChange={toggle('confirmDelete')} />
      <div className="mt-4 flex justify-end">
        <Button variant="destructive" size="sm" onClick={() => reset()}>
          重置全部为默认
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 实现 SerialSection**

创建 `src/features/settings/sections/SerialSection.tsx`(迁移自 `SettingsForm.tsx` 的开关/编码/缓冲部分):

```tsx
import { useShallow } from 'zustand/react/shallow'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleRow } from '../ToggleRow'
import { useSettingsStore, type SettingKey } from '@/shared/store/settings'

const ENCODINGS = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'gbk', label: 'GBK' },
  { value: 'gb2312', label: 'GB2312' },
  { value: 'big5', label: 'Big5' }
]

/** 串口分区:时间戳 / 回显 / 字符编码 / 接收缓冲。 */
export function SerialSection() {
  const { rxTimestamp, txTimestamp, echoSend, charEncoding, bufferTime } = useSettingsStore(
    useShallow((s) => ({
      rxTimestamp: s.rxTimestamp,
      txTimestamp: s.txTimestamp,
      echoSend: s.echoSend,
      charEncoding: s.charEncoding,
      bufferTime: s.bufferTime
    }))
  )
  const setField = useSettingsStore((s) => s.setField)
  const toggle = (key: SettingKey) => (v: boolean) => setField(key, v)

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">串口</h3>
      <p className="text-xs text-muted-foreground mb-2">收发显示与编码</p>
      <ToggleRow id="rxTimestamp" label="接收时间戳" checked={rxTimestamp} onCheckedChange={toggle('rxTimestamp')} />
      <ToggleRow id="txTimestamp" label="发送时间戳" checked={txTimestamp} onCheckedChange={toggle('txTimestamp')} />
      <ToggleRow id="echoSend" label="发送回显" checked={echoSend} onCheckedChange={toggle('echoSend')} />

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="charEncoding" className="text-sm font-normal">
          字符编码
        </Label>
        <Select value={charEncoding} onValueChange={(v) => setField('charEncoding', v)}>
          <SelectTrigger id="charEncoding" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENCODINGS.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="bufferTime" className="text-sm font-normal">
          接收缓冲(ms)
        </Label>
        <Input
          id="bufferTime"
          type="number"
          min={0}
          value={bufferTime}
          onChange={(e) => setField('bufferTime', Math.max(0, Number(e.target.value) || 0))}
          className="w-24"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 实现 AboutSection**

创建 `src/features/settings/sections/AboutSection.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useIPC } from '@/shared/ipc'

/** 关于分区:应用名 / 版本 / 描述 / 打开更新日志。版本号经 IPC 懒加载。 */
export function AboutSection() {
  const ipc = useIPC()
  const [version, setVersion] = useState('—')

  useEffect(() => {
    let alive = true
    ipc.app.getVersion().then((v) => {
      if (alive) setVersion(v)
    })
    return () => {
      alive = false
    }
  }, [ipc])

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">关于</h3>
      <p className="text-xs text-muted-foreground mb-2">应用信息</p>

      <dl className="text-sm">
        <div className="flex justify-between py-2 border-b border-border/50">
          <dt className="text-muted-foreground">应用名称</dt>
          <dd>SAEcom</dd>
        </div>
        <div className="flex justify-between py-2 border-b border-border/50">
          <dt className="text-muted-foreground">版本</dt>
          <dd>v{version}</dd>
        </div>
        <div className="flex justify-between py-2 border-b border-border/50">
          <dt className="text-muted-foreground">描述</dt>
          <dd>基于Electron开发的多面板串口助手</dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={() => ipc.changelog.open()}>
          打开更新日志
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: typecheck + 提交**

Run: `npm run typecheck`
Expected: 无错误

```bash
git add src/features/settings/sections/
git commit -m "feat(settings): add General/Serial/About sections"
```

---

## Task 5: Appearance + Shortcuts 分区组件

**Files:**
- Create: `src/features/settings/sections/AppearanceSection.tsx`
- Create: `src/features/settings/sections/ShortcutsSection.tsx`

- [ ] **Step 1: 实现 AppearanceSection**

创建 `src/features/settings/sections/AppearanceSection.tsx`(含新增的字体大小):

```tsx
import { useShallow } from 'zustand/react/shallow'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleRow } from '../ToggleRow'
import { useSettingsStore } from '@/shared/store/settings'

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20]

/** 外观分区:夜间模式 + 字体大小(写 --font-size-base 到 <html>)。 */
export function AppearanceSection() {
  const { dark, fontSize } = useSettingsStore(
    useShallow((s) => ({ dark: s.dark, fontSize: s.fontSize }))
  )
  const setField = useSettingsStore((s) => s.setField)

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">外观</h3>
      <p className="text-xs text-muted-foreground mb-2">主题与显示</p>
      <ToggleRow id="dark" label="夜间模式" checked={dark} onCheckedChange={(v) => setField('dark', v)} />

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="fontSize" className="text-sm font-normal">
          字体大小
        </Label>
        <Select value={String(fontSize)} onValueChange={(v) => setField('fontSize', Number(v))}>
          <SelectTrigger id="fontSize" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 实现 ShortcutsSection**

创建 `src/features/settings/sections/ShortcutsSection.tsx`(只读清单):

```tsx
import { SHORTCUTS, isMac, getDisplayCombo } from '../shortcuts'

/** 快捷键分区:只读清单(按平台展示组合键)。 */
export function ShortcutsSection() {
  const mac = isMac()
  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">快捷键</h3>
      <p className="text-xs text-muted-foreground mb-2">键盘快捷操作</p>
      <dl className="text-sm">
        {SHORTCUTS.map((s) => (
          <div key={s.id} className="flex justify-between py-2 border-b border-border/50">
            <dt className="text-muted-foreground">{s.label}</dt>
            <dd className="font-mono">{getDisplayCombo(s, mac)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
```

- [ ] **Step 3: typecheck + 提交**

Run: `npm run typecheck`
Expected: 无错误

```bash
git add src/features/settings/sections/AppearanceSection.tsx src/features/settings/sections/ShortcutsSection.tsx
git commit -m "feat(settings): add Appearance and Shortcuts sections"
```

---

## Task 6: useGlobalShortcuts hook(薄封装)

**Files:**
- Modify: `src/features/settings/shortcuts.ts`(追加 hook)

> **说明**:按键判定逻辑已在 Task 2 的纯函数 `handleShortcutKey` 中实现并测过。本 Task 的 hook 只是把它接到 `window.addEventListener('keydown')` 上,无可测分支。SAEcom 的 vitest 是 `node` 环境且无 `@testing-library/react`,不在此渲染 hook;改由 Task 10 的手动验证覆盖。仅靠 typecheck 保证类型正确。

- [ ] **Step 1: 实现 hook**

在 `src/features/settings/shortcuts.ts` 顶部 import 区新增(若已有则合并):
```ts
import { useEffect } from 'react'
import { useSettingsStore } from '@/shared/store/settings'
```

在文件末尾追加 hook:

```ts
/**
 * 全局快捷键监听。在主窗口顶层挂一次。
 * 按键判定委托给纯函数 handleShortcutKey(已单测),此处只负责挂/卸监听。
 * - Ctrl/Cmd+,  打开设置
 * - Ctrl/Cmd+Shift+L 切换夜间模式
 * - F11 切换全屏
 *
 * Ctrl+B(侧边栏)由 sidebar.tsx 自行处理,不在此重复。
 */
export function useGlobalShortcuts({ onOpenSettings }: { onOpenSettings: () => void }) {
  useEffect(() => {
    const actions: ShortcutActions = {
      openSettings: onOpenSettings,
      toggleDark: () => useSettingsStore.getState().setField('dark', !useSettingsStore.getState().dark),
      toggleFullscreen: () =>
        useSettingsStore.getState().setField('fullscreen', !useSettingsStore.getState().fullscreen)
    }
    const onKey = (e: KeyboardEvent) => {
      handleShortcutKey(e, actions)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenSettings])
}
```

> 注意:`toggleDark`/`toggleFullscreen` 内每次都用 `useSettingsStore.getState()` 取最新值(而非闭包快照),确保 toggle 时拿到当前值;`setField` 是 store 自身稳定方法。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/features/settings/shortcuts.ts
git commit -m "feat(settings): add useGlobalShortcuts hook wiring handleShortcutKey"
```

---

## Task 7: SettingsNav + SettingsContent

**Files:**
- Create: `src/features/settings/SettingsNav.tsx`
- Create: `src/features/settings/SettingsContent.tsx`

- [ ] **Step 1: 定义分区类型与导航**

创建 `src/features/settings/SettingsNav.tsx`:

```tsx
import { cn } from '@/lib/utils'

/** 设置分区 id(导航与内容区共用)。 */
export type SettingsSection = 'general' | 'appearance' | 'serial' | 'shortcuts' | 'about'

const NAV_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: '通用' },
  { id: 'appearance', label: '外观' },
  { id: 'serial', label: '串口' },
  { id: 'shortcuts', label: '快捷键' },
  { id: 'about', label: '关于' }
]

interface SettingsNavProps {
  active: SettingsSection
  onChange: (id: SettingsSection) => void
}

/** 左侧导航:5 个分区,点击切换,当前项高亮。 */
export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <nav className="flex w-40 flex-col gap-1 border-r border-border/50 p-2">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            'rounded-md px-3 py-2 text-left text-sm transition-colors',
            active === item.id
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: 实现 SettingsContent**

创建 `src/features/settings/SettingsContent.tsx`:

```tsx
import { GeneralSection } from './sections/GeneralSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { SerialSection } from './sections/SerialSection'
import { ShortcutsSection } from './sections/ShortcutsSection'
import { AboutSection } from './sections/AboutSection'
import type { SettingsSection } from './SettingsNav'

interface SettingsContentProps {
  section: SettingsSection
}

/** 右侧内容区:按当前分区渲染对应组件。 */
export function SettingsContent({ section }: SettingsContentProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      {section === 'general' && <GeneralSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'serial' && <SerialSection />}
      {section === 'shortcuts' && <ShortcutsSection />}
      {section === 'about' && <AboutSection />}
    </div>
  )
}
```

- [ ] **Step 3: 确认 cn / lib/utils 存在**

Run: `node -e "require.resolve('./src/lib/utils'); console.log('OK')"`
Expected: OK(SAEcom 的 shadcn 组件均用 `cn`,该模块必然存在。)

- [ ] **Step 4: typecheck + 提交**

Run: `npm run typecheck`

```bash
git add src/features/settings/SettingsNav.tsx src/features/settings/SettingsContent.tsx
git commit -m "feat(settings): add SettingsNav and SettingsContent"
```

---

## Task 8: 重构 SettingsDialog + 删除 SettingsForm

**Files:**
- Modify: `src/features/settings/SettingsDialog.tsx`
- Delete: `src/features/settings/SettingsForm.tsx`

- [ ] **Step 1: 重写 SettingsDialog**

替换 `src/features/settings/SettingsDialog.tsx` 全部内容:

```tsx
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import { SettingsNav, type SettingsSection } from './SettingsNav'
import { SettingsContent } from './SettingsContent'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * zcode 风格设置对话框:左导航 + 右分区,沿用 shadcn Dialog(加宽 max-w-2xl)。
 * 副作用 effect 监听关键字段:
 * - dark → ipc.theme.set + documentElement .dark class
 * - fullscreen → ipc.window.setFullscreen
 * - fontSize → documentElement --font-size-base
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const ipc = useIPC()
  const dark = useSettingsStore((s) => s.dark)
  const fullscreen = useSettingsStore((s) => s.fullscreen)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const [section, setSection] = useState<SettingsSection>('general')

  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', !!dark)
    el.classList.toggle('theme-dark', !!dark)
    ipc.theme.set(!!dark)
  }, [dark, ipc])

  useEffect(() => {
    ipc.window.setFullscreen(!!fullscreen)
  }, [fullscreen, ipc])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
  }, [fontSize])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="border-b border-border/50 px-4 py-3">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <div className="flex" style={{ minHeight: '420px' }}>
          <SettingsNav active={section} onChange={setSection} />
          <ScrollArea className="flex-1">
            <SettingsContent section={section} />
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 删除旧 SettingsForm**

Run: `git rm src/features/settings/SettingsForm.tsx`

- [ ] **Step 3: 确认无残留引用**

Run: `grep -rn "SettingsForm" src/ test/`
Expected: 无输出(若 Sidebar.tsx 之前直接 import 了 SettingsForm 不会有——它只被 SettingsDialog 引用)

- [ ] **Step 4: typecheck + 全量测试**

Run: `npm run typecheck && npm test`
Expected: typecheck 无错误;测试全绿(含新增 store/shortcuts 测试)

- [ ] **Step 5: 提交**

```bash
git add src/features/settings/SettingsDialog.tsx
git commit -m "feat(settings): rebuild SettingsDialog as nav+sections, drop SettingsForm"
```

---

## Task 9: Sidebar 接入全局快捷键

**Files:**
- Modify: `src/features/main-window/components/Sidebar.tsx`

- [ ] **Step 1: 在 Sidebar 挂载 useGlobalShortcuts**

修改 `src/features/main-window/components/Sidebar.tsx`:

在顶部 import 区新增:
```tsx
import { useGlobalShortcuts } from '@/features/settings/shortcuts'
```

在组件函数体中(已有的 `const [settingsOpen, setSettingsOpen] = useState(false)` 附近)新增:
```tsx
  useGlobalShortcuts({ onOpenSettings: () => setSettingsOpen(true) })
```

(此处 `setSettingsOpen` 已是 `Ctrl+,` 要调用的目标——打开设置。Sidebar 已在底部渲染 `<SettingsDialog open={settingsOpen} .../>`,无需改动。)

- [ ] **Step 2: typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 全绿

- [ ] **Step 3: 提交**

```bash
git add src/features/main-window/components/Sidebar.tsx
git commit -m "feat(settings): wire Ctrl+, to open settings via global shortcuts"
```

---

## Task 10: 字体大小 CSS 变量接入 + 手动验证

**Files:**
- Modify: `src/styles/globals.css`

> **背景**:字体大小通过写 `--font-size-base` 到 `<html>` 生效(Task 8 已实现 effect)。但要让全局字号真正跟随,需让基础字号引用该变量。若现有样式大量使用固定 px,本 Task 让 `<html>` / `body` 的 font-size 引用该变量作为基准,其余 rem/相对单位会自然跟随。

- [ ] **Step 1: 检查现状**

Run: `grep -n "font-size" src/styles/globals.css | head`
查看 `:root` / `body` 区块的 font-size 设置,确认当前基准。

- [ ] **Step 2: 让 body font-size 引用变量**

在 `src/styles/globals.css` 的 `:root`(或 `@layer base` 的 body 规则)中,确保 body 的 font-size 引用变量并给默认值。找到 body 或 :root 的 font-size 规则,改为:

```css
:root {
  --font-size-base: 14px;
}

body {
  font-size: var(--font-size-base);
}
```

(若已有 `:root { ... }`,在其中新增 `--font-size-base: 14px;` 这一行;若已有 `body { font-size: ... }`,把值改为 `var(--font-size-base)`。不要破坏其他变量如 `--radius`、`--font-sans`。)

- [ ] **Step 3: 手动验证(记录到 PR)**

启动 `npm run dev`,验证:
1. 设置面板 5 个分区切换正常,默认显示「通用」
2. 「外观」改字体大小为 20px,主窗口整体字号变大;改回 14px 恢复
3. 「通用」点「重置全部为默认」,字体大小与其他项恢复默认
4. `Ctrl+,` 打开设置;`Ctrl+Shift+L` 切夜间;`F11` 切全屏
5. 在「串口」接收缓冲输入框聚焦时,按 Ctrl+, 不触发(不被拦截)
6. 「关于」显示 v0.6.0,「打开更新日志」按钮打开 changelog 窗
7. 关闭设置(×/Esc/遮罩)正常

- [ ] **Step 4: typecheck + 全量测试 + 提交**

Run: `npm run typecheck && npm test`
Expected: 全绿

```bash
git add src/styles/globals.css
git commit -m "feat(settings): wire --font-size-base to body for global font scaling"
```

---

## Self-Review 结果

**1. Spec coverage:**
- §3 总体架构 → Task 8(容器)+ Task 7(nav/content)+ Task 1(store)
- §4 分区内容 → Task 4(General/Serial/About)、Task 5(Appearance/Shortcuts)
- §5.1 store fontSize → Task 1 ✓
- §5.2 字体大小副作用 → Task 8(effect)+ Task 10(css 接入)✓
- §5.3 关于版本来源 → Task 4(AboutSection,`ipc.app.getVersion()`)✓
- §6 快捷键表 + hook → Task 2(表 + 纯函数)+ Task 6(薄 hook)✓
- §7 组件结构 → Task 3/4/5/7/8 ✓
- §7.2 无底部关闭按钮 → Task 8(DialogContent 不含 footer)✓
- Sidebar 接入 → Task 9 ✓

**2. Placeholder scan:** 无 TBD/TODO。Task 10 的 css 改动因依赖 grep 结果给了「找到则替换」的精确指令,并在 Step 1 先执行 grep 暴露真实现状,非占位。✓

**3. Type consistency:** `SettingsSection` 在 Task 7 定义、Task 8 使用一致;`useGlobalShortcuts({ onOpenSettings })` 签名在 Task 6 定义、Task 9 使用一致;`SHORTCUTS`/`isMac`/`getDisplayCombo`/`handleShortcutKey`/`ShortcutActions` 在 Task 2 定义、Task 5/6 使用一致。✓

**4. 测试环境适配(自审新发现):** vitest 为 `node` 环境(`vitest.config.ts:12`)、无 `window`/`localStorage`/`@testing-library/react`。已据此:
- Task 1 store 测试注入 localStorage shim(参照 `test/active-bridge.test.ts` 模式)✓
- Task 2 把按键判定抽成纯函数 `handleShortcutKey`,绕开「无 React 渲染器」限制,所有按键行为可测 ✓
- Task 6 hook 仅做监听接线,无可测分支,靠 typecheck + Task 10 手动验证 ✓
- 不引入新依赖(`@testing-library/react`)✓
