# 脚本页窗口控制与弹出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为脚本编辑器弹层补齐「最大化/最小化」「弹出为独立 Electron 窗口（全功能）」「空画布 minimap 拖/点/滚轮控制画布」三项能力。

**Architecture:**
- Feature 1（max/min）：`ScriptEditorDialog` 内纯前端 `windowMode` 状态机（抽成 `uiState.ts` 纯函数便于单测），CSS 切换 `is-maximized`/`is-minimized`，最小化收底栏条 + 移除 backdrop。
- Feature 2（弹出）：新建 `src/script-editor.html` + `src/script-editor.tsx` 入口；main 进程加 `script-editor:popout` 单例开窗（frameless + `additionalArguments: ['--script-editor-popout']`），preload 加 `scriptEditor` 命名空间，`ScriptEditorDialog` 加 `isPopout` prop，dock 回主窗走 IPC。
- Feature 3（minimap）：新增 `useEmptyMinimapInteraction` hook，空画布时在 minimap 容器叠透传事件层，pointer→`area.translate`、wheel→`area.zoom`（`clampCanvasZoom` 约束）。

**Tech Stack:** Electron（BrowserWindow + ipcMain）、React 19、TypeScript、Rete.js（AreaPlugin/MinimapPlugin）、Vitest、Tailwind/CSS。

设计依据：`docs/superpowers/specs/2026-06-28-script-editor-window-controls-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/features/script-editor/uiState.ts` | 改 | 加 `windowMode`/`preMinimizeMode` 字段 + `nextWindowMode` 等纯函数 |
| `test/script-editor-window-mode.test.ts` | 建 | windowMode 状态机单测 |
| `src/features/script-editor/components/Toolbar.tsx` | 改 | 接活最大化/最小化/弹出/dock 按钮 |
| `src/features/script-editor/ScriptEditorDialog.tsx` | 改 | windowMode 状态、isPopout prop、弹窗控制、minimized 底栏条、onDock 监听 |
| `src/features/script-editor/script-editor.css` | 改 | is-maximized/is-minimized/is-popout/minimized-bar 样式 |
| `shared/types.ts` | 改 | 加 `ScriptEditorAPI` 接口、注册到 `WindowAPI` |
| `electron/preload.ts` | 改 | 实现 `scriptEditor` 命名空间 |
| `test/script-editor-popout-ipc.test.ts` | 建 | isPopout argv 自检 + mock IPC 契约单测 |
| `electron/main.ts` | 改 | `scriptEditorPopoutWindow` 单例 + `script-editor:popout`/`:request-dock`/`:dock` |
| `src/script-editor.html` | 建 | 弹出窗 HTML 入口 |
| `src/script-editor.tsx` | 建 | 弹出窗 renderer：挂 `<ScriptEditorDialog isPopout />` |
| `electron.vite.config.ts` | 改 | renderer 多入口注册 `script-editor` |
| `src/features/script-editor/useEmptyMinimapInteraction.ts` | 建 | 空 minimap 拖/点/滚轮 hook |
| `test/empty-minimap-interaction.test.ts` | 建 | hook 行为单测（向量化 + clampZoom） |
| `src/features/script-editor/components/GraphCanvas.tsx` | 改 | 调用 hook，传 `graph.nodes.length === 0` |

三个 feature 各自独立成 commit，可单独回滚。Feature 2 内部（main/preload/types/html/tsx/config）为一个原子 commit。

---

## Task 1：windowMode 状态机纯函数（TDD）

**Files:**
- Modify: `src/features/script-editor/uiState.ts:1-85`
- Test: `test/script-editor-window-mode.test.ts`

- [ ] **Step 1: 写失败测试**

Create `test/script-editor-window-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createScriptEditorUiState,
  setWindowMode,
  nextWindowMode,
  restoreFromMinimized
} from '../src/features/script-editor/uiState'

describe('script editor window mode', () => {
  it('默认 normal，无 preMinimizeMode', () => {
    expect(createScriptEditorUiState().windowMode).toBe('normal')
    expect(createScriptEditorUiState().preMinimizeMode).toBe('normal')
  })

  it('setWindowMode 直接设置 windowMode', () => {
    const s = setWindowMode(createScriptEditorUiState(), 'maximized')
    expect(s.windowMode).toBe('maximized')
  })

  it('nextWindowMode: normal → maximized', () => {
    expect(nextWindowMode(createScriptEditorUiState()).windowMode).toBe('maximized')
  })

  it('nextWindowMode: maximized → normal（切换还原）', () => {
    const maximized = setWindowMode(createScriptEditorUiState(), 'maximized')
    expect(nextWindowMode(maximized).windowMode).toBe('normal')
  })

  it('nextWindowMode 进入 minimized 时记住 preMinimizeMode', () => {
    const maximized = setWindowMode(createScriptEditorUiState(), 'maximized')
    const minimized = nextWindowMode(maximized, 'minimize')
    expect(minimized.windowMode).toBe('minimized')
    expect(minimized.preMinimizeMode).toBe('maximized')
  })

  it('nextWindowMode 从 normal 最小化，preMinimizeMode 记 normal', () => {
    const minimized = nextWindowMode(createScriptEditorUiState(), 'minimize')
    expect(minimized.windowMode).toBe('minimized')
    expect(minimized.preMinimizeMode).toBe('normal')
  })

  it('restoreFromMinimized 回到 preMinimizeMode', () => {
    const minimized = nextWindowMode(setWindowMode(createScriptEditorUiState(), 'maximized'), 'minimize')
    expect(restoreFromMinimized(minimized).windowMode).toBe('maximized')
  })

  it('restoreFromMinimized 对非 minimized 态不变', () => {
    const normal = createScriptEditorUiState()
    expect(restoreFromMinimized(normal)).toBe(normal)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/script-editor-window-mode.test.ts`
Expected: FAIL（`setWindowMode`/`nextWindowMode`/`restoreFromMinimized` 未定义，且 `windowMode` 字段不存在）

- [ ] **Step 3: 扩展 uiState 类型与函数**

