# 脚本页：重命名 + 右键菜单（重命名/删除/导出）— 设计文档

- **日期**：2026-07-06
- **分支**：develop_srw
- **状态**：待用户审阅
- **范围**：脚本编辑器的脚本列表项右键菜单 + 工具栏新增「重命名」「导出」按钮

## 1. 目标与背景

脚本页（`ScriptEditorDialog`）当前只能：

- 通过工具栏「新建」创建脚本；
- 通过工具栏「删除」删除**当前活动**脚本；
- 通过工具栏「保存」/另存为覆盖或新建。

缺失能力：

- **无法重命名**已存在的脚本；
- **无法导出**脚本到磁盘任意位置；
- 脚本列表项**无右键菜单**，删除/重命名/导出没有针对列表项的入口。

本次新增：脚本列表项右键菜单（重命名 / 删除 / 导出），并在工具栏新增「重命名」「导出」按钮（作用于当前活动脚本）。删除/重命名的能力同时从「仅活动脚本」泛化为「可指定任意列表项」。

## 2. 需求决策（已与用户确认）

| 决策点 | 选择 |
|---|---|
| 入口范围 | 右键菜单（重命名/删除/导出）+ 工具栏新增「重命名」「导出」按钮 |
| 导出内容 | 完整的原始 `.js` 文件（流程图标记块 + 生成的代码） |
| 重名处理 | 禁止重名：主进程返回错误，renderer toast 报错，不弹覆盖确认 |
| 重命名输入框 | 预填去掉 `.js` 后缀的名字主体，提交时 `normalizeScriptName` 自动补回后缀 |

## 3. 方案选型

**选定方案 A：新增 IPC 通道 + 复用现有对话框组件。**

候选方案对比：

- **方案 A（选定）**：重命名新增 `scripts:rename` IPC（主进程 `fs.renameSync`，目标存在则报错），导出新增 `scripts:export` IPC（主进程 `dialog.showSaveDialog` + 写文件），renderer 复用 `PromptDialog` / `AlertDialog`。
  - 优点：主进程统一文件操作（原子 rename、标准系统保存对话框、跨平台路径安全），与现有架构一致，renderer 改动小。
  - 缺点：动 4 个文件层（main / preload / types / renderer）。
- **方案 B（否决）**：纯 renderer 端组合，重命名 = `read(old) → write(new) → delete(old)`。
  - 否决理由：非原子（中途失败留脏状态）；导出在 renderer 用 Blob 下载绕过原生保存对话框；与「文件操作集中在主进程」的现有约定不一致。
- **方案 C（否决）**：扩展现有 `FileAPI` 通用化（加 `saveDialog`/`writeFile`）。
  - 否决理由：偏离本次需求范围（YAGNI）；重命名仍需脚本专属逻辑。

## 4. 架构与改动范围

| 层 | 文件 | 改动 |
|---|---|---|
| 类型契约 | `shared/types.ts` | `ScriptsAPI` 增 `rename` / `exportScript` 签名 |
| Preload | `electron/preload.ts` | 增 `scripts:rename` / `scripts:export` invoke 映射 |
| 主进程 | `electron/main.ts` | 增两个 `ipcMain.handle`（`fs.renameSync` + `dialog.showSaveDialog`） |
| Web 预览 | `src/shared/dev/mock-api.ts` | `scripts` 加 `rename` / `exportScript` 桩 |
| ViewModel | `src/features/script-editor/viewModel.ts` | 新增 `stripScriptExtension(name)` |
| 列表组件 | `src/features/script-editor/components/ScriptList.tsx` | 增 `onRename`/`onDelete`/`onExport` props；每项包 `ContextMenu` |
| 工具栏 | `src/features/script-editor/components/Toolbar.tsx` | 增「重命名」「导出」按钮 + 对应 props |
| 编排器 | `src/features/script-editor/ScriptEditorDialog.tsx` | 通用化删除目标、新增重命名/导出流程、新增 PromptDialog/AlertDialog 接线 |
| 单测 | `test/script-rename-export.test.ts` | 覆盖 `stripScriptExtension` |
| E2E | `e2e/script-list-actions.spec.ts` | 覆盖右键重命名/删除/导出 + 工具栏重命名 + 重名边界 |

**不在本次范围**：导入脚本、批量删除、撤销。

