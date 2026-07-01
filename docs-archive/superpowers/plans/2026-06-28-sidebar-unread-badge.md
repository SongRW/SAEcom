# 侧栏面板行交互改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给侧栏面板行加"未读条数角标"，并把 3 个常驻操作按钮改为 hover 显 + 淡色 ⋮ 引导，再接入右键完整菜单。

**Architecture:** 数据层（`types`/`store`/`dataBus`）增加 `unread` 计数，计数并入 `appendChunk` 的同一次 `set` 以零额外渲染；判定"已读"复用现有 `panel.autoScroll`（语义=在底部）。UI 层（`PaneList`）加未读角标（纯函数 `formatUnread` 格式化 99+）、3 按钮改为 group-hover 显隐 + 淡色 ⋮ 常驻作发现信号、接入现有 `PaneContextMenu` 作右键补充入口。"点名称清零"靠 `setAutoScroll(id,true)` 触发 `DataDisplay` 既有滚动 effect，无需改 `DataDisplay`。

**Tech Stack:** React 19 + Zustand + Tailwind v4 (group-hover) + @phosphor-icons/react + Vitest (node env)。

**Spec:** `docs/superpowers/specs/2026-06-28-sidebar-unread-badge-design.md`

---

## File Structure

- **Modify** `src/features/serial-panel/types.ts` — `Panel` 增 `unread: number`
- **Modify** `src/features/serial-panel/paneViewModel.ts` — 新增纯函数 `formatUnread(n)`
- **Modify** `src/features/serial-panel/store.ts` — `genPanel` 初始化 unread；`appendChunk` 加 `opts.incrementUnread` 并入同次 set；`clearChunks`/`restoreChunks` 清零；接口签名更新
- **Modify** `src/features/serial-panel/dataBus.ts` — `appendWithBuffering` 判 `isRead`，主数据 appendChunk 传 `incrementUnread`
- **Modify** `src/features/serial-panel/components/PaneList.tsx` — 未读角标 + hover 显按钮 + ⋮ + handleToggle 清零 + 接入 PaneContextMenu
- **Create** `test/panel-unread.test.ts` — `formatUnread` + store unread 行为单测

**不改**：`DataDisplay.tsx`（`setAutoScroll(true)` 已能触发其既有 effect）、`FloatingPane.tsx`、持久化格式（unread 不入 config）、`PaneContextMenu.tsx`（原样复用）。

---

### Task 1: 纯函数 formatUnread + 测试

**Files:**
- Modify: `src/features/serial-panel/paneViewModel.ts`（末尾追加）
- Create: `test/panel-unread.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/panel-unread.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { formatUnread } from '@/features/serial-panel/paneViewModel'

describe('formatUnread', () => {
  it('0 返回 null（不显示角标）', () => {
    expect(formatUnread(0)).toBeNull()
  })
  it('1~99 返回数字字符串', () => {
    expect(formatUnread(1)).toBe('1')
    expect(formatUnread(50)).toBe('50')
    expect(formatUnread(99)).toBe('99')
  })
  it('超过 99 返回 "99+"', () => {
    expect(formatUnread(100)).toBe('99+')
    expect(formatUnread(9999)).toBe('99+')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/panel-unread.test.ts`
Expected: FAIL — `formatUnread is not a function`（尚未导出）

- [ ] **Step 3: 实现 formatUnread**

在 `src/features/serial-panel/paneViewModel.ts` 末尾追加：

```ts
/**
 * 未读条数 → 角标文本。0 不显示（返回 null）；1~99 返回数字；>99 返回 "99+"。
 * 对应 spec：侧栏未读角标显示上限 99+ 封顶。
 */
export function formatUnread(n: number): string | null {
  if (n <= 0) return null
  return n > 99 ? '99+' : String(n)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/panel-unread.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 提交**

```bash
git add src/features/serial-panel/paneViewModel.ts test/panel-unread.test.ts
git commit -m "feat(serial-panel): add formatUnread pure helper for unread badge"
```

---

### Task 2: Panel 类型增加 unread 字段

**Files:**
- Modify: `src/features/serial-panel/types.ts`

- [ ] **Step 1: 在 Panel 接口加 unread 字段**

在 `src/features/serial-panel/types.ts` 的 `Panel` interface 内，`z: number` 字段之前插入：

```ts
  /** 未读数据条数（隐藏/未在底部时收到的数据计数；不持久化，重启归零） */
  unread: number