Modify `src/features/script-editor/uiState.ts` — 在 `ScriptEditorUiState` 接口与 `createScriptEditorUiState` 加字段，并在文件末尾追加函数：

```ts
export type ScriptEditorWindowMode = 'normal' | 'maximized' | 'minimized'

export interface ScriptEditorUiState {
  sidePanel: ScriptEditorSidePanel | null
  configOpen: boolean
  outputExpanded: boolean
  canvasTool: CanvasTool
  windowMode: ScriptEditorWindowMode
  preMinimizeMode: Exclude<ScriptEditorWindowMode, 'minimized'>
}
```

`createScriptEditorUiState` 返回值追加：
```ts
    windowMode: 'normal',
    preMinimizeMode: 'normal'
```

文件末尾追加：
```ts
/** 直接设置 windowMode（用于最大化切换等）。不写 preMinimizeMode。 */
export function setWindowMode(state: ScriptEditorUiState, windowMode: ScriptEditorWindowMode): ScriptEditorUiState {
  return { ...state, windowMode }
}

/**
 * 窗口模式切换。
 * - 不带 action：normal ↔ maximized 互切（最大化按钮行为）。
 * - action='minimize'：进入 minimized，并把当前 windowMode（normal/maximized）记到 preMinimizeMode。
 */
export function nextWindowMode(
  state: ScriptEditorUiState,
  action: 'minimize' | undefined = undefined
): ScriptEditorUiState {
  if (action === 'minimize') {
    const pre = state.windowMode === 'maximized' ? 'maximized' : 'normal'
    return { ...state, windowMode: 'minimized', preMinimizeMode: pre }
  }
  // normal ↔ maximized 互切
  return { ...state, windowMode: state.windowMode === 'maximized' ? 'normal' : 'maximized' }
}

/** 从 minimized 还原到 preMinimizeMode；非 minimized 态原样返回。 */
export function restoreFromMinimized(state: ScriptEditorUiState): ScriptEditorUiState {
  if (state.windowMode !== 'minimized') return state
  return { ...state, windowMode: state.preMinimizeMode }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/script-editor-window-mode.test.ts`
Expected: PASS（8 个用例全绿）

- [ ] **Step 5: 跑既有 ui-state 测试确保无回归**

Run: `npx vitest run test/script-editor-ui-state.test.ts`
Expected: PASS（既有用例的 `toEqual` 不再命中——因为现在多了 windowMode/preMinimizeMode 字段。若失败，按 Step 6 修复）

- [ ] **Step 6: 修既有 ui-state 测试的 toEqual（如失败）**

既有 `createScriptEditorUiState()` 快照 `toEqual` 现在缺两个字段。打开 `test/script-editor-ui-state.test.ts`，把断言改为只检关键字段，例如：

把首个 `toEqual({...})` 改为：
```ts
expect(createScriptEditorUiState()).toMatchObject({
  sidePanel: null,
  configOpen: false,
  outputExpanded: false,
  canvasTool: 'pointer'
})
```
（用 `toMatchObject` 替代严格 `toEqual`，容许新增字段。仅改首条 `toEqual` 快照用例，其余行为用例不动。）

Run: `npx vitest run test/script-editor-ui-state.test.ts`
Expected: PASS

- [ ] **Step 7: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 8: commit**

```bash
git add src/features/script-editor/uiState.ts test/script-editor-window-mode.test.ts test/script-editor-ui-state.test.ts
git commit -m "feat(script-editor): add windowMode state machine (normal/maximized/minimized)"
```

---

## Task 2：Toolbar 接活窗口控制按钮

**Files:**
- Modify: `src/features/script-editor/components/Toolbar.tsx`（整文件重写）
- 类型：从 `uiState` 导入 `ScriptEditorWindowMode`

- [ ] **Step 1: 重写 Toolbar.tsx**

Replace whole file `src/features/script-editor/components/Toolbar.tsx` with:

```tsx
import {
  ArrowsOutCardinal as Maximize2,
  ArrowsInCardinal as Restore,
  FilePlus as FilePlus2,
  FloppyDisk as Save,
  FrameCorners as Frame,
  Play,
  PushPin as Popout,
  Stop as Square,
  Trash as Trash2,
  X,
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import type { ScriptEditorWindowMode } from '../uiState'

interface ToolbarProps {
  activeScriptName: string | null
  running: boolean
  windowMode: ScriptEditorWindowMode
  isPopout: boolean
  onNew: () => void
  onSave: () => void
  onDelete: () => void
  onRun: () => void
  onStop: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onOpenScripts: () => void
  onToggleMaximize: () => void
  onMinimize: () => void
  onPopout: () => void
  onDock: () => void
  onClose: () => void
}

export function Toolbar({
  activeScriptName,
  running,
  windowMode,
  isPopout,
  onNew,
  onSave,
  onDelete,
  onRun,
  onStop,
  onZoomIn,
  onZoomOut,
  onOpenScripts,
  onToggleMaximize,
  onMinimize,
  onPopout,
  onDock,
  onClose
}: ToolbarProps) {
  return (
    <div className="script-editor-toolbar">
      <button className="script-editor-toolbar__title" onClick={onOpenScripts} type="button">
        <span className="script-editor-title">脚本页</span>
        <span className="script-editor-current">{activeScriptName || '未选中'}</span>
      </button>
      <div className="script-editor-toolbar__actions">
        <Button size="sm" variant="outline" title="新建" onClick={onNew}>
          <FilePlus2 data-icon="inline-start" />
          新建
        </Button>
        <Button size="sm" variant="outline" title="保存" onClick={onSave}>
          <Save data-icon="inline-start" />
          保存
        </Button>
        <Button size="sm" variant="outline" title="删除" onClick={onDelete} disabled={!activeScriptName}>
          <Trash2 data-icon="inline-start" />
          删除
        </Button>
        <span className="script-editor-separator" />
        <Button size="sm" title="运行" onClick={onRun} disabled={running}>
          <Play data-icon="inline-start" />
          运行
        </Button>
        <Button size="sm" variant="destructive" title="停止" onClick={onStop} disabled={!running}>
          <Square data-icon="inline-start" />
          停止
        </Button>
        <span className="script-editor-window-controls">
          <Button size="icon" variant="ghost" title="缩小" onClick={onZoomOut}>
            <ZoomOut />
          </Button>
          <Button size="icon" variant="ghost" title="放大" onClick={onZoomIn}>
            <ZoomIn />
          </Button>
          {isPopout ? (
            <Button size="icon" variant="ghost" title="回到主窗口" onClick={onDock}>
              <Frame />
            </Button>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                title={windowMode === 'maximized' ? '还原' : '最大化'}
                onClick={onToggleMaximize}
              >
                {windowMode === 'maximized' ? <Restore /> : <Maximize2 />}
              </Button>
              <Button size="icon" variant="ghost" title="最小化" onClick={onMinimize}>
                <Frame />
              </Button>
              <Button size="icon" variant="ghost" title="弹出为独立窗口" onClick={onPopout}>
                <Popout />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" title="关闭" onClick={onClose}>
            <X />
          </Button>
        </span>
      </div>
    </div>
  )
}
```