## 5. IPC 契约与主进程处理器

### 5.1 `ScriptsAPI` 类型扩展（`shared/types.ts`）

两个新方法都用对象返回 `{ok, error?}` 的形状，对齐现有 `scripts:write` / `scripts:delete` 风格，不向 renderer 抛异常（renderer 用 `if (!res.ok)` 判断 + toast）。

```ts
export interface ScriptsAPI {
  dir: () => Promise<string>
  list: () => Promise<string[]>
  read: (name: string) => Promise<string>
  write: (name: string, content: string) => Promise<unknown>
  delete: (name: string) => Promise<unknown>
  // 新增
  rename: (oldName: string, newName: string) => Promise<{ ok: boolean; error?: string }>
  exportScript: (name: string) => Promise<{ ok: boolean; canceled?: boolean; error?: string; filePath?: string }>
  // 既有
  run: (code: string, ctx: ScriptRunContext) => Promise<{ runId: string }>
  stop: (runId: string) => Promise<unknown>
  onEnded: (cb: (p: ScriptEndedPayload) => void) => () => void
  onLog: (cb: (p: ScriptLogPayload) => void) => () => void
}
```

### 5.2 Preload 映射（`electron/preload.ts`）

在 `scripts:` 对象里紧跟 `delete` 之后：

```ts
rename: (oldName, newName) => ipcRenderer.invoke('scripts:rename', { oldName, newName }),
exportScript: (name) => ipcRenderer.invoke('scripts:export', name),
```

### 5.3 主进程处理器（`electron/main.ts`，紧跟 `scripts:delete` 之后）

**rename** — 原子重命名，目标已存在则拒绝（禁止重名，不覆盖）：

```ts
ipcMain.handle('scripts:rename', (_e, { oldName, newName }) => {
  ensureScriptsDir()
  const old = path.join(scriptsDir, safeScriptName(oldName))
  const next = path.join(scriptsDir, safeScriptName(newName))
  if (!fs.existsSync(old)) return { ok: false, error: '源脚本不存在' }
  if (old === next) return { ok: true }              // 规范化后相同（含仅大小写差异）→ no-op 成功
  if (fs.existsSync(next)) return { ok: false, error: '该名称已存在' }  // 禁止重名
  try { fs.renameSync(old, next); return { ok: true } }
  catch (e) { return { ok: false, error: String(e?.message || e) } }
})
```

设计要点：

- **禁止重名**（确认决策）：目标已存在直接 `{ok:false, error:'该名称已存在'}`，不弹覆盖确认。
- **大小写处理**：`safeScriptName` 不做大小写归一化，但 `old === next` 兜底「仅大小写差异」（Windows 文件系统不区分大小写，同路径 renameSync 是 no-op）。
- **原子性**：单次 `fs.renameSync`，比 read+write+delete 安全（中途崩溃不丢数据）。

**exportScript** — 系统保存对话框，写完整 `.js` 文件（照搬 `panel:saveLog` 模式）：

```ts
ipcMain.handle('scripts:export', async (_e, name) => {
  const src = path.join(scriptsDir, safeScriptName(name))
  if (!fs.existsSync(src)) return { ok: false, error: '脚本不存在' }
  const content = fs.readFileSync(src, 'utf-8')        // 导出磁盘真实内容（流程图标记块 + 代码）
  const defaultPath = name.replace(/\.js$/i, '')       // 默认文件名去后缀
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出脚本',
    defaultPath,
    filters: [{ name: 'JavaScript', extensions: ['js'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try { fs.writeFileSync(filePath, content, 'utf-8'); return { ok: true, filePath } }
  catch (e) { return { ok: false, error: String(e?.message || e) } }
})
```

设计要点：

- **导出原始 `.js` 文件**（确认决策）：直接 `readFileSync` 磁盘上的脚本文件，不在 renderer 重组内容。
- **读取在主进程**：避免 renderer 先 `read` 再传回的往返开销，且保证导出磁盘真实内容（而非 renderer 当前未保存的内存图）。

### 5.4 Web 预览桩（`src/shared/dev/mock-api.ts`）

```ts
rename: async () => ({ ok: true }),
exportScript: async () => ({ ok: true, filePath: '/mock/export.js' }),
```

保持 web 预览不崩（E2E 不跑 web 预览，typecheck 覆盖）。

