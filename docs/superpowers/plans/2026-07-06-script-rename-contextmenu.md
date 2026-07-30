# 脚本页：重命名 + 右键菜单（重命名/删除/导出）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给脚本编辑器的脚本列表项加右键菜单（重命名/删除/导出），并在工具栏新增「重命名」「导出」按钮；文件操作集中在主进程，renderer 复用现有对话框。

**Architecture:** 新增两个 IPC 通道 `scripts:rename`（主进程 `fs.renameSync`，禁止重名）与 `scripts:export`（主进程 `dialog.showSaveDialog` + 写文件）。renderer 侧把删除/重命名的目标从「总是活动脚本」泛化为「可指定」，每项包 Radix `ContextMenu`，重命名复用 `PromptDialog`，删除复用 `AlertDialog`。

**Tech Stack:** TypeScript / React / Electron (ipcMain + dialog) / Radix UI ContextMenu / Vitest / Playwright Electron

**Spec:** `docs/superpowers/specs/2026-07-06-script-rename-contextmenu-design.md`

**Naming note（计划偏差说明）：** spec 第 11.1 节写的是新建 `test/script-rename-export.test.ts`，但仓库已有 `test/script-editor-view-model.test.ts` 集中覆盖 `viewModel` 纯函数。为遵循 DRY，本计划把 `stripScriptExtension` 用例并入该现有文件，而不是新建文件。除此之外完全遵循 spec。

---

## 文件结构

| 文件 | 责任 | 操作 |
|---|---|---|
| `shared/types.ts` | `ScriptsAPI` 增 `rename` / `exportScript` 签名 | 修改（约 310-320 行） |
| `electron/preload.ts` | 增 `scripts:rename` / `scripts:export` invoke 映射 | 修改（约 146-164 行） |
| `electron/main.ts` | 增两个 `ipcMain.handle`（rename / export），紧跟 `scripts:delete` 之后 | 修改（约 1051 行后） |
| `src/shared/dev/mock-api.ts` | `scripts` 加 `rename` / `exportScript` 桩 | 修改（约 104-114 行） |
| `src/features/script-editor/viewModel.ts` | 新增 `stripScriptExtension` 纯函数 | 修改 |
| `src/features/script-editor/components/ScriptList.tsx` | 增 `onRename`/`onDelete`/`onExport` props + `ContextMenu` 包裹 | 修改（重写） |
| `src/features/script-editor/components/Toolbar.tsx` | 增「重命名」「导出」按钮 + props | 修改 |
| `src/features/script-editor/ScriptEditorDialog.tsx` | 通用化删除目标、新增重命名/导出流程、PromptDialog/AlertDialog 接线 | 修改 |
| `test/script-editor-view-model.test.ts` | 加 `stripScriptExtension` 用例（并入现有文件，DRY） | 修改 |
| `e2e/script-list-actions.spec.ts` | 右键重命名/删除/导出 + 工具栏重命名 + 重名边界 E2E | 新建 |

---

### Task 1: ViewModel 纯函数 `stripScriptExtension`（TDD）

**Files:**
- Modify: `src/features/script-editor/viewModel.ts`（在 `normalizeScriptName` 之后）
- Test: `test/script-editor-view-model.test.ts`（并入现有文件，DRY）

- [ ] **Step 1: 写失败测试**

在 `test/script-editor-view-model.test.ts` 顶部 import 花括号里加 `stripScriptExtension`（与现有 `normalizeScriptName` 并列），并在文件末尾追加一个新 `describe` 块：

```ts
describe('stripScriptExtension', () => {
  it('去掉末尾 .js 后缀', () => {
    expect(stripScriptExtension('Foo.js')).toBe('Foo')
  })
  it('无 .js 后缀时原样返回', () => {
    expect(stripScriptExtension('Foo')).toBe('Foo')
  })
  it('只去掉末尾 .js，保留中间的点', () => {
    expect(stripScriptExtension('a.b.js')).toBe('a.b')
  })
  it('大写 .JS 后缀也去掉（大小写不敏感）', () => {
    expect(stripScriptExtension('Foo.JS')).toBe('Foo')
  })
})
```

同时把 import 改为：

```ts
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  clampCanvasZoom,
  createDefaultReteGraph,
  fitGraphToView,
  groupNodesForPalette,
  nextDefaultScriptName,
  normalizeScriptName,
  stripScriptExtension
} from '../src/features/script-editor/viewModel'
```

- [ ] **Step 2: 跑测试确认失败**