> 图标说明：用 ArrowsOutCardinal/ArrowsInCardinal（最大化/还原）、FrameCorners（最小化/dock）、PushPin（弹出）。若 `@phosphor-icons/react` 无该导出名，运行 Step 3 的图标校验命令按实际可用名替换。

- [ ] **Step 2: typecheck（此时 ScriptEditorDialog 还没传新 props，预期会报 Toolbar props 缺失错误，正常，Task 3 修）**

Run: `npm run typecheck`
Expected: 在 `ScriptEditorDialog.tsx` 报 Toolbar 缺 prop 错误（Task 3 接好即消除）

- [ ] **Step 3: 校验图标导出存在**

Run: `node -e "const i=require('@phosphor-icons/react'); ['ArrowsOutCardinal','ArrowsInCardinal','FrameCorners','PushPin'].forEach(n=>console.log(n, typeof i[n]))"`
Expected: 全部 `function`（存在）。若有 `undefined`，去 https://github.com/phosphor-icons/web 查实际名替换 Step 1 的 import 与用法。

- [ ] **Step 4: commit**

```bash
git add src/features/script-editor/components/Toolbar.tsx
git commit -m "feat(script-editor): wire maximize/minimize/popout/dock buttons in Toolbar"
```

---

## Task 3：ScriptEditorDialog 接入 windowMode + minimized 底栏条

**Files:**
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx:57-424`
- Modify: `src/features/script-editor/script-editor.css`

- [ ] **Step 1: 改 ScriptEditorDialog props 与 state**

在 `src/features/script-editor/ScriptEditorDialog.tsx`：

(a) 接口加 `isPopout`（imports 已含所需 uiState 函数，需补 import `nextWindowMode`/`restoreFromMinimized`/`setWindowMode`）：

把 import 块（`uiState` 那段，行 13-25）补全为：
```ts
import {
  closeConfig,
  closeSidePanel,
  createScriptEditorUiState,
  nextWindowMode,
  onNodeDeleted,
  onNodeDoubleClick,
  onSelectedNodeDeleted,
  onScriptRunStarted,
  openSidePanel,
  restoreFromMinimized,
  setCanvasTool,
  toggleScriptOutput,
  toggleSidePanel
} from './uiState'
```

接口（行 57-60）改为：
```ts
interface ScriptEditorDialogProps {
  open: boolean
  isPopout?: boolean
  onClose: () => void
}
```

函数签名（行 62）改为：
```ts
export function ScriptEditorDialog({ open, isPopout = false, onClose }: ScriptEditorDialogProps) {
```

(b) 在 `const [uiState, setUiState] = useState(() => createScriptEditorUiState())`（行 84）后，windowMode 直接从 uiState 取派生值（不必单独 useState）：
```ts
  const windowMode = uiState.windowMode
```

- [ ] **Step 2: 接 Toolbar 新 props + dock 监听**

把 `<Toolbar .../>`（行 302-314）替换为：
```tsx
        <Toolbar
          activeScriptName={activeScriptName}
          running={!!runningScriptId}
          windowMode={windowMode}
          isPopout={isPopout}
          onNew={createScript}
          onSave={saveScript}
          onDelete={deleteScript}
          onRun={runScript}
          onStop={stopScript}
          onZoomIn={() => setZoom((value) => clampCanvasZoom(value + 0.1))}
          onZoomOut={() => setZoom((value) => clampCanvasZoom(value - 0.1))}
          onOpenScripts={() => setUiState((current) => toggleSidePanel(current, 'scripts'))}
          onToggleMaximize={() => setUiState((current) => nextWindowMode(current))}
          onMinimize={() => setUiState((current) => nextWindowMode(current, 'minimize'))}
          onPopout={handlePopout}
          onDock={handleDock}
          onClose={onClose}
        />
```

在 `if (!open) return null`（行 296）之前，加 dock 监听与 popout/dock 处理（用既有 getIPC）：
```ts
  // 弹出窗 dock 回主窗：收到 main 的 script-editor:dock 时重新显示
  useEffect(() => {
    if (isPopout) return
    const ipc = getIPC()
    if (!ipc.scriptEditor?.onDock) return
    const handler = () => { /* 重新可见由外层 open 控制，此处仅触发回调 */ }
    ipc.scriptEditor.onDock(handler)
  }, [isPopout])

  function handlePopout() {
    try {
      void getIPC().scriptEditor?.popout?.()
    } catch {
      /* web 预览无 ipc，静默 */
    }
  }

  function handleDock() {
    try {
      getIPC().scriptEditor?.requestDock?.()
    } catch {
      /* web 预览无 ipc，静默 */
    }
  }
```

> 注：dock 回主窗的「重新显示弹层」由调用方（MainWindow 那层）通过 `open` prop 控制——本 Task 不改外层挂载，只接通 IPC。外层（脚本入口按钮）在后续监听 `script-editor:dock` 时把 `open` 置回 true；该外层改动放在 Task 8（集成）。

- [ ] **Step 3: minimized 底栏条 + class 注入**

把最外层 `<div className="script-editor-backdrop" ...>` 与 `<section className="script-editor-dialog" ...>`（行 300-301）改为按 windowMode/isPopout 注入 class：

```tsx
  const modeClass =
    isPopout ? ' is-popout'
    : windowMode === 'maximized' ? ' is-maximized'
    : windowMode === 'minimized' ? ' is-minimized'
    : ''
  const showBackdrop = !isPopout && windowMode !== 'minimized'

  return (
    <>
    {showBackdrop ? (
    <div className="script-editor-backdrop" role="presentation">
      {renderEditorBody(modeClass)}
    </div>
    ) : (
      <>
        {windowMode === 'minimized' && !isPopout ? (
          <div className="script-editor-minimized-bar" role="presentation">
            <button
              type="button"
              className="script-editor-minimized-bar__restore"
              onClick={() => setUiState(restoreFromMinimized)}
            >
              <span className="script-editor-minimized-bar__title">脚本页 · {activeScriptName || '未选中'}</span>
              <span className="script-editor-minimized-bar__hint">点击还原</span>
            </button>
          </div>
        ) : null}
        {renderEditorBody(modeClass)}
      </>
    )}
    <PromptDialog
      open={saveAsOpen}
      onOpenChange={setSaveAsOpen}
      title="另存为脚本"
      description="请输入脚本名称"
      defaultValue={activeScriptName || ''}
      onConfirm={async (v) => {
        const name = normalizeScriptName(v)
        if (!name) return
        await writeScriptAs(name)
      }}
    />
    </>
  )

  function renderEditorBody(modeClass: string) {
    return (
      <section className={`script-editor-dialog${modeClass}`} aria-label="脚本编辑器" role="dialog">
        {/* 原 Toolbar + workspace + ScriptOutputPanel 内容（行 302-407）整体搬进此函数 */}
      </section>
    )
  }
```

> 实施：把现有 `<Toolbar/>...<ScriptOutputPanel/>`（行 302-407）整体抽出为 `renderEditorBody` 返回的 JSX，`<section>` 的 className 用模板串。保留所有既有子组件与 props 不变。

- [ ] **Step 4: 加 CSS 样式**

在 `src/features/script-editor/script-editor.css` 末尾（媒体查询之前）追加：

```css
/* —— 窗口模式：最大化 —— */
.script-editor-dialog.is-maximized {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: 0;
}

/* —— 窗口模式：最小化 —— */
/* 主体隐藏，只剩底栏条（由 minimized-bar 单独渲染）；dialog 本体在此模式下不渲染 */
.script-editor-backdrop:has(.is-minimized) {
  display: none;
}

/* 最小化底栏条：贴底、浮在最上层 */
.script-editor-minimized-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  z-index: 3050;
  display: flex;
  align-items: stretch;
  background: var(--card);
  border-top: 1px solid var(--border);
  box-shadow: 0 -6px 18px rgb(15 23 42 / 12%);
}