## 6. ViewModel 辅助（`viewModel.ts`）

新增一个纯函数，用于重命名弹窗预填。提交时复用现有 `normalizeScriptName` 补回后缀，不重复实现校验。

```ts
/** 去掉 .js 后缀用于重命名弹窗预填：Foo.js → Foo。无后缀原样返回。 */
export function stripScriptExtension(name: string): string {
  return name.replace(/\.js$/i, '')
}
```

## 7. 组件改造

### 7.1 `ScriptList.tsx` — 右键菜单

扩展 props，每个列表项包一层 `ContextMenu`。菜单顺序：重命名 / 导出 / 分隔线 / 删除（destructive 视觉区分，危险操作放末尾）。

```tsx
import { Button } from '@/components/ui/button'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger
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

设计要点：

- **右键目标 = 被右键的项**：`onRename/onDelete/onExport(name)` 直接传该项名字，不依赖「先选中」。这是与现有「删除只针对 active」的核心区别。
- **左键点击仍走 `onSelect`**：`ContextMenuTrigger asChild` 包裹 Button，右键触发菜单、左键仍触发 Button 的 onClick（Radix 默认行为，不冲突）。

### 7.2 `Toolbar.tsx` — 新增两个按钮

按钮位置：保存 · **重命名** · **导出** · 删除（夹在保存和删除之间）。图标用 `@phosphor-icons/react` 的 `PencilSimple`（重命名）和 `DownloadSimple`（导出），与现有 Toolbar 的 phosphor 风格一致。两个按钮都 `disabled={!activeScriptName}`，与现有「删除」按钮的禁用条件一致。

```tsx
interface ToolbarProps {
  // ...现有 props...
  onRename: () => void      // 新增（作用于 activeScriptName）
  onExport: () => void      // 新增（作用于 activeScriptName）
}
```

```tsx
<Button size="sm" variant="outline" title="保存" onClick={onSave} disabled={saveDisabled}>
  <Save data-icon="inline-start" />保存
</Button>
<Button size="sm" variant="outline" title="重命名" onClick={onRename} disabled={!activeScriptName}>
  <PencilSimple data-icon="inline-start" />重命名
</Button>
<Button size="sm" variant="outline" title="导出" onClick={onExport} disabled={!activeScriptName}>
  <DownloadSimple data-icon="inline-start" />导出
</Button>
<Button size="sm" variant="outline" title="删除" onClick={onDelete} disabled={!activeScriptName}>
  <Trash2 data-icon="inline-start" />删除
</Button>
```

## 8. 编排器状态机与流程接线（`ScriptEditorDialog.tsx`）

### 8.1 状态变更

| 旧状态 | 新状态 | 说明 |
|---|---|---|
| `deleteConfirmOpen: boolean` | `deleteTarget: string \| null` | open = `deleteTarget !== null`；携带被删脚本名 |
| — | `renameTarget: string \| null` | 新增；驱动重命名 PromptDialog |

删除状态从「布尔开关」升级为「携带目标名」，让右键删非活动脚本、工具栏删活动脚本共用一套。重命名同理。**导出无状态**（系统保存对话框自带 UI，不需要 renderer 侧确认框）。

### 8.2 三个操作的处理函数

**删除（泛化）**：

```ts
async function deleteScript() {
  // 工具栏入口：作用于活动脚本
  if (!activeScriptName) return
  setDeleteTarget(activeScriptName)
}

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

要点：`execDelete` 用闭包捕获 `target`，清画布前判断 `target === activeScriptName`。右键删非活动脚本只刷新列表，不打扰当前编辑。

**重命名（新增）**：

```ts
function renameScript() {
  // 工具栏入口：作用于活动脚本
  if (!activeScriptName) return
  setRenameTarget(activeScriptName)
}

async function execRename(newName: string) {
  const oldName = renameTarget   // 闭包捕获：close() 会先于 await 把 renameTarget 置空
  if (!oldName) return
  if (newName === oldName) return              // 名字规范化后相同 → no-op（含仅改大小写）
  const res = await getIPC().scripts.rename(oldName, newName)
  if (!res.ok) {
    toast.error(`重命名失败：${res.error || '未知错误'}`)   // 含「该名称已存在」
    return
  }
  // 重命名的是活动脚本 → 同步活动名（画布内容不变，下次保存写到新名）
  if (oldName === activeScriptName) setActiveScriptName(newName)
  await refreshScripts()
}
```

