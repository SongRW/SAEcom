# 命令发送结尾符 + 拖放文件 — 设计

**日期**: 2026-06-29
**范围**: React 命令页（`CommandsPage.tsx`）+ 当前面板配置区（`ActivePanelConfigPanel.tsx`）+ preload/类型
**动机**: 两个独立 bug，都属「React 版功能缺失/对齐 legacy」：
1. **命令发送结尾符 append 丢失**：`CommandsPage.tsx:68` 调 `routeWrite` 时把第 5 参 `append` 硬编码成 `'none'`，命令发送永远不带 CRLF 等结尾。legacy（`renderer.js:3565`）读全局 `#append`，React 版已有「每面板独立」的发送结尾选择器（`ActivePanelConfigPanel.tsx:307` 的 `panel.sendOptions.append`），命令发送却没读它。
2. **拖放文件到面板发送无效**：`ActivePanelConfigPanel.tsx:328-334` 的文件名 `Input` 有 placeholder「也可直接拖拽文件到此处…」但无 `onDrop` 处理。legacy（`renderer.js:3286`）用 `f.path`（Electron 专属），但 Electron 31 已移除 `File.path`，须走 `webUtils.getPathForFile`（preload 运行）。

## 已确认决策

| 项 | 决定 |
|----|------|
| 命令发送 append 来源 | 复用当前活动面板的 `panel.sendOptions.append`，不在命令域新增 UI |
| append 兜底默认 | `'CRLF'`（与 legacy `appendSel?.value \|\| 'CRLF'` 一致；`paneViewModel.ts:97` 的 `DEFAULT_SERIAL_SEND_OPTIONS.append` 即 `'CRLF'`） |
| `routeWrite` 改动 | 不改。append 透传已被 `commands-send.test.ts` 现有 4 个 case 覆盖，bug 仅在调用方 |
| 文件拖放取路径方式 | preload 包一层 `webUtils.getPathForFile`（Electron 官方给 `File.path` 的迁移路径，forward-compatible） |
| 拖放与「选择文件」按钮的关系 | 共用同一套 `filePath`/`fileName` state，`handleSendFile` 无需改动 |
| 测试策略 | Bug1 靠 `routeWrite` 已有覆盖 + 手动；Bug2 依赖 Electron 运行时，jsdom 不可测，靠手动 |

## 背景

### 现有基础设施（可直接复用）

- `src/features/commands/sendCommand.ts:15-34` — `routeWrite(panel, ipc, data, mode, append, encoding)` 已正确接收并按面板类型路由 `serial.write` / `tcp.write`，透传 append。签名不动。
- `src/features/serial-panel/types.ts:17-27` — `SendOptions { append: AppendMode; hexMode; echoSend; bufferTime }`，每面板独立。
- `src/features/serial-panel/paneViewModel.ts:96-97` — `DEFAULT_SERIAL_SEND_OPTIONS.append = 'CRLF'`。
- `src/features/main-window/components/ActivePanelConfigPanel.tsx` — 已有 `panel.sendOptions.append` 的「发送结尾」`<Select>`（L4 行），切换 activeId 自动回填。文件名 `Input`（L5 行）已有 `filePath`/`fileName` state 与 `handleChooseFile`/`sendFile`/`handleSendFile` 全套发送逻辑，只缺拖放入口。
- `electron/preload.ts:92-95` — `file` 命名空间已有 `readHex`/`pickOpen`，加 `getPath` 同模式。
- `shared/types.ts:260-264` — `FileAPI` 接口，加 `getPath` 字段。

### 为何轻量

- Bug1 修复是**单行参数改动**：`CommandsPage.tsx:68` 把硬编码 `'none'` 换成 `panel.sendOptions.append`。`sendOnce` 内已经 `usePanelsStore.getState().panels[id]` 拿到了 `panel`，零额外查询。
- Bug2 修复是**3 处小加法**：preload +2 行、types +1 行、ActivePanelConfigPanel 给 Input 加 `onDragOver`/`onDrop`。逻辑极简（取 file → 调 ipc 拿路径 → 写 state）。
- 两 bug 互不依赖，可独立实现与验证。

## 设计

### Bug 1：命令发送读活动面板的 append

**改动点**：`src/features/commands/CommandsPage.tsx` 的 `sendOnce()`（约第 57-74 行）。

当前第 68 行：
```ts
const res = await routeWrite(panel, ipc, cmd.data || '', (cmd.mode || 'text') as 'text' | 'hex', 'none', charEncoding || 'utf-8')
```

改为读 `panel.sendOptions.append`，兜底 `'CRLF'`：
```ts
const append = panel.sendOptions?.append ?? 'CRLF'
const res = await routeWrite(panel, ipc, cmd.data || '', (cmd.mode || 'text') as 'text' | 'hex', append, charEncoding || 'utf-8')
```

- `panel` 在上方已取（`const panel = usePanelsStore.getState().panels[id]`，且判过 `!panel` 返回），`panel.sendOptions` 一定存在（`genPanel` 初始化时 `sendOptions ?? DEFAULT_SERIAL_SEND_OPTIONS`，见 `store.ts:32`）。`?? 'CRLF'` 仅作防御兜底。
- 不动 `routeWrite`、不动 `sendCommand.ts` 的 `RepeatManager`、不在 `CommandGrid` 加任何新 UI。
- echo 回显（`echoIfEnabled`）不动——legacy 的 echo 只回显 `cmd.data` 本身不含结尾符，此处行为不变。

### Bug 2：拖放文件