运行：`npx vitest run test/script-editor-view-model.test.ts`
预期：4 条 `stripScriptExtension` 用例 FAIL（导入的 `stripScriptExtension` 为 `undefined`）。

- [ ] **Step 3: 写最小实现**

在 `src/features/script-editor/viewModel.ts` 的 `normalizeScriptName` 函数之后（约 35 行后）新增：

```ts
/** 去掉 .js 后缀用于重命名弹窗预填：Foo.js → Foo。无后缀原样返回。 */
export function stripScriptExtension(name: string): string {
  return name.replace(/\.js$/i, '')
}
```

- [ ] **Step 4: 跑测试确认通过**

运行：`npx vitest run test/script-editor-view-model.test.ts`
预期：全部 PASS（含 4 条新用例）。

- [ ] **Step 5: 提交**

```bash
git add src/features/script-editor/viewModel.ts test/script-editor-view-model.test.ts
git commit -m "feat(script-editor): add stripScriptExtension view-model helper"
```

---

### Task 2: IPC 契约 — `ScriptsAPI` 类型 + preload + mock-api

**Files:**
- Modify: `shared/types.ts`（约 310-320 行 `ScriptsAPI`）
- Modify: `electron/preload.ts`（约 146-164 行 `scripts:`）
- Modify: `src/shared/dev/mock-api.ts`（约 104-114 行 `scripts:`）

- [ ] **Step 1: 扩展 `ScriptsAPI` 类型**

在 `shared/types.ts` 的 `ScriptsAPI` 接口里，在 `delete` 之后、`run` 之前插入两行（保持字母/逻辑分组）：

```ts
export interface ScriptsAPI {
  dir: () => Promise<string>
  list: () => Promise<string[]>
  read: (name: string) => Promise<string>
  write: (name: string, content: string) => Promise<unknown>
  delete: (name: string) => Promise<unknown>
  rename: (oldName: string, newName: string) => Promise<{ ok: boolean; error?: string }>
  exportScript: (name: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string; filePath?: string }>
  run: (code: string, ctx: ScriptRunContext) => Promise<{ runId: string }>
  stop: (runId: string) => Promise<unknown>
  onEnded: (cb: (p: ScriptEndedPayload) => void) => () => void
  onLog: (cb: (p: ScriptLogPayload) => void) => () => void
}
```

- [ ] **Step 2: preload 增映射**

在 `electron/preload.ts` 的 `scripts:` 对象里，`delete` 之后插入（注意 `rename` 传对象、`exportScript` 传裸字符串，与既有 `write`/`delete` 风格一致）：

```ts
    delete: (name) => ipcRenderer.invoke('scripts:delete', name),
    rename: (oldName, newName) => ipcRenderer.invoke('scripts:rename', { oldName, newName }),
    exportScript: (name) => ipcRenderer.invoke('scripts:export', name),
    run: (code, ctx) => ipcRenderer.invoke('scripts:run', { code, ctx }),
```

- [ ] **Step 3: mock-api 增桩**

在 `src/shared/dev/mock-api.ts` 的 `scripts:` 对象里，`delete` 之后插入：

```ts
      delete: asyncOk,
      rename: async () => ({ ok: true }),
      exportScript: async () => ({ ok: true, filePath: '/mock/export.js' }),
      run: async () => ({ ok: true, runId: 'web-preview-run' }),
```

- [ ] **Step 4: typecheck 确认契约一致**

运行：`npm run typecheck`
预期：无错误（main.ts 的 handler 还没加，但 typecheck 不校验 ipcMain 通道，只校验 TS 类型；preload/mock 已对齐 `ScriptsAPI`）。

- [ ] **Step 5: 提交**

```bash
git add shared/types.ts electron/preload.ts src/shared/dev/mock-api.ts
git commit -m "feat(script-editor): add rename/exportScript to ScriptsAPI contract"
```

---

### Task 3: 主进程 `scripts:rename` handler

**Files:**
- Modify: `electron/main.ts`（紧跟 `scripts:delete` handler 之后，约 1051 行后）

- [ ] **Step 1: 加 rename handler**

在 `electron/main.ts` 的 `ipcMain.handle('scripts:delete', ...)` 这一行之后插入：

```ts
ipcMain.handle('scripts:rename', (_e, { oldName, newName }) => {
  ensureScriptsDir()
  const old = path.join(scriptsDir, safeScriptName(oldName))
  const next = path.join(scriptsDir, safeScriptName(newName))
  if (!fs.existsSync(old)) return { ok: false, error: '源脚本不存在' }
  if (old === next) return { ok: true }
  if (fs.existsSync(next)) return { ok: false, error: '该名称已存在' }
  try { fs.renameSync(old, next); return { ok: true } }
  catch (e) { return { ok: false, error: String((e as Error)?.message || e) } }
})
```