要点：在 `onConfirm` 顶部立即 `const oldName = renameTarget` 捕获，因为 `PromptDialog` 的 `handleConfirm` 会同步调用 `close()` → `onOpenChange(false)` → `setRenameTarget(null)`，await 之后 `renameTarget` 已是 null。

**导出（新增）**：

```ts
async function exportScript() {
  // 工具栏入口：作用于活动脚本
  if (!activeScriptName) return
  await exportScriptAs(activeScriptName)
}

async function exportScriptAs(name: string) {
  const res = await getIPC().scripts.exportScript(name)
  if (res.ok) toast.success(`已导出：${res.filePath}`)
  else if (!res.canceled) toast.error(`导出失败：${res.error || '未知错误'}`)
  // 用户取消保存对话框 → 静默，不 toast
}
```

### 8.3 弹窗 JSX 接线

**删除 AlertDialog**（改 `deleteConfirmOpen` → `deleteTarget`）：

```tsx
<AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>删除脚本</AlertDialogTitle>
      <AlertDialogDescription>确定删除脚本「{deleteTarget}」吗？此操作不可撤销。</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction onClick={execDelete}>删除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**重命名 PromptDialog**（新增，紧跟现有两个 PromptDialog 之后）：

```tsx
<PromptDialog
  open={renameTarget !== null}
  onOpenChange={(open) => { if (!open) setRenameTarget(null) }}
  title="重命名脚本"
  description="请输入新的脚本名称"
  defaultValue={renameTarget ? stripScriptExtension(renameTarget) : ''}
  onConfirm={async (v) => {
    const newName = normalizeScriptName(v)
    if (!newName) { toast.warning('脚本名无效（不能为空或含非法字符）'); return }
    await execRename(newName)
  }}
/>
```

### 8.4 下游组件 props 接线

```tsx
<Toolbar
  {...}                       // 现有 props
  onRename={renameScript}     // 新增
  onExport={exportScript}     // 新增
/>
<ScriptList
  activeScriptName={activeScriptName}
  error={scriptError}
  loading={loadingScripts}
  scripts={scripts}
  onSelect={async (name) => { await selectScript(name); setUiState(closeSidePanel) }}
  onRename={(name) => setRenameTarget(name)}            // 新增：右键直接设目标
  onDelete={(name) => setDeleteTarget(name)}            // 新增
  onExport={(name) => { void exportScriptAs(name) }}    // 新增