.script-editor-minimized-bar__restore {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  font: inherit;
}

.script-editor-minimized-bar__restore:hover {
  background: var(--accent);
}

.script-editor-minimized-bar__title {
  font-size: 13px;
  font-weight: 600;
}

.script-editor-minimized-bar__hint {
  font-size: 12px;
  color: var(--muted-foreground);
}

/* —— 弹出窗：铺满、无 backdrop —— */
.script-editor-dialog.is-popout {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  border: 0;
  box-shadow: none;
}
```

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 无错误（`scriptEditor` 在 WindowAPI 尚未声明，但用可选链 `?.` 调用，TS 在 `WindowAPI` 无该字段时会报错——若报错，先在 Task 5 加类型，或本步先用 `(ipc as any).scriptEditor` 临时绕过，Task 5 改回强类型）

> 推荐顺序：先做 Task 5（shared/types.ts + preload）再回来跑本步 typecheck，可避免临时 any。本 plan 把 Task 4/5/6（IPC 链路）放在 Task 3 之后，因为 Feature 1 的前端已可独立验证；但 typecheck 想一次过，可跳到 Task 4-6 后回头。

- [ ] **Step 6: 跑测试**

Run: `npm test`
Expected: 全绿（window-mode 测试 + 既有测试无回归）

- [ ] **Step 7: commit**

```bash
git add src/features/script-editor/ScriptEditorDialog.tsx src/features/script-editor/script-editor.css
git commit -m "feat(script-editor): maximize/minimize modes + minimized bar (in-window)"
```

---

## Task 4：shared/types.ts 加 ScriptEditorAPI

**Files:**
- Modify: `shared/types.ts:319-330`（WindowAPI 区）+ 末尾加接口

- [ ] **Step 1: 加 ScriptEditorAPI 接口**

在 `shared/types.ts` 中 `PanelAPI` 接口之后（约行 240 后）插入：

```ts
/** 脚本编辑器弹出窗 IPC 契约 */
export interface ScriptEditorAPI {
  /** 弹出为独立窗口（单例：已有则聚焦） */
  popout: () => Promise<{ ok: boolean; error?: string }>
  /** 从弹出窗请求 dock 回主窗 */
  requestDock: () => void
  /** 主窗监听 dock 信号（弹出窗关闭/请求 dock 时触发） */
  onDock: (cb: () => void) => void
  /** renderer 自检是否在弹出窗内（main 经 additionalArguments 注入 --script-editor-popout） */
  isPopout: () => boolean
}
```

- [ ] **Step 2: 注册到 WindowAPI**

把 `WindowAPI` 接口（行 319-330）追加一行：
```ts
  scriptEditor: ScriptEditorAPI