```

- [ ] **Step 2: typecheck 确认（此时 store 未初始化该字段，预期报错）**

Run: `npm run typecheck`
Expected: FAIL — `unread` 缺失于 `genPanel` 返回对象（TS 报错，提示下一步）

> 此步是预期的中间态红灯，Task 3 修复。

- [ ] **Step 3: 提交（与 Task 3 合并提交，此处暂不单独 commit）**

跳过单独提交，继续 Task 3。

---

### Task 3: store 支持 unread 计数与清零

**Files:**
- Modify: `src/features/serial-panel/store.ts`
- Modify: `test/panel-unread.test.ts`（追加 store 测试）

- [ ] **Step 1: 写失败测试（store 行为）**

在 `test/panel-unread.test.ts` 顶部 import 区追加，并新增 store describe 块：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { formatUnread } from '@/features/serial-panel/paneViewModel'
import { usePanelsStore } from '@/features/serial-panel/store'

const mockConfig = {
  load: vi.fn(async () => []),
  save: vi.fn()
}
vi.mock('@/shared/ipc', () => ({
  getIPC: () => ({
    config: mockConfig,
    serial: { list: vi.fn(async () => []), open: vi.fn(), close: vi.fn(), write: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    panel: { saveLog: vi.fn() },
    logger: { pickFile: vi.fn(), append: vi.fn() },
    tcpShare: { start: vi.fn(), stop: vi.fn(), status: vi.fn() }
  })
}))

function seedPanel(overrides: Partial<{ hidden: boolean; autoScroll: boolean }> = {}) {
  usePanelsStore.setState({
    panels: {
      p1: {
        id: 'p1', name: 'COM1', note: '', type: 'serial' as const,
        options: { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' as const },
        open: false, viewMode: 'text' as const, pinned: false,
        hidden: overrides.hidden ?? false,
        geometry: { x: 0, y: 0, w: 400, h: 200 },
        chunks: [], textBuffer: '', hexBuffer: '',
        autoScroll: overrides.autoScroll ?? true,
        sendText: '',
        sendOptions: { append: 'CRLF' as const, hexMode: false, echoSend: true, bufferTime: 50 },
        logging: { active: false, path: null },
        limitView: false, limitCount: 1000, z: 10,
        unread: 0
      }
    },
    listOrder: ['p1'], activeId: null, zCounter: 0, loaded: true, knownPorts: []
  })
}

describe('panel unread counting', () => {
  beforeEach(() => {
    mockConfig.save.mockClear()
  })

  it('可见且在底部 → appendChunk 不增未读', () => {
    seedPanel({ hidden: false, autoScroll: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'hi', hex: 'hi', isEcho: false }, { incrementUnread: false })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('隐藏 → appendChunk 增未读（incrementUnread=true）', () => {
    seedPanel({ hidden: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'hi', hex: 'hi', isEcho: false }, { incrementUnread: true })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(1)
  })

  it('默认（无 opts）不增未读，向后兼容', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'hi', hex: 'hi', isEcho: false })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('clearChunks 清零未读', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'a', hex: 'a', isEcho: false }, { incrementUnread: true })
    usePanelsStore.getState().appendChunk('p1', { text: 'b', hex: 'b', isEcho: false }, { incrementUnread: true })
    expect(usePanelsStore.getState().panels.p1.unread).toBe(2)
    usePanelsStore.getState().clearChunks('p1')
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })

  it('restoreChunks 清零未读', () => {
    seedPanel()
    usePanelsStore.getState().appendChunk('p1', { text: 'a', hex: 'a', isEcho: false }, { incrementUnread: true })
    usePanelsStore.getState().restoreChunks('p1', [{ text: 'x', hex: 'x', isEcho: false }])
    expect(usePanelsStore.getState().panels.p1.unread).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/panel-unread.test.ts`
Expected: FAIL — `appendChunk` 第三参 `opts` 未识别 / `unread` 字段缺失

- [ ] **Step 3: genPanel 初始化 unread**

