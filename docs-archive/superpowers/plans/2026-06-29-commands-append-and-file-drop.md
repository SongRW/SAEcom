# 命令发送结尾符 + 拖放文件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修两个 React 版功能缺失 bug——命令发送读取活动面板的 append（而非硬编码 `'none'`）；拖放文件到「文件名」输入框经 preload `webUtils.getPathForFile` 取真实路径。

**Architecture:** Bug1 是单行参数改动（`CommandsPage.tsx` 调用方传对 append，`routeWrite` 不动）。Bug2 分三层：preload 暴露 `webUtils.getPathForFile` → `FileAPI` 类型加 `getPath` → renderer 给文件名 Input 加 `onDragOver`/`onDrop`。两 bug 互不依赖，可独立实现、独立提交、独立验证。

**Tech Stack:** TypeScript / React / Electron 31（preload + contextBridge）/ Vitest

**Spec:** `docs/superpowers/specs/2026-06-29-commands-append-and-file-drop-design.md`

---

## File Structure

| 文件 | 责任 | 改动类型 |
|------|------|----------|
| `src/features/commands/CommandsPage.tsx` | 命令发送读活动面板 append | 修改（1 行） |
| `electron/preload.ts` | preload 暴露 `file.getPath`（包 `webUtils.getPathForFile`） | 修改（+import / +1 字段） |
| `shared/types.ts` | `FileAPI` 接口加 `getPath` 类型 | 修改（+1 字段） |
| `src/features/main-window/components/ActivePanelConfigPanel.tsx` | 文件名 Input 加拖放处理 | 修改（+onDragOver/onDrop） |

无新建文件。改动集中在 4 个已存在文件，每个职责单一。

---

## Task 1：命令发送读活动面板的 append

**Files:**
- Modify: `src/features/commands/CommandsPage.tsx:57-74`（`sendOnce` 函数）

- [ ] **Step 1: 修改 `sendOnce`，从 `panel.sendOptions.append` 读结尾符**

把 `src/features/commands/CommandsPage.tsx:68` 这一行：

```ts
    const res = await routeWrite(panel, ipc, cmd.data || '', (cmd.mode || 'text') as 'text' | 'hex', 'none', charEncoding || 'utf-8')
```

替换为：

```ts
    const append = panel.sendOptions?.append ?? 'CRLF'
    const res = await routeWrite(panel, ipc, cmd.data || '', (cmd.mode || 'text') as 'text' | 'hex', append, charEncoding || 'utf-8')
```

说明：`panel` 在第 63 行已取（`usePanelsStore.getState().panels[id]`），且第 64-67 行已判过 `!panel` 提前返回，此处 `panel` 非空。`panel.sendOptions` 由 `genPanel` 初始化为 `DEFAULT_SERIAL_SEND_OPTIONS`（`store.ts:32`），一定存在；`?? 'CRLF'` 仅作防御兜底，默认值 `'CRLF'` 对齐 legacy（`renderer.js:3565` 的 `appendSel?.value || 'CRLF'`）。

- [ ] **Step 2: typecheck 通过**

Run: `npm run typecheck`
Expected: 无报错（`append` 是 `AppendMode` 类型，`routeWrite` 第 5 参正是 `AppendMode`，类型吻合）。

- [ ] **Step 3: 跑现有命令发送测试，确认无回归**

Run: `npx vitest run test/commands-send.test.ts`
Expected: 全部 PASS。`routeWrite` 未改，现有 4 个 routeWrite case + 3 个 RepeatManager case 不受影响。

- [ ] **Step 4: 提交**

```bash
git add src/features/commands/CommandsPage.tsx
git commit -m "fix(commands): send with active panel append instead of hardcoded 'none'"
```

---

## Task 2：preload 暴露 `webUtils.getPathForFile`

**Files:**
- Modify: `electron/preload.ts:1`（import 行）
- Modify: `electron/preload.ts:92-95`（`file` 命名空间）
- Modify: `shared/types.ts:260-264`（`FileAPI` 接口）