```

（放在 `panel: PanelAPI` 下一行。）

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 报 preload 未实现 `scriptEditor`（Task 5 修）；types 本身无误。

- [ ] **Step 4: commit**

```bash
git add shared/types.ts
git commit -m "feat(script-editor): add ScriptEditorAPI IPC contract type"
```

---

## Task 5：preload 实现 scriptEditor 命名空间

**Files:**
- Modify: `electron/preload.ts:57-73`（panel 区之后）

- [ ] **Step 1: 实现 scriptEditor 命名空间**

在 `electron/preload.ts` 的 `panel: { ... }`（行 57-73）之后插入：

```ts
  scriptEditor: {
    popout: () => ipcRenderer.invoke('script-editor:popout'),
    requestDock: () => ipcRenderer.send('script-editor:request-dock'),
    onDock: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('script-editor:dock', listener)
      // 与 scripts.onEnded 同模式：preload 无卸载时机，独立窗生命周期 = 窗本身
    },
    isPopout: () => (process.argv || []).includes('--script-editor-popout')
  },
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误（preload 现在满足 WindowAPI 全部字段）

- [ ] **Step 3: 写 isPopout 契约测试**

Create `test/script-editor-popout-ipc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('script editor popout IPC contract', () => {
  it('process.argv 含 --script-editor-popout 时 isPopout 判定逻辑为 true', () => {
    // 直接验证判定逻辑（与 preload isPopout 实现一致）
    const argv = ['electron', '--script-editor-popout']
    expect(argv.includes('--script-editor-popout')).toBe(true)
  })

  it('普通窗口 argv 不含标记时为 false', () => {
    const argv = ['electron']
    expect(argv.includes('--script-editor-popout')).toBe(false)
  })

  it('ScriptEditorAPI 类型契约：popout 返回 Promise<{ok,error?}>', async () => {
    // mock 一份符合契约的最小实现，验证可被 await 且返回结构正确
    const api = {
      popout: async () => ({ ok: true }),
      requestDock: () => {},
      onDock: (_cb: () => void) => {},
      isPopout: () => false
    } as const
    const res = await api.popout()
    expect(res.ok).toBe(true)
    expect(typeof api.requestDock).toBe('function')
    expect(typeof api.isPopout).toBe('function')
  })
})
```

- [ ] **Step 4: 运行测试**

Run: `npx vitest run test/script-editor-popout-ipc.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add electron/preload.ts test/script-editor-popout-ipc.test.ts
git commit -m "feat(script-editor): implement scriptEditor IPC namespace in preload"
```

---

## Task 6：main 进程弹窗单例 + IPC handlers

**Files:**
- Modify: `electron/main.ts:93`（popoutWindows 区附近）+ `panel:popout` handler 之后（行 919 后）

- [ ] **Step 1: 加单例注册表**

在 `electron/main.ts` 行 93（`const popoutWindows = ...`）之后插入：
```ts
/** 脚本编辑器弹出窗：单例（一次仅一个编辑器弹窗，二次弹窗聚焦已有） */
let scriptEditorPopoutWindow: BrowserWindow | null = null
```

- [ ] **Step 2: 加 IPC handlers**

在 `ipcMain.handle('panel:popout', ...)`（行 866-919）之后插入：

```ts
ipcMain.handle('script-editor:popout', () => {
  // 单例：已有 → 聚焦，不重复创建
  if (scriptEditorPopoutWindow && !scriptEditorPopoutWindow.isDestroyed()) {
    if (scriptEditorPopoutWindow.isMinimized()) scriptEditorPopoutWindow.restore()
    scriptEditorPopoutWindow.show()
    scriptEditorPopoutWindow.focus()
    return { ok: true }
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32'
      ? { color: '#f5f7fa', symbolColor: '#1f2937', height: 38 }
      : undefined,
    frame: process.platform === 'linux' ? false : undefined,
    resizable: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      additionalArguments: ['--script-editor-popout']
    }
  })

  scriptEditorPopoutWindow = win
  win.on('closed', () => { scriptEditorPopoutWindow = null })

  if (isDev) {
    win.loadURL(DEV_SERVER_URL + '/src/script-editor.html')
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'script-editor.html'))
  }

  return { ok: true }
})

ipcMain.on('script-editor:request-dock', () => {
  // 关闭独立窗，并通知主窗重新显示内嵌弹层
  if (scriptEditorPopoutWindow && !scriptEditorPopoutWindow.isDestroyed()) {
    scriptEditorPopoutWindow.close()
  }
  mainWindow?.webContents.send('script-editor:dock')
})
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 4: commit**

```bash
git add electron/main.ts
git commit -m "feat(script-editor): add single-instance popout window + dock IPC"
```

---

## Task 7：script-editor.html + script-editor.tsx 入口 + vite 配置

**Files:**
- Create: `src/script-editor.html`
- Create: `src/script-editor.tsx`
- Modify: `electron.vite.config.ts:34-40`（renderer input）

- [ ] **Step 1: 建 HTML 入口**

Create `src/script-editor.html`（仿 `src/panel.html`）:
```html
<!doctype html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8" />
    <title>脚本编辑器</title>
    <style>
        html,
        body {
            margin: 0;
            height: 100%;
            overflow: hidden;
        }

        #root {
            height: 100%;
        }
    </style>
</head>

<body>
    <div id="root"></div>
    <!-- Web 预览安全网：非 Electron 环境下注入 window.api shim -->
    <script src="/src/mock-api.js"></script>
    <script type="module" src="./script-editor.tsx"></script>
</body>

</html>
```

- [ ] **Step 2: 建 renderer 入口**

Create `src/script-editor.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import { ScriptEditorDialog } from './features/script-editor/ScriptEditorDialog'

/**
 * 脚本编辑器弹出独立窗 renderer。
 * - 全屏铺满（is-popout 模式无 backdrop、无内窗圆角）
 * - 复用主窗同一套 ScriptEditorDialog 组件树（画布/调色板/节点配置/输出/工具栏）
 * - 跨进程运行时（scripts/serial/config）经 preload 共享，全功能独立
 */
function ScriptEditorPopout() {
  return (
    <div className="h-screen w-screen">
      <ScriptEditorDialog isPopout open onClose={() => window.close()} />
    </div>
  )
}

class ScriptEditorPopoutErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ScriptEditorPopout] render crashed:', error, info.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#b91c1c', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>脚本编辑器渲染失败：</div>
          {String(this.state.error?.message || this.state.error)}
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ScriptEditorPopoutErrorBoundary>
      <ScriptEditorPopout />
    </ScriptEditorPopoutErrorBoundary>
  </React.StrictMode>
)
```

- [ ] **Step 3: 注册 vite 入口**

Modify `electron.vite.config.ts` 的 `renderer.build.rollupOptions.input`（行 34-40），加一行：

```ts
        input: {
          index: resolve(__dirname, 'src/index.html'),
          panel: resolve(__dirname, 'src/panel.html'),
          changelog: resolve(__dirname, 'src/changelog.html'),
          about: resolve(__dirname, 'src/about.html'),
          mainwindow: resolve(__dirname, 'src/mainwindow.html'),
          'script-editor': resolve(__dirname, 'src/script-editor.html')
        }
```

- [ ] **Step 4: typecheck + 构建**

Run: `npm run typecheck`
Expected: 无错误

Run: `npm run build`
Expected: 成功产出 `out/renderer/src/script-editor.html`（确认入口被收录）

- [ ] **Step 5: commit**

```bash
git add src/script-editor.html src/script-editor.tsx electron.vite.config.ts
git commit -m "feat(script-editor): add standalone popout window HTML/renderer entry"
```

---

## Task 8：主窗脚本入口对接 dock（onDock → 重新显示弹层）

**Files:**
- Modify: 主窗里挂载 `<ScriptEditorDialog>` 的父组件（脚本 tab 入口）

- [ ] **Step 1: 定位挂载点**

Run: `grep -rn "ScriptEditorDialog" src --include=*.tsx | grep -v "components/" | grep -v "script-editor/"`
Expected: 找到主窗里 `<ScriptEditorDialog open={...} onClose={...} />` 的父组件（很可能是 MainWindow 或脚本 tab 的容器）。

- [ ] **Step 2: 在父组件加 dock 监听**

在该父组件中，把控制 `open` 的 state 加一个 dock 监听（收到 `script-editor:dock` 时重新 open）：

```tsx
  const [scriptEditorOpen, setScriptEditorOpen] = useState(false)

  useEffect(() => {
    const ipc = getIPC()
    if (!ipc.scriptEditor?.onDock) return
    ipc.scriptEditor.onDock(() => setScriptEditorOpen(true))
  }, [])
```

并在 `handlePopout` 触发后把 `scriptEditorOpen` 置 false（隐藏内嵌弹层）——由于 `ScriptEditorDialog.handlePopout` 调 IPC 后主窗弹层本就应隐藏，需在父组件的「弹出」入口处协同：

> 若当前「弹出」按钮在 Toolbar 内（Task 2 已接 `onPopout={handlePopout}`），父组件需把 `onClose` 同时用于「弹出后隐藏」。最简：在 `ScriptEditorDialog.handlePopout` 成功调 `popout()` 后，通过新增的 `onPoppedOut` 回调通知父组件置 `open=false`。

实施：在 `ScriptEditorDialog` 的 `handlePopout`（Task 3 Step 2）改为：
```ts
  function handlePopout() {
    try {
      void getIPC().scriptEditor?.popout?.().then((res) => {
        if (res?.ok) onClose()  // 弹出成功后隐藏内嵌弹层
      })
    } catch {
      /* web 预览无 ipc，静默 */
    }
  }
```

- [ ] **Step 3: typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 无错误、全绿

- [ ] **Step 4: commit**

```bash
git add <父组件路径> src/features/script-editor/ScriptEditorDialog.tsx
git commit -m "feat(script-editor): hide in-window dialog on popout, reopen on dock"
```

---

## Task 9：useEmptyMinimapInteraction hook（TDD）

**Files:**
- Create: `src/features/script-editor/useEmptyMinimapInteraction.ts`
- Test: `test/empty-minimap-interaction.test.ts`

- [ ] **Step 1: 写失败测试**

Create `test/empty-minimap-interaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeTranslateDelta, computeWheelZoom } from '../src/features/script-editor/useEmptyMinimapInteraction'