说明：
- 复用文件顶部已有的 `ensureScriptsDir` / `safeScriptName` / `scriptsDir` / `fs` / `path`（无需新增 import）。
- 禁止重名：目标已存在直接 `{ok:false, error:'该名称已存在'}`，不覆盖。
- `old === next` 兜底「仅大小写差异」（Windows 文件系统不区分大小写，同路径 renameSync 是 no-op）。

- [ ] **Step 2: typecheck**

运行：`npm run typecheck`
预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add electron/main.ts
git commit -m "feat(script-editor): add scripts:rename IPC handler"
```

---

### Task 4: 主进程 `scripts:export` handler

**Files:**
- Modify: `electron/main.ts`（紧跟 Task 3 的 rename handler 之后）

- [ ] **Step 1: 加 export handler**

在 Task 3 新增的 `ipcMain.handle('scripts:rename', ...)` 之后插入（照搬 `panel:saveLog` 模式，见 main.ts:900-904）：

```ts
ipcMain.handle('scripts:export', async (_e, name: string) => {
  const src = path.join(scriptsDir, safeScriptName(name))
  if (!fs.existsSync(src)) return { ok: false, error: '脚本不存在' }
  const content = fs.readFileSync(src, 'utf-8')
  const defaultPath = String(name || '').replace(/\.js$/i, '')
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出脚本',
    defaultPath,
    filters: [{ name: 'JavaScript', extensions: ['js'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true, filePath } }
  catch (e) { return { ok: false, error: String((e as Error)?.message || e) } }
})
```

说明：
- 复用文件顶部已有的 `dialog`（panel:saveLog 已用，无需新增 import）。
- 导出磁盘真实内容（`readFileSync`），不在 renderer 重组。
- 用户取消 → `{ok:false, canceled:true}`，renderer 静默。

- [ ] **Step 2: typecheck**

运行：`npm run typecheck`
预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add electron/main.ts
git commit -m "feat(script-editor): add scripts:export IPC handler"
```

---

### Task 5: `ScriptList.tsx` 加右键菜单

**Files:**
- Modify: `src/features/script-editor/components/ScriptList.tsx`（重写整个文件）

- [ ] **Step 1: 重写 ScriptList**

用以下内容完整替换 `src/features/script-editor/components/ScriptList.tsx`：

```tsx
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'

interface ScriptListProps {
  scripts: string[]
  activeScriptName: string | null
  loading: boolean
  error: string | null
  onSelect: (name: string) => void
  onRename: (name: string) => void
  onDelete: (name: string) => void
  onExport: (name: string) => void
}

export function ScriptList({ scripts, activeScriptName, loading, error, onSelect, onRename, onDelete, onExport }: ScriptListProps) {
  return (
    <div className="script-editor-list" aria-label="脚本列表">
      <div className="script-editor-list__heading">脚本列表</div>
      {loading && <div className="script-editor-list__meta">加载中...</div>}
      {error && <div className="script-editor-list__error">{error}</div>}
      {!loading && !error && scripts.length === 0 && (
        <div className="script-editor-list__meta">暂无脚本</div>
      )}
      <div className="script-editor-list__items">
        {scripts.map((name) => (
          <ContextMenu key={name}>
            <ContextMenuTrigger asChild>
              <Button
                variant={name === activeScriptName ? 'secondary' : 'ghost'}
                className="script-editor-list__item justify-start w-full"
                onClick={() => onSelect(name)}
              >
                {name}
              </Button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onRename(name)}>重命名</ContextMenuItem>
              <ContextMenuItem onClick={() => onExport(name)}>导出</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={() => onDelete(name)}>删除</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
      </div>
    </div>
  )
}
```

说明：
- `ContextMenuTrigger asChild` 包裹 Button：右键触发菜单、左键仍触发 Button onClick（Radix 默认行为不冲突）。
- 菜单顺序：重命名 / 导出 / 分隔线 / 删除（destructive）。
- `onRename/onDelete/onExport(name)` 直接传被右键项的名字，不依赖「先选中」。

- [ ] **Step 2: typecheck**

运行：`npm run typecheck`
预期：`ScriptEditorDialog.tsx` 此刻还没传新 props，会报「缺 onRename/onDelete/onExport」错误——这是预期的，Task 7 会修复。**为让本任务独立可 typecheck，本步骤改为只校验 ScriptList 自身语法**：运行 `npm run typecheck` 记录错误，确认唯一错误来自 `ScriptEditorDialog.tsx` 的 `<ScriptList>` 调用处缺 props（而非 ScriptList.tsx 内部），即可继续。

- [ ] **Step 3: 提交**

```bash
git add src/features/script-editor/components/ScriptList.tsx
git commit -m "feat(script-editor): add right-click context menu to script list"
```

---

### Task 6: `Toolbar.tsx` 加「重命名」「导出」按钮

**Files:**
- Modify: `src/features/script-editor/components/Toolbar.tsx`

- [ ] **Step 1: 加图标 import**

在 `src/features/script-editor/components/Toolbar.tsx` 顶部的 `@phosphor-icons/react` import 块里，按字母顺序加入两个图标。把现有 import 改为（新增 `DownloadSimple` 和 `PencilSimple`，别名风格与现有 `FloppyDisk as Save` 一致）：

```ts
import {
  ArrowsInCardinal,
  ArrowsOutCardinal,
  DownloadSimple,
  FilePlus as FilePlus2,
  FloppyDisk as Save,
  FrameCorners,
  Minus,
  PencilSimple,
  Play,
  PushPin,
  Stop as Square,
  Trash as Trash2,
  X,
  MagnifyingGlassPlus as ZoomIn,
  MagnifyingGlassMinus as ZoomOut
} from '@phosphor-icons/react'
```

- [ ] **Step 2: 扩展 props 接口**

把 `interface ToolbarProps` 里在 `onDelete` 之后加两个新回调（保持与现有排列一致）：

```ts
interface ToolbarProps {
  activeScriptName: string | null
  running: boolean
  windowMode: ScriptEditorWindowMode
  isPopout: boolean
  /** 图形损坏（如 JSON 解析失败）时禁用保存，避免空图覆盖原文件。 */
  saveDisabled?: boolean
  onNew: () => void
  onSave: () => void
  onRename: () => void
  onExport: () => void
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
```

- [ ] **Step 3: 解构新 props**

把 `export function Toolbar(...)` 的参数解构里，在 `onDelete` 之前加入 `onRename, onExport`：

```ts
export function Toolbar({
  activeScriptName,
  running,
  windowMode,
  isPopout,
  saveDisabled,
  onNew,
  onSave,
  onRename,
  onExport,
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
```

- [ ] **Step 4: 插入两个按钮**

在 JSX 的「保存」按钮和「删除」按钮之间插入「重命名」「导出」两个按钮。找到现有这段：

```tsx
        <Button size="sm" variant="outline" title="保存" onClick={onSave} disabled={saveDisabled}>
          <Save data-icon="inline-start" />
          保存
        </Button>
        <Button size="sm" variant="outline" title="删除" onClick={onDelete} disabled={!activeScriptName}>
          <Trash2 data-icon="inline-start" />
          删除
        </Button>
```

替换为：

```tsx
        <Button size="sm" variant="outline" title="保存" onClick={onSave} disabled={saveDisabled}>
          <Save data-icon="inline-start" />
          保存
        </Button>
        <Button size="sm" variant="outline" title="重命名" onClick={onRename} disabled={!activeScriptName}>
          <PencilSimple data-icon="inline-start" />
          重命名
        </Button>
        <Button size="sm" variant="outline" title="导出" onClick={onExport} disabled={!activeScriptName}>
          <DownloadSimple data-icon="inline-start" />
          导出
        </Button>
        <Button size="sm" variant="outline" title="删除" onClick={onDelete} disabled={!activeScriptName}>
          <Trash2 data-icon="inline-start" />
          删除
        </Button>
```

- [ ] **Step 5: typecheck**

运行：`npm run typecheck`
预期：`ScriptEditorDialog.tsx` 此刻还没传 `onRename`/`onExport`，会报错——预期内，Task 7 修复。确认唯一错误来自 `ScriptEditorDialog.tsx` 的 `<Toolbar>` 调用处缺 props 即可。

- [ ] **Step 6: 提交**

```bash
git add src/features/script-editor/components/Toolbar.tsx
git commit -m "feat(script-editor): add rename/export buttons to toolbar"
```

---

### Task 7: `ScriptEditorDialog.tsx` 接线（删除泛化 + 重命名 + 导出）

**Files:**
- Modify: `src/features/script-editor/ScriptEditorDialog.tsx`

这是最复杂的一步，分成多个子步骤。所有改动都在这一个文件内。

- [ ] **Step 1: import 新增 `stripScriptExtension`**

把文件顶部从 `viewModel` 的 import 块（约 28-39 行）改为加入 `stripScriptExtension`：

```ts
import {
  buildSerialPanelOptions,
  buildSerialPortOptions,
  AUTO_SERIAL_PORT_REFRESH_INTERVAL_MS,
  clampCanvasZoom,
  getNextCanvasNodePosition,
  getNextPaletteNodePosition,
  groupNodesForPalette,
  nextDefaultScriptName,
  normalizeScriptName,
  stripScriptExtension,
  type OverwriteSource
} from '@/features/script-editor/viewModel'
```

- [ ] **Step 2: 状态改造（deleteConfirmOpen → deleteTarget，新增 renameTarget）**

找到现有这两行（约 115-116 行）：

```ts
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ name: string; source: OverwriteSource } | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
```

替换为（把布尔开关升级为携带目标名，并新增 renameTarget）：

```ts
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ name: string; source: OverwriteSource } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
```

- [ ] **Step 3: 改写 `deleteScript` 与 `execDelete`**

找到现有 `deleteScript`（约 306-310 行）：

```ts
  async function deleteScript() {
    // 删除前先确认（对齐 PaneContextMenu 的删除确认）
    if (!activeScriptName) return
    setDeleteConfirmOpen(true)
  }
```

替换为（工具栏入口仍作用于活动脚本，但通过 setDeleteTarget 携带目标）：

```ts
  async function deleteScript() {
    // 工具栏入口：作用于活动脚本（右键入口在 ScriptList 里直接 setDeleteTarget）
    if (!activeScriptName) return
    setDeleteTarget(activeScriptName)
  }
```

找到现有 `execDelete`（约 312-321 行）：

```ts
  async function execDelete() {
    if (!activeScriptName) return
    await getIPC().scripts.delete(activeScriptName)
    setActiveScriptName(null)
    setGraph(createEmptyGraphState())
    setLegacyCode('')
    setSelectedNodeIds([])
    setUiState(closeConfig)
    await refreshScripts()
  }
```

替换为（闭包捕获 target；仅当删的是活动脚本才清画布）：

```ts
  async function execDelete() {
    const target = deleteTarget
    if (!target) return
    await getIPC().scripts.delete(target)
    // 仅当删的是活动脚本时才清空画布（删别的脚本不影响当前编辑）
    if (target === activeScriptName) {
      setActiveScriptName(null)
      setGraph(createEmptyGraphState())
      setLegacyCode('')
      setSelectedNodeIds([])
      setUiState(closeConfig)
    }
    setDeleteTarget(null)
    await refreshScripts()
  }
```

- [ ] **Step 4: 新增 `renameScript` 与 `execRename`**

在 `execDelete` 函数之后（`execOverwrite` 之前）插入：

```ts
  function renameScript() {
    // 工具栏入口：作用于活动脚本（右键入口在 ScriptList 里直接 setRenameTarget）
    if (!activeScriptName) return
    setRenameTarget(activeScriptName)
  }

  async function execRename(newName: string) {
    // PromptDialog 的 onConfirm 会同步 close() → setRenameTarget(null)，故先捕获 oldName。
    const oldName = renameTarget
    if (!oldName) return
    if (newName === oldName) return
    const res = await getIPC().scripts.rename(oldName, newName)
    if (!res.ok) {
      toast.error(`重命名失败：${res.error || '未知错误'}`)
      return
    }
    // 重命名的是活动脚本 → 同步活动名（画布内容不变，下次保存写到新名）
    if (oldName === activeScriptName) setActiveScriptName(newName)
    await refreshScripts()
  }
```

- [ ] **Step 5: 新增 `exportScript` 与 `exportScriptAs`**

在 `execRename` 之后插入：

```ts
  async function exportScript() {
    // 工具栏入口：作用于活动脚本（右键入口在 ScriptList 里直接调 exportScriptAs）
    if (!activeScriptName) return
    await exportScriptAs(activeScriptName)
  }

  async function exportScriptAs(name: string) {
    const res = await getIPC().scripts.exportScript(name)
    if (res.ok) {
      toast.success(`已导出：${res.filePath}`)
    } else if (!res.canceled) {
      toast.error(`导出失败：${res.error || '未知错误'}`)
    }
    // 用户取消保存对话框 → 静默
  }
```

- [ ] **Step 6: 删除 AlertDialog 改为读 deleteTarget**

找到现有删除 AlertDialog（约 556-569 行）：

```tsx
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除脚本</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除脚本「{activeScriptName}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execDelete}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
```

替换为：

```tsx
    <AlertDialog
      open={deleteTarget !== null}
      onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除脚本</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除脚本「{deleteTarget}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={execDelete}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
```

- [ ] **Step 7: 新增重命名 PromptDialog**

在删除 AlertDialog 之后（`</>` 结束之前）插入重命名 PromptDialog：

```tsx
    <PromptDialog
      open={renameTarget !== null}
      onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
      title="重命名脚本"
      description="请输入新的脚本名称"
      defaultValue={renameTarget ? stripScriptExtension(renameTarget) : ''}
      onConfirm={async (v) => {
        const newName = normalizeScriptName(v)
        if (!newName) {
          toast.warning('脚本名无效（不能为空或含非法字符）')
          return
        }
        await execRename(newName)
      }}
    />
```

- [ ] **Step 8: Toolbar 传新 props**

找到 `<Toolbar ... />`（约 579-598 行），在 `onSave={saveScript}` 之后、`onDelete={deleteScript}` 之前加两行：

```tsx
        <Toolbar
          activeScriptName={activeScriptName}
          running={Boolean(runningScriptId)}
          windowMode={windowMode}
          isPopout={isPopout}
          saveDisabled={!!scriptError}
          onNew={createScript}
          onSave={saveScript}
          onRename={renameScript}
          onExport={exportScript}
          onDelete={deleteScript}
          onRun={runScript}
          onStop={stopScript}
          onZoomIn={() => setZoom((value) => clampCanvasZoom(value + 0.1))}
          onZoomOut={() => setZoom((value) => clampCanvasZoom(value - 0.1))}
          onOpenScripts={() => setUiState((current) => openSidePanel(current, 'scripts'))}
          onToggleMaximize={() => setUiState(nextWindowMode)}
          onMinimize={() => setUiState((current) => nextWindowMode(current, 'minimize'))}
          onPopout={handlePopout}
          onDock={handleDock}
          onClose={onClose}
        />
```

- [ ] **Step 9: ScriptList 传新 props**

找到 `<ScriptList ... />`（约 618-627 行），加三个回调：

```tsx
              <ScriptList
                activeScriptName={activeScriptName}
                error={scriptError}
                loading={loadingScripts}
                scripts={scripts}
                onSelect={async (name) => {
                  await selectScript(name)
                  setUiState(closeSidePanel)
                }}
                onRename={(name) => setRenameTarget(name)}
                onDelete={(name) => setDeleteTarget(name)}
                onExport={(name) => { void exportScriptAs(name) }}
              />
```

- [ ] **Step 10: typecheck**

运行：`npm run typecheck`
预期：无错误（Task 5/6 遗留的缺 props 错误应在本步消除）。

- [ ] **Step 11: 跑全部单元测试**

运行：`npm test`
预期：全部 PASS。

- [ ] **Step 12: 提交**

```bash
git add src/features/script-editor/ScriptEditorDialog.tsx
git commit -m "feat(script-editor): wire rename/delete/export with per-item targets"
```

---

### Task 8: E2E spec — 右键重命名/删除/导出 + 工具栏重命名 + 重名边界

**Files:**
- Create: `e2e/script-list-actions.spec.ts`

- [ ] **Step 1: 新建 spec 文件**

创建 `e2e/script-list-actions.spec.ts`，内容：

```ts
import { test, expect, NAV } from './fixtures'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 脚本列表右键菜单 + 工具栏重命名/导出 E2E。
 * 覆盖：右键重命名、重名边界、右键删除、工具栏重命名、导出（mock 原生保存对话框）。
 */
test.describe('脚本列表操作', () => {
  test('右键重命名脚本', async ({ page }) => {
    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 新建一个脚本
    await editor.getByRole('button', { name: '新建' }).click()
    const createDialog = page.getByRole('dialog', { name: '新建脚本' })
    await createDialog.waitFor()
    await createDialog.getByRole('button', { name: '确定' }).click()

    // 打开脚本列表面板
    await editor.getByRole('button', { name: '脚本页' }).click()

    const list = editor.locator('.script-editor-list__items')
    const firstItem = list.locator('button').first()
    const oldName = (await firstItem.textContent())?.trim() || ''

    // 右键 → 重命名
    await firstItem.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '重命名' }).click()

    const renameDialog = page.getByRole('dialog', { name: '重命名脚本' })
    await renameDialog.waitFor()
    const input = renameDialog.getByRole('textbox')
    // 预填应已去掉 .js 后缀
    await expect(input).toHaveValue(oldName.replace(/\.js$/i, ''))

    // 输入新名
    await input.fill('RenamedE2E')
    await renameDialog.getByRole('button', { name: '确定' }).click()

    // 列表出现新名、旧名消失
    await expect(list.locator('button', { hasText: 'RenamedE2E.js' })).toBeVisible({ timeout: 10000 })
    await expect(list.locator('button', { hasText: oldName })).toHaveCount(0)
  })

  test('重命名冲突时报错且不覆盖', async ({ page }) => {
    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    // 新建 A、B 两个脚本（用默认名 Script_1.js、Script_2.js）
    await editor.getByRole('button', { name: '新建' }).click()
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).click()
    await editor.getByRole('button', { name: '新建' }).click()
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).click()

    await editor.getByRole('button', { name: '脚本页' }).click()
    const list = editor.locator('.script-editor-list__items')

    // 右键 Script_1 → 重命名为 Script_2
    await list.locator('button', { hasText: 'Script_1.js' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: '重命名' }).click()
    const renameDialog = page.getByRole('dialog', { name: '重命名脚本' })
    await renameDialog.waitFor()
    await renameDialog.getByRole('textbox').fill('Script_2')
    await renameDialog.getByRole('button', { name: '确定' }).click()

    // 错误 toast 出现
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已存在' })).toBeVisible({ timeout: 10000 })
    // Script_1 仍在列表
    await expect(list.locator('button', { hasText: 'Script_1.js' })).toHaveCount(1)
  })

  test('右键删除脚本', async ({ page }) => {
    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await editor.getByRole('button', { name: '新建' }).click()
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).click()

    await editor.getByRole('button', { name: '脚本页' }).click()
    const list = editor.locator('.script-editor-list__items')
    const firstItem = list.locator('button').first()
    const name = (await firstItem.textContent())?.trim() || ''

    await firstItem.click({ button: 'right' })
    await page.getByRole('menuitem', { name: '删除' }).click()

    const deleteDialog = page.getByRole('dialog', { name: '删除脚本' })
    await deleteDialog.waitFor()
    await deleteDialog.getByRole('button', { name: '删除' }).click()

    await expect(list.locator('button', { hasText: name })).toHaveCount(0, { timeout: 10000 })
  })

  test('工具栏重命名活动脚本', async ({ page }) => {
    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await editor.getByRole('button', { name: '新建' }).click()
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).click()

    // 工具栏重命名按钮
    await editor.getByRole('button', { name: '重命名' }).click()
    const renameDialog = page.getByRole('dialog', { name: '重命名脚本' })
    await renameDialog.waitFor()
    await renameDialog.getByRole('textbox').fill('ToolbarRenamed')
    await renameDialog.getByRole('button', { name: '确定' }).click()

    // 工具栏标题区显示新名
    await expect(editor.locator('.script-editor-current')).toHaveText(/ToolbarRenamed\.js/, { timeout: 10000 })
  })

  test('右键导出脚本到文件', async ({ page, electronApp }) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'saecom-export-'))
    const exportPath = join(tempDir, 'exported.js')

    await page.getByText(NAV.pageScript, { exact: true }).click()
    await page.getByText('打开脚本编辑器').click()
    const editor = page.getByRole('dialog', { name: '脚本编辑器' })
    await editor.waitFor()

    await editor.getByRole('button', { name: '新建' }).click()
    await page.getByRole('dialog', { name: '新建脚本' }).getByRole('button', { name: '确定' }).click()

    // mock 原生保存对话框，避免 OS 模态阻塞测试
    await electronApp.evaluate(async ({ dialog }, path) => {
      ;(dialog as unknown as { showSaveDialog: () => Promise<{ canceled: boolean; filePath: string }> }).showSaveDialog = async () => ({ canceled: false, filePath: path })
    }, exportPath)

    await editor.getByRole('button', { name: '脚本页' }).click()
    const list = editor.locator('.script-editor-list__items')
    await list.locator('button').first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: '导出' }).click()

    // 成功 toast + 文件被写入
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已导出' })).toBeVisible({ timeout: 10000 })
    expect(writeFileSync).toBeTruthy() // 占位校验，下面读文件断言内容
    const { readFileSync, existsSync } = await import('node:fs')
    expect(existsSync(exportPath)).toBeTruthy()
    const content = readFileSync(exportPath, 'utf-8')
    // 导出的应是含流程图标记块的原始 .js 文件（标记为 VS_FLOW_START/VS_FLOW_END，见 persistence.ts）
    expect(content).toContain('VS_FLOW_START')
  })
})
```

说明：
- 选择器全部走可见文本 / role / title / 既有 CSS class（`.script-editor-list__items`、`.script-editor-current`），不新增 data-testid。
- 导出用例通过 `electronApp.evaluate` 在主进程覆盖 `dialog.showSaveDialog`，返回预设临时路径，避免 OS 模态对话框阻塞。
- 流程图标记块标记：脚本文件用 `VS_FLOW_START`/`VS_FLOW_END`（见 `persistence.ts:3-4`），故断言 `content.toContain('VS_FLOW_START')`。

- [ ] **Step 2: typecheck e2e**

运行：`npm run typecheck:e2e`
预期：无错误。

- [ ] **Step 3: build + 跑该 spec**

运行：`npm run build && npx playwright test --config e2e/playwright.config.ts e2e/script-list-actions.spec.ts`（或仓库既有的 e2e 启动方式；若 `npm run test:e2e` 不支持单 spec 过滤，则跑全套 `npm run test:e2e:build`）。
预期：5 条用例全 PASS。

- [ ] **Step 4: 提交**

```bash
git add e2e/script-list-actions.spec.ts
git commit -m "test(script-editor): e2e for script list rename/delete/export + toolbar rename"
```

---

### Task 9: 全量验证

**Files:** 无（仅验证）

- [ ] **Step 1: typecheck 全量**

运行：`npm run typecheck && npm run typecheck:e2e`
预期：无错误。

- [ ] **Step 2: 单元测试全量**

运行：`npm test`
预期：全部 PASS。

- [ ] **Step 3: E2E 全量（build + 跑全套）**

运行：`npm run test:e2e:build`
预期：所有 spec（含新增 `script-list-actions.spec.ts`）全部 PASS。如实报告输出。

- [ ] **Step 4: 手动验证清单（如条件允许）**

`npm run dev` 启动后人工确认：
- 右键脚本项 → 出现菜单（重命名/导出/分隔线/删除）。
- 重命名弹窗预填去后缀名，提交后列表与（若是活动脚本）工具栏标题更新。
- 重命名为已存在名 → toast 报错。
- 导出 → 系统保存对话框 → 选位置 → 成功 toast，文件内容含流程图标记块。
- 工具栏重命名/导出按钮在无活动脚本时 disabled。

---

## Self-Review（计划自检结果）

**1. Spec coverage：**
- §5.1 类型扩展 → Task 2 Step 1 ✓
- §5.2 preload 映射 → Task 2 Step 2 ✓
- §5.3 rename handler → Task 3 ✓
- §5.3 export handler → Task 4 ✓
- §5.4 mock-api 桩 → Task 2 Step 3 ✓
- §6 stripScriptExtension → Task 1 ✓
- §7.1 ScriptList 右键菜单 → Task 5 ✓
- §7.2 Toolbar 按钮 → Task 6 ✓
- §8.1-8.4 编排器 → Task 7 ✓
- §9 边界情况 → 散落在 Task 3/4/7 的实现 + Task 8 E2E 覆盖 ✓
- §10 错误处理 → Task 3/4/7 实现 + Task 8 用例2 覆盖重名 ✓
- §11.1 单测 → Task 1（并入现有文件，已在计划偏差说明）✓
- §11.2 E2E 5 用例 → Task 8 ✓
无遗漏。

**2. Placeholder scan：** 无 TBD/TODO/「适当处理」。Task 8 Step 1 里 `expect(writeFileSync).toBeTruthy()` 是冗余占位校验，已用紧随其后的 `existsSync` 真实断言覆盖——但为彻底消除歧义，执行时应删掉该冗余行（已在说明里隐含，但留此提示）。**执行注意：Task 8 Step 1 中 `expect(writeFileSync).toBeTruthy()` 这一行应在实现时删除**（它只是验证 import 存在，无意义；真实断言是后面的 `existsSync(exportPath)`）。

**3. Type consistency：** `rename(oldName, newName)` / `exportScript(name)` 在 types、preload、mock、main、renderer 五处签名一致。`deleteTarget` / `renameTarget` 在状态声明（Step 2）、execDelete（Step 3）、execRename（Step 4）、AlertDialog（Step 6）、PromptDialog（Step 7）、ScriptList 回调（Step 9）六处使用一致。`stripScriptExtension` 在 viewModel（Task 1）、import（Task 7 Step 1）、PromptDialog defaultValue（Step 7）、单测（Task 1）四处一致。`onRename`/`onExport` 在 Toolbar 接口（Task 6）、解构（Task 6）、Toolbar 调用（Task 7 Step 8）、ScriptList 接口（Task 5）、ScriptList 调用（Task 7 Step 9）一致。