在 `src/features/serial-panel/store.ts` 的 `genPanel` 返回对象中，`z` 之前加（约第 46 行附近，`logging` 之后）：

```ts
    unread: 0,
```

- [ ] **Step 4: 更新接口签名**

在 `PanelsState` interface（约第 91 行）把 `appendChunk` 改为：

```ts
  /** 追加数据块（含裁剪）；opts.incrementUnread=true 时未读计数 +1（并入同一次 set） */
  appendChunk: (id: string, chunk: PanelChunk, opts?: { incrementUnread?: boolean }) => void
```

- [ ] **Step 5: appendChunk 实现并入 unread**

替换 `store.ts` 中现有 `appendChunk` action（约第 355 行）为：

```ts
    appendChunk(id, chunk, opts) {
      set((s) => {
        const p = s.panels[id]
        if (!p) return s
        const limit = p.limitView ? p.limitCount : CHUNK_LIMIT
        const trimmed = trimChunks([...p.chunks, chunk], p.textBuffer + chunk.text, p.hexBuffer + chunk.hex, limit)
        const unread = opts?.incrementUnread ? p.unread + 1 : p.unread
        return {
          panels: {
            ...s.panels,
            [id]: {
              ...p,
              chunks: trimmed.chunks,
              textBuffer: trimmed.textBuffer,
              hexBuffer: trimmed.hexBuffer,
              unread
            }
          }
        }
      })
    },
```

- [ ] **Step 6: clearChunks 清零**

替换 `store.ts` 中现有 `clearChunks` action（约第 380 行）为：

```ts
    clearChunks(id) {
      set((s) => {
        if (!s.panels[id]) return s
        return {
          panels: {
            ...s.panels,
            [id]: { ...s.panels[id], chunks: [], textBuffer: '', hexBuffer: '', unread: 0 }
          }
        }
      })
    },
```

- [ ] **Step 7: restoreChunks 清零**

替换 `store.ts` 中现有 `restoreChunks` action（约第 392 行）的 set 返回对象，在 `[id]` 对象内 `hexBuffer` 之后加 `unread: 0`：

```ts
    restoreChunks(id, chunks) {
      set((s) => {
        if (!s.panels[id]) return s
        const textBuffer = chunks.map((c) => c.text).join('')
        const hexBuffer = chunks.map((c) => c.hex).join('')
        const trimmed = trimChunks(chunks, textBuffer, hexBuffer, 1000)
        return {
          panels: {
            ...s.panels,
            [id]: { ...s.panels[id], chunks: trimmed.chunks, textBuffer: trimmed.textBuffer, hexBuffer: trimmed.hexBuffer, unread: 0 }
          }
        }
      })
    },
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npx vitest run test/panel-unread.test.ts`
Expected: PASS（formatUnread 4 + store 5 = 9 tests）

- [ ] **Step 9: typecheck 确认**

Run: `npm run typecheck`
Expected: PASS（Task 2 的红灯已消除）

- [ ] **Step 10: 提交**

```bash
git add src/features/serial-panel/types.ts src/features/serial-panel/store.ts test/panel-unread.test.ts
git commit -m "feat(serial-panel): track unread count in store, coalesced into appendChunk"
```

---

### Task 4: dataBus 传 incrementUnread

**Files:**
- Modify: `src/features/serial-panel/dataBus.ts`

- [ ] **Step 1: 在 appendWithBuffering 入口判定 isRead**

在 `src/features/serial-panel/dataBus.ts` 的 `appendWithBuffering` 函数内，紧接 `const panel = store.panels[id]`（约第 47 行）之后、`if (!store.panels[id]) return` 之前，无需改动；在 `if (!gates.current.has(id))`（约第 54 行）之前插入判定：

```ts
      // 已读判定：可见且在底部 → 收到的数据用户能看到，不计未读
      const isRead = !!panel && !panel.hidden && panel.autoScroll
```

- [ ] **Step 2: 主数据 appendChunk 传 incrementUnread**

定位 `dataBus.ts` 内 `appendChunk` 内部函数（约第 57 行 `const appendChunk = (withTs: boolean) => {`），其中调用 `store.appendChunk(id, { text: addText, hex: addHex, isEcho: false })`（约第 64 行）改为：