- [ ] **Step 1: `shared/types.ts` 的 `FileAPI` 加 `getPath` 字段**

把 `shared/types.ts` 中（约 260-264 行）：

```ts
export interface FileAPI {
  readHex: (filePath: string) => Promise<unknown>
  /** 「导入文件」（发送文件用）专用：打开对话框。与日志保存(logger:pickFile)解耦 */
  pickOpen: () => Promise<string | null>
}
```

替换为：

```ts
export interface FileAPI {
  readHex: (filePath: string) => Promise<unknown>
  /** 「导入文件」（发送文件用）专用：打开对话框。与日志保存(logger:pickFile)解耦 */
  pickOpen: () => Promise<string | null>
  /** 从拖放的 File 对象取真实磁盘路径（包 webUtils.getPathForFile，Electron 31 替代已移除的 File.path） */
  getPath: (file: File) => string
}
```

- [ ] **Step 2: `electron/preload.ts` import 加 `webUtils`**

把 `electron/preload.ts:1`：

```ts
import { contextBridge, ipcRenderer, shell } from 'electron'
```

替换为：

```ts
import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
```

说明：已核验 `node_modules/electron/electron.d.ts`——`webUtils` 是 electron 顶级导出（`const webUtils: WebUtils`），`getPathForFile(file: File): string` 定义在 `WebUtils` 内。

- [ ] **Step 3: `electron/preload.ts` 的 `file` 命名空间加 `getPath`**

把 `electron/preload.ts` 中（约 92-95 行）：

```ts
  file: {
    readHex: (filePath) => ipcRenderer.invoke('file:readHex', filePath),
    pickOpen: () => ipcRenderer.invoke('file:pickOpen')
  },
```

替换为：

```ts
  file: {
    readHex: (filePath) => ipcRenderer.invoke('file:readHex', filePath),
    pickOpen: () => ipcRenderer.invoke('file:pickOpen'),
    getPath: (file: File) => webUtils.getPathForFile(file)
  },
```

说明：`webUtils.getPathForFile` 是同步函数，纯 preload 调用，不走 main 进程 IPC、无需新增 handler。`File` 对象必须在 preload 内调用（经 `contextBridge` 序列化会丢失内部路径引用）。

- [ ] **Step 4: typecheck 通过**

Run: `npm run typecheck`
Expected: 无报错。`FileAPI` 新增的 `getPath` 由 preload 实现，类型吻合；`webUtils` 类型来自 electron 自带 `.d.ts`。

- [ ] **Step 5: 提交**

```bash
git add electron/preload.ts shared/types.ts
git commit -m "feat(preload): expose file.getPath via webUtils.getPathForFile"
```

---

## Task 3：文件名 Input 加拖放处理

**Files:**
- Modify: `src/features/main-window/components/ActivePanelConfigPanel.tsx:328-334`（文件名 `<Input>`）

**前置依赖：** Task 2 已完成（`ipc.file.getPath` 可用）。

- [ ] **Step 1: 给文件名 `<Input>` 加 `onDragOver` / `onDrop`**

把 `src/features/main-window/components/ActivePanelConfigPanel.tsx` 中（约 328-334 行）：

```tsx
        <Input
          type="text"
          readOnly
          className="h-6 w-56"
          placeholder="也可直接拖拽文件到此处…"
          value={fileName}
        />
```

替换为：

```tsx
        <Input
          type="text"
          readOnly
          className="h-6 w-56"
          placeholder="也可直接拖拽文件到此处…"
          value={fileName}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (!f) return
            try {
              const fp = ipc.file.getPath(f)
              if (!fp) return
              setFilePath(fp)
              setFileName(f.name)
            } catch (err) {
              appendSysLine(pnl.id, `[错误] 拖放取路径失败：${String(err)}`)
            }
          }}
        />
```