**改动点 1 — `electron/preload.ts`**：
顶部 import 加 `webUtils`：
```ts
import { contextBridge, ipcRenderer, shell, webUtils } from 'electron'
```
`file` 命名空间（第 92-95 行）加 `getPath`：
```ts
file: {
  readHex: (filePath) => ipcRenderer.invoke('file:readHex', filePath),
  pickOpen: () => ipcRenderer.invoke('file:pickOpen'),
  getPath: (file: File) => webUtils.getPathForFile(file)
}
```
- `webUtils.getPathForFile(file)` 是 Electron 给已移除 `File.path` 的官方迁移 API，同步返回真实磁盘路径（类型见 `electron.d.ts`）。必须在 preload 调用——`File` 对象经 `contextBridge` 序列化后丢失内部路径引用。
- 无需新增 IPC handler（不走 main 进程，纯 preload 同步调用）。

**改动点 2 — `shared/types.ts`**：
`FileAPI`（第 260-264 行）加字段：
```ts
export interface FileAPI {
  readHex: (filePath: string) => Promise<unknown>
  /** 「导入文件」（发送文件用）专用：打开对话框。与日志保存(logger:pickFile)解耦 */
  pickOpen: () => Promise<string | null>
  /** 从拖放的 File 对象取真实磁盘路径（包 webUtils.getPathForFile，Electron 31 替代已移除的 File.path） */
  getPath: (file: File) => string
}
```

**改动点 3 — `src/features/main-window/components/ActivePanelConfigPanel.tsx`**：
给文件名 `Input`（约第 328-334 行）加拖放处理：
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
- `onDragOver` 必须 `preventDefault` 否则浏览器默认行为会拦截 drop（打开文件）。设 `dropEffect='copy'` 给视觉提示，对齐 legacy（`renderer.js:3285`）。
- `onDrop` 取 `files[0]` → 调 `ipc.file.getPath(f)` 拿真实路径 → 写入与「选择文件」按钮共用的 `filePath`/`fileName` state。`handleSendFile` 读 `filePath` 发送，无需任何改动。
- 失败（`getPath` 抛异常或返回空）走 `appendSysLine` 在面板数据区提示，与现有 `[错误]` 行一致。
- 仅取首个文件（`files[0]`），对齐 legacy 单文件语义。

## 不改动

- `routeWrite` / `sendCommand.ts` 的签名与逻辑——append 透传已被测试覆盖。
- `CommandGrid` / `repeatBar` / 重复发送逻辑——与 append 无关。
- `file.readHex` / `sendFile` / YModem 发送——基于路径的发送链路不动，拖放只是另一个填路径的入口。
- 全局 `#append`（legacy 概念）——React 架构是每面板独立 append，不引入全局选择器。

## 风险与缓解

1. **`webUtils` 在 Electron 31 可用性**：已核验——`node_modules/electron/electron.d.ts` 中 `webUtils` 是顶级导出（`const webUtils: WebUtils`），`getPathForFile(file: File): string` 定义在 `WebUtils` 接口内。`import { webUtils } from 'electron'` 可直接在 preload 使用。`webUtils.getPathForFile` 是 Electron 官方给已移除 `File.path` 的迁移 API。
2. **拖放在打包后是否生效**：`webUtils.getPathForFile` 在 sandboxed renderer 下要求 preload 以 `contextBridge` 暴露（本仓正是此模式），打包后行为一致。手动验证需在 `npm run dev` 实测。
3. **命令域无独立 append 选择器是否够用**：已确认复用面板 append。命令发送面向「当前活动面板」，读活动面板的 append 语义清晰；用户改结尾在面板配置区的「发送结尾」下拉，所见即所得。
4. **重复发送时的 append 一致性**：`sendOnce` 同时服务单次与重复发送（`RepeatManager.toggle(cmd.id, ms, () => sendOnce(cmd))`），重复发送每次都现读活动面板 append——用户中途改下拉，下一次发送即生效，符合预期。

## 验证

- `npm run typecheck` — preload `webUtils` import、`FileAPI.getPath` 类型、CommandsPage 参数类型应通过。
- `npm test` — `commands-send.test.ts` 现有 case 不受影响（routeWrite 未改），全量跑确保无回归。无新增单测（Bug1 靠已有覆盖；Bug2 依赖 Electron 运行时不可单测）。
- 手动（Electron `npm run dev`）：
  1. **Bug1**：选一个串口面板 → 当前面板配置区把「发送结尾」设为 `CRLF` → 点命令卡片发送 → 确认对端收到命令内容 + `\r\n`。
  2. **Bug1**：把「发送结尾」改为 `无结尾` → 再发 → 确认不带任何结尾符。
  3. **Bug1**：切到 TCP 面板，重复上述 → 确认 TCP 发送也带 append。
  4. **Bug1**：开启重复发送 → 发送期间改「发送结尾」→ 确认下一帧用新 append。
  5. **Bug2**：从系统文件管理器拖一个文件到「文件名」输入框 → 确认文件名填入、路径拿到（点「发送文件」能发出）。
  6. **Bug2**：拖多个文件 → 确认只取第一个。
  7. **Bug2**：拖放异常路径（如已删除文件）→ 确认面板数据区有 `[错误]` 提示而非崩溃。

## 影响与回滚

- 改动文件：
  - `src/features/commands/CommandsPage.tsx`（+1 行 append 读取）
  - `electron/preload.ts`（+`webUtils` import、+`file.getPath`）
  - `shared/types.ts`（+`FileAPI.getPath` 字段）
  - `src/features/main-window/components/ActivePanelConfigPanel.tsx`（文件名 Input 加 `onDragOver`/`onDrop`）
- 无数据迁移、无持久化格式变化——回滚纯还原文件。
- 无行为破坏性变更：Bug1 是修正（命令本就该带 append）；Bug2 是补全（placeholder 早就承诺的功能）。