```ts
        store.appendChunk(id, { text: addText, hex: addHex, isEcho: false }, { incrementUnread: !isRead })
```

> 注意：`dataBus.ts` 内另两处 `appendChunk(id, { text: '\n', hex: '\n', isEcho: false })`（缓冲换行补行，约第 88、97 行）**保持不变**（不传 opts，默认不计未读 —— 换行补行属于上一批数据的尾，不算新数据条）。

- [ ] **Step 3: typecheck 确认**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 全量测试确认无回归**

Run: `npm test`
Expected: PASS（全部，含 panel-unread）

- [ ] **Step 5: 提交**

```bash
git add src/features/serial-panel/dataBus.ts
git commit -m "feat(serial-panel): increment unread in dataBus when panel hidden or not at bottom"
```

---

### Task 5: PaneList 未读角标 + 点名称清零

**Files:**
- Modify: `src/features/serial-panel/components/PaneList.tsx`

- [ ] **Step 1: 订阅 setAutoScroll + import formatUnread**

在 `PaneList.tsx` 顶部 import 区，`import { usePanelsStore } from '../store'` 之后追加：

```ts
import { formatUnread } from '../paneViewModel'
```

在组件内（约第 32 行 `const setHidden = usePanelsStore((s) => s.setHidden)` 之后）追加：

```ts
  const setAutoScroll = usePanelsStore((s) => s.setAutoScroll)
```

- [ ] **Step 2: handleToggle 改为"显示 + 滚底清零"**

替换 `PaneList.tsx` 中现有 `handleToggle`（约第 62-71 行）为：

```ts
  /**
   * 点击面板名：显示 + 置顶 + 滚到底（顺带清零未读）。
   * setAutoScroll(true) 触发 DataDisplay 既有滚动 effect：false→true 时 effect 重跑；
   * 从隐藏→显示时 FloatingPane 重挂载、DataDisplay 首次 effect 也会因 autoScroll=true 滚到底。
   * 不再承担"隐藏"（隐藏改由标题栏 Eye 按钮 / 右键菜单）。
   */
  function handleToggle(id: string) {
    setHidden(id, false)
    setActive(id)
    setAutoScroll(id, true)
  }
```

- [ ] **Step 3: 名字按钮内加未读角标**

替换 `PaneList.tsx` 中现有名字 `<button>`（约第 122-130 行）为：

```tsx
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-start gap-1 text-left"
                title={p.name + '（双击重命名）'}
                onClick={() => handleToggle(p.id)}
                onDoubleClick={() => handleRename(p.id, p.name)}
              >
                <span className="truncate">{p.name}</span>
                {(() => {
                  const badge = formatUnread(p.unread)
                  return badge ? (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
                      {badge}
                    </span>
                  ) : null
                })()}
              </button>
```

- [ ] **Step 4: 调整行容器 className（去掉旧 truncate 依赖，为 Task 6 的 hover 区留位）**

把 `panels.map` 内行 `<div>`（约第 95 行）的 className 中，名字按钮已是 `flex-1`，行容器 className 保持不变即可（无需改动）。仅确认行容器含 `group`——若无则在 className 字符串开头加 `group `。当前 className 为：

```tsx
              className={`flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-accent ${p.hidden ? 'opacity-50' : ''} ${overIndex === idx && dragIndex !== null && dragIndex !== idx ? 'border-t-2 border-primary' : ''} ${dragIndex === idx ? 'opacity-40' : ''}`}
```

改为（开头加 `group`，供 Task 6 的 hover 切换用）：

```tsx
              className={`group flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-accent ${p.hidden ? 'opacity-50' : ''} ${overIndex === idx && dragIndex !== null && dragIndex !== idx ? 'border-t-2 border-primary' : ''} ${dragIndex === idx ? 'opacity-40' : ''}`}
```