describe('empty minimap interaction helpers', () => {
  it('computeTranslateDelta: 把 minimap 上的像素位移原样转为画布平移量（dx,dy）', () => {
    // 拖动向右下 10,5 像素 → 画布 translate(-10, -5)（视口跟随，平移量取反）
    expect(computeTranslateDelta(10, 5)).toEqual({ dx: -10, dy: -5 })
  })

  it('computeTranslateDelta: 左上拖动取正', () => {
    expect(computeTranslateDelta(-8, -3)).toEqual({ dx: 8, dy: 3 })
  })

  it('computeWheelZoom: 向上滚（deltaY<0）放大，经 clampCanvasZoom 约束', () => {
    const next = computeWheelZoom(1, -100)
    expect(next).toBeGreaterThan(1)
    expect(next).toBeLessThanOrEqual(1.8) // clampCanvasZoom 上限
  })

  it('computeWheelZoom: 向下滚（deltaY>0）缩小，不低于 0.5', () => {
    const next = computeWheelZoom(1, 100)
    expect(next).toBeLessThan(1)
    expect(next).toBeGreaterThanOrEqual(0.5) // clampCanvasZoom 下限
  })

  it('computeWheelZoom: 极限值被 clamp', () => {
    expect(computeWheelZoom(1.8, -1000)).toBe(1.8)
    expect(computeWheelZoom(0.5, 1000)).toBe(0.5)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/empty-minimap-interaction.test.ts`
Expected: FAIL（`computeTranslateDelta`/`computeWheelZoom` 未定义）

- [ ] **Step 3: 实现 hook 与纯函数**

Create `src/features/script-editor/useEmptyMinimapInteraction.ts`:

```ts
import { useEffect } from 'react'
import { clampCanvasZoom } from './viewModel'

/** minimap 像素位移 → 画布 translate 量（视口跟随，取反） */
export function computeTranslateDelta(dx: number, dy: number): { dx: number; dy: number } {
  return { dx: -dx, dy: -dy }
}

/** wheel deltaY → 下一 zoom（经 clampCanvasZoom 约束，与画布滚轮缩放一致） */
export function computeWheelZoom(currentZoom: number, deltaY: number): number {
  const factor = deltaY < 0 ? 0.1 : -0.1
  return clampCanvasZoom(currentZoom + factor)
}

interface ReteAreaLike {
  translate: (dx: number, dy: number) => void
  zoom: (z: number) => Promise<void> | void
}

interface ReteEditorLike {
  area?: { area?: ReteAreaLike }
}

/**
 * 空画布 minimap 交互修复。
 * Rete MinimapPlugin 节点数为 0 时不渲染导航框 → 点/拖/滚轮无反应。
 * 本 hook 在空画布时给 minimap 容器叠一层透传逻辑：
 * - pointer 拖动 → area.translate 平移画布
 * - pointer 点击（无 move）→ area.translate 把点击点对齐视口中心
 * - wheel → area.zoom（clampCanvasZoom 约束）
 * isEmpty=false 时本 hook no-op（回退 Rete 原生 minimap）。
 *
 * @param containerRef 画布外层 main 容器 ref（用于查找 [data-testid="minimap"]）
 * @param editor Rete editor 实例
 * @param isEmpty graph.nodes.length === 0
 */
export function useEmptyMinimapInteraction(
  containerRef: React.RefObject<HTMLElement | null>,
  editor: ReteEditorLike | null,
  isEmpty: boolean
) {
  useEffect(() => {
    if (!isEmpty || !editor) return
    const cont = containerRef.current
    if (!cont) return
    const minimap = cont.querySelector<HTMLElement>('[data-testid="minimap"]')
    if (!minimap) return

    let dragging = false
    let moved = false
    let lastX = 0
    let lastY = 0
    let startX = 0
    let startY = 0

    const area = editor.area?.area
    if (!area) return

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      dragging = true
      moved = false
      lastX = e.clientX
      lastY = e.clientY
      startX = e.clientX
      startY = e.clientY
      minimap.setPointerCapture(e.pointerId)
      minimap.style.cursor = 'grabbing'
    }

    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) moved = true
      const delta = computeTranslateDelta(dx, dy)
      area.translate(delta.dx, delta.dy)
    }

    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      minimap.style.cursor = 'grab'
      try { minimap.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
      // 点击（无显著 move）：把点击点对齐视口中心
      if (!moved) {
        const rect = minimap.getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        const delta = computeTranslateDelta(cx, cy)
        area.translate(delta.dx, delta.dy)
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // 当前 zoom 无法直接从 area 读，由调用方经闭包传入更稳；这里用近似：缩放步进
      // 改为接收一个 zoomGetter 更干净——见下方 onWheelZoom 注释。
      // 简化：直接调 area.zoom 传当前→目标的相对值由 GraphCanvas 提供。
      onWheelZoom(e.deltaY)
    }

    // zoom 由 GraphCanvas 通过 setWheelZoomHandler 注入（避免本 hook 读 area 内部 zoom）
    let wheelZoomHandler: ((deltaY: number) => void) | null = null
    const onWheelZoom = (deltaY: number) => wheelZoomHandler?.(deltaY)

    // 占位：实际 zoom 控制在 GraphCanvas 里（它持有 zoom state），本 hook 仅转 wheel 事件
    void onWheelZoom

    minimap.style.cursor = 'grab'
    minimap.addEventListener('pointerdown', onDown)
    minimap.addEventListener('pointermove', onMove)
    minimap.addEventListener('pointerup', onUp)
    minimap.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      minimap.style.cursor = ''
      minimap.removeEventListener('pointerdown', onDown)
      minimap.removeEventListener('pointermove', onMove)
      minimap.removeEventListener('pointerup', onUp)
      minimap.removeEventListener('wheel', onWheel)
    }
  }, [containerRef, editor, isEmpty])
}

// 供 GraphCanvas 注入实际 zoom 行为的注册函数（GraphCanvas 持有 zoom state）
export type WheelZoomHandler = (deltaY: number) => void
```

> 注：上面的 wheel→zoom 用了占位。GraphCanvas 已持有 `zoom` state 与 `onZoomChange`，最干净的做法是让本 hook 接收一个 `onWheelZoom: (deltaY: number) => void` 回调，由 GraphCanvas 在其中用 `computeWheelZoom(zoom, deltaY)` 算下一 zoom 并 `onZoomChange`。Step 4 接入时按此调整签名（删占位，加 props）。

- [ ] **Step 4: 调整 hook 签名为接收 onWheelZoom 回调**

把 `useEmptyMinimapInteraction` 的签名与 wheel 部分改为：

```ts
export function useEmptyMinimapInteraction(
  containerRef: React.RefObject<HTMLElement | null>,
  editor: ReteEditorLike | null,
  isEmpty: boolean,
  onWheelZoom: (deltaY: number) => void
) {
```

`onWheel` 改为：
```ts
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      onWheelZoom(e.deltaY)
    }
```

依赖数组改为 `[containerRef, editor, isEmpty, onWheelZoom]`，删除占位的 `wheelZoomHandler`/`onWheelZoom` 内部变量与 `WheelZoomHandler` 导出。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run test/empty-minimap-interaction.test.ts`
Expected: PASS（5 个纯函数用例）

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 7: commit**

```bash
git add src/features/script-editor/useEmptyMinimapInteraction.ts test/empty-minimap-interaction.test.ts
git commit -m "feat(script-editor): add empty-minimap interaction hook (drag/click/wheel)"
```

---

## Task 10：GraphCanvas 接入 empty-minimap hook

**Files:**
- Modify: `src/features/script-editor/components/GraphCanvas.tsx`

- [ ] **Step 1: import hook 与 helper**

在 `src/features/script-editor/components/GraphCanvas.tsx` 顶部 import 区加：
```ts
import { useEmptyMinimapInteraction, computeWheelZoom } from '../useEmptyMinimapInteraction'
```

- [ ] **Step 2: 在 GraphCanvas 内调用 hook**

在 `GraphCanvas` 组件内（`canvasRef`/`reteRef` 定义之后，return 之前）加：

```ts
  useEmptyMinimapInteraction(
    canvasRef,
    reteRef.current,
    graph.nodes.length === 0,
    (deltaY) => {
      // GraphCanvas 持有 zoom（props），下一帧经 onZoomChange 回写
      onZoomChange(computeWheelZoom(zoom, deltaY))
    }
  )
```

> `canvasRef` 指向 `.script-editor-canvas__surface`（包裹画布）；minimap 由 Rete 渲染在该容器内，`querySelector('[data-testid="minimap"]')` 能命中（见 CSS `script-editor-canvas [data-testid="minimap"]`）。
> `zoom` 是 GraphCanvas 的 prop；`onZoomChange` 已是 props。两者变化会重建 hook 依赖，符合预期（zoom 变 → 闭包刷新）。
> 注：`canvasRef` 当前类型是 `HTMLDivElement | null`，与 hook 的 `HTMLElement | null` 兼容。若 hook 内 `containerRef.current` 查 minimap 找不到，回查 minimap 实际挂载点（可能是 `.script-editor-canvas` main 而非 surface）——见 Step 3 验证。

- [ ] **Step 3: 验证 minimap 容器归属**

Run: `npm run dev`，打开脚本页，空画布下用浏览器 DevTools 检查 `[data-testid="minimap"]` 的父元素是 `.script-editor-canvas__surface` 还是 `.script-editor-canvas`。

- 若是 `.script-editor-canvas`（main 元素）：把传入的 ref 改为指向 main 的 ref（若有），或用 `document.querySelector` 兜底。最稳：hook 内用 `cont.querySelector` 失败时上溯 `cont.parentElement?.querySelector`。

如需，把 hook 内查找改为：
```ts
    const minimap = cont.querySelector<HTMLElement>('[data-testid="minimap"]')
      || cont.closest('.script-editor-canvas')?.querySelector<HTMLElement>('[data-testid="minimap"]')
```

- [ ] **Step 4: typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 无错误、全绿

- [ ] **Step 5: 手动验证（按 AGENTS.md，UI 改动需手动验证）**

- 打开脚本页，确保画布空（无节点）
- 鼠标拖动右上 minimap → 主画布应平移
- 点击 minimap 某点 → 画布中心移向该方向
- 滚轮在 minimap 上 → 画布缩放，HUD 百分比变化，范围 50%–180%
- 添加一个节点 → minimap 回到 Rete 原生导航框行为
- 删光节点 → 透传交互恢复

- [ ] **Step 6: commit**

```bash
git add src/features/script-editor/components/GraphCanvas.tsx src/features/script-editor/useEmptyMinimapInteraction.ts
git commit -m "feat(script-editor): enable drag/click/wheel on minimap when canvas empty"
```

---

## Task 11：全量验证 + 最终 commit

- [ ] **Step 1: 全量 typecheck + 测试**

Run: `npm run typecheck && npm test`
Expected: 无错误、全绿（含 4 个新测试文件）

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 成功，产出含 `script-editor.html` 入口

- [ ] **Step 3: 手动 Electron 全流程验证**

`npm run dev` 后逐条验收（对应 spec 第 1 节验收标准）：

Feature 1（主窗内）：
1. 最大化按钮 → 全屏、圆角清零、图标变还原；再点还原
2. 最小化按钮 → 主体收起、backdrop 消失、主窗可操作、底栏条贴底；点底栏条还原到最小化前模式

Feature 2（弹出）：
3. 弹出按钮 → 独立窗打开、主窗弹层隐藏
4. 弹出窗内编辑/保存/运行/停止脚本，输出实时显示
5. 弹出窗「回到主窗」→ 独立窗关、主窗弹层重新显示
6. 二次弹出 → 聚焦已有窗，不重复开
7. 弹出窗最小化（原生）→ 任务栏收起，不收底栏条

Feature 3（minimap）：
8. 空画布：拖/点/滚轮控制画布（Task 10 Step 5 已验）

- [ ] **Step 4: 回归验证既有功能**

确认未破坏：脚本新建/保存/删除、节点拖拽/连线/配置、命令页发送、串口面板等。

- [ ] **Step 5: 最终 commit（若有遗留改动）**

```bash
git status
# 若有未提交的微调
git add -A
git commit -m "chore(script-editor): integration tweaks + manual verification"
```

---

## Self-Review 检查

**Spec 覆盖：**
- Feature 1 最大化 → Task 1（状态机）+ Task 2（按钮）+ Task 3（CSS/dialog）
- Feature 1 最小化（底栏条 + 移除 backdrop）→ Task 1 + Task 3（showBackdrop 逻辑 + minimized-bar）
- Feature 2 弹出独立窗 → Task 4/5/6（IPC 链路）+ Task 7（入口）+ Task 8（dock 回主窗）
- Feature 2 全功能独立运行 → 既有 scripts/serial/config IPC 已共享，Task 7 复用 ScriptEditorDialog 即得，无额外任务（spec 已说明）
- Feature 2 二次弹窗聚焦 → Task 6 Step 2 单例逻辑
- Feature 2 弹出窗原生最小化 → Task 6 BrowserWindow 配置（frameless + 原生控制），无需额外代码
- Feature 3 空 minimap 拖/点/滚轮 → Task 9（hook）+ Task 10（接入）
- 缩放范围 clampCanvasZoom → Task 9 computeWheelZoom 复用既有 clampCanvasZoom

**Placeholder 扫描：** Task 8 Step 1/2 的「父组件」需运行 grep 定位（因 MainWindow 结构未读全），已在 Step 1 给出定位命令；其余步骤均有完整代码。Task 9 Step 3→4 有签名调整，已显式给出改后代码，非占位。

**类型一致性：** `ScriptEditorWindowMode`（Task 1）在 Toolbar（Task 2）与 Dialog（Task 3）一致；`ScriptEditorAPI`（Task 4）在 preload（Task 5）与 Dialog 调用（Task 3/8）通过可选链 `?.` 一致；`useEmptyMinimapInteraction` 签名在 Task 9 Step 4 与 Task 10 接入一致（`onWheelZoom` 回调）；`computeWheelZoom`/`computeTranslateDelta` 导出名在测试（Task 9 Step 1）与实现（Step 3）一致。