说明：
- `onDragOver` 必须 `preventDefault`，否则浏览器默认行为（打开文件/导航）会拦截 drop 事件，`onDrop` 永不触发。设 `dropEffect='copy'` 给拖放视觉提示，对齐 legacy（`renderer.js:3285`）。
- `onDrop` 取 `files[0]`（首个文件，对齐 legacy 单文件语义）→ 调 `ipc.file.getPath(f)` 拿真实路径 → 写入与「选择文件」按钮共用的 `filePath`/`fileName` state。`handleSendFile` 读 `filePath` 发送，无需改动。
- 失败（`getPath` 抛异常或返回空串）走 `appendSysLine` 在面板数据区提示 `[错误]`，与现有错误行一致，不抛到全局。
- `ipc`、`setFilePath`、`setFileName`、`appendSysLine`、`pnl` 在本组件均已存在（第 59、72、73、66、88 行），无需新增 import 或 state。

- [ ] **Step 2: typecheck 通过**

Run: `npm run typecheck`
Expected: 无报错。`onDragOver`/`onDrop` 的 React 事件类型、`ipc.file.getPath` 签名均吻合。

- [ ] **Step 3: 跑全量测试，确认无回归**

Run: `npm test`
Expected: 全部 PASS。本改动纯 UI 事件绑定，不触及任何单测覆盖的纯逻辑。

- [ ] **Step 4: 提交**

```bash
git add src/features/main-window/components/ActivePanelConfigPanel.tsx
git commit -m "feat(panel-config): wire file drag-drop onto filename input"
```

---

## Task 4：手动验证（Electron）

**Files:** 无（运行时验证）

- [ ] **Step 1: 启动 dev 环境并验证 Bug1（命令 append）**

Run: `npm run dev`

操作与预期：
1. 选一个串口面板 → 在底部「当前面板配置区」把「发送结尾」设为 `CRLF`。
2. 点命令卡片发送 → 对端（或回显）确认收到命令内容 + `\r\n`。
3. 把「发送结尾」改为 `无结尾` → 再发 → 确认不带任何结尾符。
4. 把「发送结尾」改为 `CR` → 发 → 确认只带 `\r`；`LF` → 只带 `\n`。
5. 切到 TCP 面板，重复 → 确认 TCP 发送同样带 append。
6. 开启重复发送（repeatBar）→ 发送期间改「发送结尾」→ 确认下一帧用新 append。

- [ ] **Step 2: 验证 Bug2（拖放文件）**

操作与预期：
1. 从系统文件管理器拖一个文件到「文件名」输入框 → 确认文件名填入、路径拿到（点「发送文件」能发出）。
2. 拖多个文件 → 确认只取第一个。
3. 拖一个已被删除/无权限的路径 → 确认面板数据区出现 `[错误] 拖放取路径失败：...` 而非应用崩溃。

- [ ] **Step 3: 全量回归命令**

Run: `npm run typecheck && npm test`
Expected: 全部通过。

---

## Self-Review（计划编写者自检，已完成）

**1. Spec 覆盖：**
- ✅ Bug1（命令读活动面板 append）→ Task 1。
- ✅ Bug2 preload `webUtils.getPathForFile` → Task 2 Step 2-3。
- ✅ Bug2 `FileAPI.getPath` 类型 → Task 2 Step 1。
- ✅ Bug2 文件名 Input 拖放 → Task 3。
- ✅ 手动验证（spec「验证」章节 7 项）→ Task 4。
- 无遗漏。

**2. Placeholder 扫描：** 无 TBD/TODO/「类似上文」/「适当处理」等。每个代码步骤都给了完整可粘贴代码。

**3. 类型一致性：** `getPath: (file: File) => string` 在 Task 2 Step 1（接口）与 Step 3（实现）一致；`ipc.file.getPath(f)` 在 Task 3 调用，签名吻合。`append` 在 Task 1 是 `AppendMode`，与 `routeWrite` 第 5 参一致。