- [ ] **Step 5: typecheck 确认**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/features/serial-panel/components/PaneList.tsx
git commit -m "feat(serial-panel): show unread badge + clear on name click in PaneList"
```

---

### Task 6: hover 显按钮 + 淡色 ⋮ 引导

**Files:**
- Modify: `src/features/serial-panel/components/PaneList.tsx`

- [ ] **Step 1: import DotsThreeVertical**

把 `PaneList.tsx` 顶部 phosphor import（约第 3 行）改为：

```ts
import { Circle, Trash, Broom, PencilSimple, DotsThreeVertical } from '@phosphor-icons/react'
```

- [ ] **Step 2: 替换 3 个常驻按钮为 hover 显 + ⋮**

删除 `PaneList.tsx` 中现有的 3 个 `<Button>`（重命名/清空/删除，约第 131-157 行），替换为下面的整块（注意用固定宽度容器 w-[84px] 避免 hover 时布局跳动；⋮ 与按钮组叠放在同位置，group-hover 切换 opacity）：

```tsx
              <div className="relative flex h-6 w-[84px] shrink-0 items-center justify-end">
                {/* 默认态：淡色 ⋮（功能发现信号） */}
                <DotsThreeVertical
                  weight="bold"
                  className="pointer-events-none absolute right-0 size-5 text-muted-foreground opacity-100 transition-opacity group-hover:opacity-0"
                />
                {/* hover 态：3 个操作按钮 */}
                <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    title="重命名"
                    onClick={() => handleRename(p.id, p.name)}
                  >
                    <PencilSimple className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    title="清空数据"
                    onClick={() => handleClear(p.id, p.name)}
                  >
                    <Broom className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-destructive hover:text-destructive"
                    title="删除面板"
                    onClick={() => handleDelete(p.id, p.name)}
                  >
                    <Trash className="size-3.5" />
                  </Button>
                </div>
              </div>
```

- [ ] **Step 3: typecheck 确认**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src/features/serial-panel/components/PaneList.tsx
git commit -m "feat(serial-panel): reveal actions on hover with muted ⋮ as discovery cue"
```

---

### Task 7: 接入 PaneContextMenu（右键完整菜单）

**Files:**
- Modify: `src/features/serial-panel/components/PaneList.tsx`

- [ ] **Step 1: import 依赖**

在 `PaneList.tsx` 顶部 import 区追加：

```ts
import { useIPC } from '@/shared/ipc'
import { exportPanelLog } from '../exportLog'
import { PaneContextMenu } from './PaneContextMenu'
```

- [ ] **Step 2: 组件内订阅所需 store actions + ipc**

在 `PaneList.tsx` 组件内（约第 33 行附近，其它 store 订阅之后）追加：

```ts
  const ipc = useIPC()
  const setLogging = usePanelsStore((s) => s.setLogging)
```

- [ ] **Step 3: 用 PaneContextMenu + ContextMenuTrigger 包裹行**

把 `panels.map` 返回的行 `<div>...</div>`（Task 5/6 改造后的整块，从 `<div key={p.id} draggable ...>` 到其闭合 `</div>`）用 `PaneContextMenu` 包裹。

结构变为（仅示意包裹关系，内部行内容不变）：

```tsx
          {panels.map((p, idx) => (
            <PaneContextMenu
              key={p.id}
              panel={p}
              onToggleOpen={() => togglePanelOpen(p.id)}
              onToggleLogging={async () => {
                if (p.logging.active) {
                  setLogging(p.id, false, null)
                } else {
                  try {
                    const path = await ipc.logger.pickFile()
                    if (path) setLogging(p.id, true, path)
                  } catch {
                    /* web 预览无 ipc */
                  }
                }
              }}
              onExport={() => { void exportPanelLog(p) }}
              onPopout={() => {
                try {
                  ipc.panel.popout(
                    p.id,
                    p.name,
                    JSON.stringify(p.chunks),
                    p.pinned,
                    p.open,
                    p.viewMode,
                    JSON.stringify(p.options)
                  )
                  setHidden(p.id, true)
                } catch {
                  /* web 预览无 ipc */
                }
              }}
            >
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(idx) }}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== idx) reorderList(dragIndex, idx)
                  setDragIndex(null)
                  setOverIndex(null)
                }}
                onDragEnd={() => { setDragIndex(null); setOverIndex(null) }}
                className={`group flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-accent ${p.hidden ? 'opacity-50' : ''} ${overIndex === idx && dragIndex !== null && dragIndex !== idx ? 'border-t-2 border-primary' : ''} ${dragIndex === idx ? 'opacity-40' : ''}`}
              >
                {/* ...连接方块 button、名字+角标 button、hover 显按钮区（Task 5/6 内容原样保留）... */}
              </div>
            </PaneContextMenu>
          ))}
```