/>
```

## 9. 边界情况

| 情况 | 行为 |
|---|---|
| 右键重命名非活动脚本 | 仅改文件名 + 刷列表，活动脚本画布不动 |
| 右键重命名活动脚本 | 改文件名 + `setActiveScriptName(new)`，画布内容保留（下次保存写到新名） |
| 重命名后名字与原名仅大小写不同 | `normalizeScriptName` 后相等 → `execRename` 早退 no-op（主进程 `old===next` 也兜底） |
| 重命名目标已存在 | 主进程返回 `{ok:false}` → toast 报错「该名称已存在」，不覆盖。注意 PromptDialog 在 `onConfirm` 时会自动关闭（`handleConfirm` 同步调 `close()`），故失败时弹窗已关，用户需重新右键重命名重试（与现有「新建/另存为」对话框行为一致） |
| 重命名输入非法/为空 | `normalizeScriptName` 返回 null → toast.warning。同样地弹窗已自动关闭，用户需重新打开重命名 |
| 右键删除非活动脚本 | 仅删文件 + 刷列表，画布不动 |
| 右键删除活动脚本 | 删文件 + 清画布 + 清 active |
| 导出时用户取消保存对话框 | `{ok:false, canceled:true}` → 静默 |
| 工具栏重命名/导出按钮在无 active 脚本时 | `disabled`（与现有删除按钮一致） |

## 10. 错误处理

所有新操作沿用现有「IPC 返回 `{ok, error?}`、renderer 判 `!ok` → toast」模式，不在 renderer 抛异常。

| 操作 | 失败场景 | 处理 |
|---|---|---|
| rename | 源文件不存在（竞态：右键后他人删了） | 主进程 `{ok:false, error:'源脚本不存在'}` → toast.error |
| rename | 目标名已存在 | 主进程 `{ok:false, error:'该名称已存在'}` → toast.error，不覆盖。弹窗已自动关闭，用户重新右键重命名 |
| rename | 名字规范化后非法/为空 | renderer `normalizeScriptName` 返回 null → toast.warning。弹窗已自动关闭 |
| rename | `fs.renameSync` 抛错（权限/磁盘） | 主进程 catch → `{ok:false, error:msg}` → toast.error |
| export | 源文件不存在 | 主进程 `{ok:false, error:'脚本不存在'}` → toast.error |
| export | 用户取消保存对话框 | 主进程 `{ok:false, canceled:true}` → **静默**（不算错误） |
| export | `writeFileSync` 抛错（路径不可写） | 主进程 catch → `{ok:false, error:msg}` → toast.error |
| delete（右键） | 源文件不存在 | 现有 `scripts:delete` 已 `fs.existsSync` 兜底 → `{ok:true}`，列表刷新后该项消失 |

文案统一：重命名 `重命名失败：<error>`；导出成功 `已导出：<filePath>`、失败 `导出失败：<error>`。所有 toast 用现有 `sonner` 的 `toast.error/warning/success`。

## 11. 测试

### 11.1 单元测试（Vitest）— `test/script-rename-export.test.ts`

覆盖纯函数层（不碰 IPC/Electron）：

- `stripScriptExtension('Foo.js')` → `'Foo'`
- `stripScriptExtension('Foo')` → `'Foo'`（无后缀原样返回）
- `stripScriptExtension('a.b.js')` → `'a.b'`（只去末尾 `.js`）
- `normalizeScriptName` 对重命名输入的复用行为（已有覆盖则不重复）

主进程 handler 涉及 `fs`/`dialog`/Electron，按现有测试约定放在 E2E 验证（`test/` 下无 Electron 集成测试基建）。

### 11.2 E2E（Playwright Electron）— `e2e/script-list-actions.spec.ts`

复用 `fixtures.ts`（隔离 userData）。脚本通过 UI 创建（与现有 `script-editor.spec.ts` 一致），再右键操作。

| # | 用例 | 关键断言 |
|---|---|---|
| 1 | 右键重命名 | 新建脚本 → 列表项 `click({button:'right'})` → 点「重命名」→ PromptDialog 出现且预填去后缀名 → 输入新名 → 确定 → 列表出现新名、旧名消失 |
| 2 | 重命名冲突 | 新建 A、B → 右键 A 重命名为 B 的名字 → 断言错误 toast「已存在」出现 + A 仍在列表 |
| 3 | 右键删除 | 新建脚本 → 右键 → 「删除」→ 确认 AlertDialog → 列表项消失 |
| 4 | 工具栏重命名 | 新建脚本并选中 → 工具栏「重命名」按钮 → 改名 → 断言列表改名 + 工具栏标题区显示新名 |
| 5 | 导出 | 右键 → 「导出」→ 通过 `electronApp.evaluate` 在主进程 mock `dialog.showSaveDialog` 返回预设临时路径 → 断言文件被写入 + 成功 toast 出现 |

**导出对话框 mock**（Playwright Electron 处理原生 OS 对话框的标准做法）：

```ts
await electronApp.evaluate(async ({ dialog }, tempPath) => {
  ;(dialog as any).showSaveDialog = async () => ({ canceled: false, filePath: tempPath })
}, tempPath)
```

**选择器策略**：

- 右键：`scriptList.locator('button', { hasText: name }).click({ button: 'right' })`
- 菜单项：`page.getByRole('menuitem', { name: '重命名' })`（Radix ContextMenuItem 角色为 menuitem）
- toast：sonner 渲染为 `[data-sonner-toast]`，文本断言 `await expect(page.locator('[data-sonner-toast]').filter({ hasText: '已存在' })).toBeVisible()`
- PromptDialog / AlertDialog：复用现有 spec 的 `getByRole('dialog')` + 文本定位

## 12. 验证清单（实现完成后）

- `npm test`（含新增 `script-rename-export.test.ts`）
- `npm run typecheck`（含 e2e 配置 `npm run typecheck:e2e`）
- `npm run test:e2e:build`（含新增 `script-list-actions.spec.ts`，全部通过）