> 注意：`PaneContextMenu` 内部已是 `<ContextMenu><ContextMenuTrigger asChild>{children}</ContextMenuTrigger><ContextMenuContent>...</ContextMenuContent></ContextMenu>`，故 children 直接是行 `<div>`，`draggable` 等属性透传到 div。ContextMenuTrigger 不拦截 `dragstart`/`contextmenu` 之外的事件，拖拽排序不受影响。

- [ ] **Step 4: typecheck 确认**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: 全量测试确认无回归**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/features/serial-panel/components/PaneList.tsx
git commit -m "feat(serial-panel): attach PaneContextMenu to sidebar rows for full actions"
```

---

### Task 8: 全量验证 + 手测清单

**Files:** 无（仅验证）

- [ ] **Step 1: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: 全量测试**

Run: `npm test`
Expected: PASS（含新增 panel-unread.test.ts 9 tests）

- [ ] **Step 3: 启动开发环境手测**

Run: `npm run dev`，打开 React 主窗口，按 spec「验证」节逐项手测：

1. 新建串口面板并连接 → 默认行尾显示淡色 ⋮，名字占满宽度。
2. 面板可见且在底部，向串口发数据 → 未读角标始终不出现（已读）。
3. 在面板内向上滚动（离开底部）→ 再收数据，名字旁出现未读角标递增。
4. 点面板名（已显示）→ 自动滚到底，角标清零。
5. 右键面板行 → 弹出与工作区面板一致的完整菜单（记录/保留条数/复制/导出/隐藏/连接/弹窗/清空/删除/重命名）。
6. 菜单内"隐藏面板"→ 面板收起，行半透明；继续收数据 → 角标累积。
7. 点已隐藏面板名 → 显示 + 置顶 + 滚到底 + 角标清零。
8. hover 任意行 → ⋮ 淡出、3 个按钮（重命名/清空/删除）淡入；移开 → 变回 ⋮。
9. hover 出的按钮：重命名（双击亦可）、清空（按设置二次确认）、删除（二次确认）均生效。
10. 拖拽侧栏行排序正常；hover 显按钮、右键菜单三者不互相干扰。
11. 连续刷屏 → 角标显示 99+ 后静态不再增。
12. 长串口名 → 默认态名字区更宽可显示更多字符；hover 时按钮挤名字但仍可 hover tooltip 看全名。

- [ ] **Step 4: PR 说明列出行为变更**

在 PR 描述中明确两处用户可见行为变更：
- 点面板名从"切显隐"改为"显示 + 滚到底清零"；隐藏入口改由面板标题栏 Eye 按钮或右键菜单"隐藏面板"。
- 侧栏行的重命名/清空/删除从常驻按钮改为 hover 显 + 淡色 ⋮ 引导；右键补充完整操作。

---

## Self-Review

**Spec 覆盖**：
- 未读定义/已读清零/99+ → Task 1(formatUnread)、Task 3(store)、Task 4(dataBus isRead)、Task 5(角标) ✓
- 性能（并入同次 set）→ Task 3 Step 5 ✓
- hover 显按钮 + ⋮ 引导 → Task 6 ✓
- 右键复用 PaneContextMenu → Task 7 ✓
- 点名称清零交互 → Task 5 Step 2 ✓
- 长名字 tooltip → Task 5 Step 3 保留 title ✓
- 不改 DataDisplay → 经分析 setAutoScroll(true) 足够，plan 未改它 ✓
- 不入持久化 → persist 字段列表无 unread，Task 3 未加 ✓

**占位符扫描**：无 TBD/TODO；每步含完整代码。

**类型一致性**：`appendChunk(id, chunk, opts?)` 在接口(Task 3 Step4)、实现(Step5)、dataBus 调用(Task4 Step2)三处签名一致；`unread: number` 在 types(Task2)、genPanel(Task3 Step3)、测试 seedPanel 一致；`formatUnread` 导出(Task1)与调用(Task5)一致。
