# React 面板串口工作区集成设计（Phase 2a）

- 日期：2026-06-25
- 分支：develop_srw
- 状态：设计已批准，待实现

## 1. 目标与范围

### 做什么

在 React `MainWindow` 预览窗（`src/mainwindow.html`）里，把已建好的 `SerialPanelWorkspace`（`src/features/serial-panel/`）与外壳、命令页打通，使其在预览窗内功能对齐 legacy `renderer.js` 的串口面板体验。

### 明确不做（避免范围蔓延）

- 不改 `electron/main.ts` 的 `createMainWindow` 入口（仍走 legacy `index.html`），**不做正式 cutover**。
- 不翻转 `useReactPanels` flag（双轨 IPC 互斥约束不变；legacy 仍为主窗口）。
- 不删除/改动 legacy `renderer.js` 串口代码。
- 不动 popout 窗（`src/panel.html` / `src/panel.tsx` 已自包含可用）。
- 不动设置双向同步（`useSettingsStore` 已存在）、不动 YModem/raw 文件发送（已完备）。

### 验收标准

在 React 预览窗（通过 `dev:open-react-mainwindow` 打开）里：

1. 新建串口/TCP 面板、收发数据正常。
2. 侧栏点击面板 → 命令页能识别"当前选中面板"（`activePanelId` 跟随）。
3. 命令卡片点击 → 数据进入当前选中面板；命令可重复发送（周期 + 停止）。
4. 命令分组切换、翻页正常。
5. 串口 tab 显示面板/连接概览（不再是占位"待迁移"）。
6. 脚本 tab 可打开 Phase 1 脚本编辑器。

## 2. 现状与差距

串口面板子系统（`src/features/serial-panel/`）本身已功能完备：`SerialPanelWorkspace`、`store.ts`、`dataBus.ts`、`paneViewModel.ts`、`usePaneInteraction.ts`、`transfer/ymodem.ts`、组件（`FloatingPane`/`PaneHeader`/`DataDisplay`/`SendBar`/`NewPanelDialog`/`PaneList`）。缺的是"接进 MainWindow 外壳及其兄弟页面"：

| # | 差距 | 说明 |
|---|------|------|
| 1 | `activePanelId` 没人写 | `CommandsPage` 读 `appShell.activePanelId`，但 `panels.activeId` 从未同步过去 → 命令永远发不出去 |
| 2 | `CommandsPage.handleSend` 是 TODO | 没按面板 `type(serial/tcp)`/`open`/编码路由，也没重复发送 |
| 3 | 命令页缺翻页/重复发送 UI | `CommandGrid` 只有网格，没有 legacy 的 `cmdRepeat`/`cmdRepeatMs`/`cmdPage`/列行数分页 |
| 4 | 串口 tab 占位 | `BottomNav` 在 `serial` 显示"待迁移"，但工作区其实在上区 → 该 tab 应改为实质内容 |
| 5 | 脚本 tab 入口缺失 | `script` tab 仍是占位，应接 Phase 1 脚本编辑器 |
| 6 | 跨轨暴露缺失 | `window.getSerialPanelSummaries`（脚本编辑器跨轨读取）尚未由 React 侧暴露 |

## 3. 架构总览

保持现有分层，只补**桥接层**和**命令页增强**两块，不重写既有模块：

```
MainWindow (SidebarInset)
├── PanelGroup vertical
│   ├── Panel (上区, 常驻)
│   │   └── Workspace → SerialPanelWorkspace        【既有，不改】
│   │       └── useSerialDataBus / store / FloatingPane ...
│   └── Panel (下区, 按 activeTab 切)
│       └── BottomNav                                【改：补 serial/script tab】
│           ├── serial   → PanelOverviewPanel (新增)  面板/连接概览
│           ├── commands → CommandsPage              【改：完整桥接 + 重复发送 + 翻页】
│           └── script   → 脚本编辑器入口            【接 Phase1 已有 ScriptEditorDialog】

桥接层（新增，src/features/serial-panel/activeBridge.ts）：
  panels.activeId  ←(双向同步)→  appShell.activePanelId
  window.getSerialPanelSummaries  ←(React 侧暴露)  供脚本编辑器跨轨读取
```

### 数据流关键

- `serial-panel/store.ts` 仍是面板生命周期的唯一真源（panels/activeId/listOrder/chunks）。
- `appShell.activePanelId` 是"跨子系统选中的面板"对外契约，被 `CommandsPage`、未来脚本页消费。
- 二者通过 `activeBridge` 双向同步（值变化才写，防循环）。

### 为什么这样分

`activeBridge` 是纯订阅/同步逻辑，无 UI，可独立单测；`CommandsPage` 只负责"读 activePanelId → 路由发送"，不碰面板状态；`CommandGrid` 只管翻页/重复发送 UI。职责单一、边界清晰。

## 4. 模块设计

### 4.1 `activeBridge.ts`（新增）— 双向同步 + 跨轨暴露

`src/features/serial-panel/activeBridge.ts`：

```ts
// 双向同步 panels.activeId ↔ appShell.activePanelId
// - 用 useStore.subscribe 监听两边，值变化才写对方（防循环）
// - installActiveBridge() 在 MainWindow 挂载时调用一次，返回 cleanup
export function installActiveBridge(): () => void

// 供脚本编辑器跨轨读取（替代 legacy window.getSerialPanelSummaries）
// 从 panels store 派生 {id,name,type,open,active,hidden,options}[]
export function getSerialPanelSummaries(): SerialPanelSummary[]
```

实现要点：

- `usePanelsStore.subscribe` 监听 `activeId` → 若 `!== appShell.activePanelId` 则 `setActivePanelId`。
- `useAppShell.subscribe` 监听 `activePanelId` → 若 `!== panels.activeId` 则 `panels.setActive`。
- 两边都"仅在值不同时写"，天然单向流动、无循环。
- `getSerialPanelSummaries` 在 `installActiveBridge` 时挂到 `window.getSerialPanelSummaries`（与 legacy 同名），卸载时删除。字段对齐 legacy（脚本编辑器读的字段）。
- `subscribe` 回调若抛错，吞掉并 `console.error`，不让同步异常炸掉面板渲染。

### 4.2 `BottomNav.tsx`（改）— 补 serial/script tab

- `serial` tab：从"占位"改为 `PanelOverviewPanel`（见 4.3），展示面板列表/连接态/点击聚焦。
- `script` tab：接入 Phase 1 的 `ScriptEditorDialog`。`ScriptEditorDialog` 是全屏对话框（props `{ open: boolean; onClose: () => void }`），所以下区只渲染一个"打开脚本编辑器"入口（按钮/卡片），点击置 `scriptEditorOpen=true`，对话框经 portal 覆盖整窗渲染。`BottomNav` 内用 `useState` 管理 `scriptEditorOpen`，挂载 `<ScriptEditorDialog open={scriptEditorOpen} onClose={() => setScriptEditorOpen(false)} />`。与 `App.tsx` 的 `openReactScriptEditor`（legacy 派发事件路径）并存——预览窗内由本入口直接打开，不依赖 legacy 派发；两条路径互不干扰（各自窗口上下文）。
  - **CSS**：必须在 `mainwindow.tsx`（或 `BottomNav`）引入 `@/features/script-editor/script-editor.css`，否则对话框样式（Rete 画布/节点）缺失。`App.tsx` 已在 legacy 入口引入，但 `mainwindow` 入口是独立的，需单独引入。
- `commands` tab：不变（仍 `CommandsPage`）。

### 4.3 `PanelOverviewPanel.tsx`（新增）— 串口 tab 实质内容

`src/features/main-window/components/PanelOverviewPanel.tsx`：轻量概览（只读 + 聚焦动作）：

- 列出所有面板：`name` / 连接状态点 / `type` / 点击 → `panels.setActive(id)`（→ 经桥接 → appShell）。
- 空态："暂无面板，在侧栏新建"。
- **不重复** `PaneList` 的增删改，避免双写；这里只做"概览 + 聚焦"，侧栏做"管理"。定位差异明确。

### 4.4 `CommandsPage.tsx`（改）— 完整命令发送桥接

复刻 legacy `sendCommand`（`renderer.js:3551`）：

- 读 `appShell.activePanelId` + `panels.panels[id]` 拿 `type`/`open`。
- `doWrite(data, mode, append)`：`type==='tcp'` → `ipc.tcp.write`，否则 `ipc.serial.write`；编码跟随 `useSettingsStore.charEncoding`。
- **单次**：`res.ok` 失败 → notice；成功 → echo（`echoSend` 设置）。
- **重复发送**：`cmdRepeat` toggle + `cmdRepeatMs`。开启时对同一 cmd 复用 `setInterval`，再点则清除；状态记录到 `repeaters: Map<cmdId, timer>`（module 级，镜像 legacy `cmdIntervalMap`）。`cmdRepeat` 关闭时清空所有。
- 面板未选/未开 → notice 降级（既有逻辑）。
- 卸载时清所有 interval。

### 4.5 `commands/sendCommand.ts`（新增）— 纯函数，便于测试

抽离命令发送核心逻辑为纯函数/可测单元：

```ts
// 按面板类型路由写入（serial/tcp），返回 IPC 结果
export async function routeWrite(
  panel: Panel,
  ipc: WindowAPI,
  data: string,
  mode: 'text' | 'hex',
  append: AppendMode,
  encoding: string
): Promise<{ ok: boolean; error?: string }>
```

重复发送的 interval 建立与清除也封装于此（接受 `repeaters` Map 与回调），便于用 fake timer 单测，不耦合 React。

### 4.6 `CommandGrid.tsx`（改）— 翻页 + 重复发送态

复刻 legacy 翻页（`cmdPage`/列行数）：

- 加 `cols`/`rows` 选择（组件内 state，**不持久化**——与 legacy 一致，legacy `cmdCols`/`cmdRows` 仅运行时状态、不写 commands config），`cmdPage` 状态（同样不持久化，切回时回首页），`上一页/下一页`，`totalCmdPages()`。
- 默认 `cols=4`，`rows` 按一页能放下取整数（或固定如 3，与 legacy 默认一致；以实现时核对 legacy 默认为准）。
- 卡片在重复发送态加视觉（`auto` 标记，镜像 legacy `cardEl.classList.add('auto')`）。
- `onSend(cmd)` 行为：若 `cmdRepeat` 开 → 重复；否则单次（逻辑在 `CommandsPage`，`CommandGrid` 只回调 + 渲染态）。

### 4.7 测试

- `test/active-bridge.test.ts`：双向同步（mock 两个 store，改一边另一边跟上、值相同时不写、卸载后不再同步）。
- `test/commands-send.test.ts`：`routeWrite` 的 serial/tcp 分支 + 未开面板降级；重复发送用 fake timer 测 interval 建/清。

## 5. 数据契约与边界

### 新增类型（`src/features/serial-panel/types.ts`）

```ts
/** 供脚本编辑器跨轨读取的面板概要（对齐 legacy window.getSerialPanelSummaries 字段） */
export interface SerialPanelSummary {
  id: string
  name: string
  type: 'serial' | 'tcp'
  open: boolean
  active: boolean
  hidden: boolean
  options?: SerialOptions
}
```

### `activeBridge` 防循环契约

- 同步只在 `a !== b` 时写对方。两个 `subscribe` 各自只写对面 store，绝不写自己监听的 store → 任何时刻只有一边发起写入，不会 ping-pong。
- `appShell.activePanelId` 与 `panels.activeId` 都允许为 `null`（无选中）；`null === null` 时不写。
- `panels.setActive(null)` 时 `appShell.activePanelId` 跟随为 `null`（侧栏收起聚焦时已调用 `setActive(null)`，见 `PaneList`）。

### IPC 边界（不变）

本次改动**不新增任何 IPC channel**。命令发送复用既有 `serial.write`/`tcp.write`；面板数据走既有 `dataBus`。双轨互斥约束（legacy 与 React 不能同时绑 `serial:data`）不受影响——预览窗与 legacy 主窗是不同 `BrowserWindow`，各自独立注册，本就如此。

### `window.getSerialPanelSummaries` 双轨注意

legacy 主窗和 React 预览窗是**不同窗口/不同 JS 上下文**，各自有自己的 `window`。React 侧挂 `window.getSerialPanelSummaries` 只影响预览窗自己的脚本编辑器，不污染 legacy 窗口。因此**无冲突**，无需 flag 守卫。

### 出错处理

- `installActiveBridge` 内 `subscribe` 回调若抛错，吞掉并 `console.error`。
- 命令发送 `ipc.write` 失败/异常 → notice 降级（既有模式），不阻断。
- 预览窗无 ipc（web 预览）→ `useIPC` 抛错由既有各处的 try/catch 兜底，不新增处理。

## 6. 实现顺序与验证

### 实现顺序（每步可独立验证，"先桥接后消费"）

1. **类型 + activeBridge**：加 `SerialPanelSummary` 类型；写 `activeBridge.ts`（双向同步 + `getSerialPanelSummaries`）；写 `test/active-bridge.test.ts`。
2. **挂载桥接**：`MainWindow.tsx` 在 `useEffect` 调 `installActiveBridge()`，卸载调 cleanup。
3. **命令发送纯函数**：抽 `routeWrite` + 重复发送逻辑到 `commands/sendCommand.ts`；写 `test/commands-send.test.ts`。
4. **CommandsPage 接桥**：用 `routeWrite` + `repeaters` Map 替换 TODO；接 `appShell.activePanelId`。
5. **CommandGrid 翻页**：加 `cols/rows/cmdPage` + 重复发送态视觉。
6. **串口 tab 实质内容**：新增 `PanelOverviewPanel`，`BottomNav` 的 `serial` 分支替换占位。
7. **脚本 tab 入口**：`BottomNav` 的 `script` 分支渲染"打开脚本编辑器"入口 + 受控 `ScriptEditorDialog`（`useState` 管理 open）；在 `mainwindow.tsx` 引入 `@/features/script-editor/script-editor.css`。

### 验证命令（AGENTS.md/CLAUDE.md 要求）

- `npm test`（新增 2 个测试文件通过 + 既有回归不破）。
- `npm run typecheck`（app + node 两套 tsconfig）。

### 手动验证（预览窗，写进 PR）

1. `npm run dev` → 触发 `dev:open-react-mainwindow` 打开 React 预览窗。
2. 新建串口/TCP 面板 → 收发数据正常；侧栏点击面板 → `appShell.activePanelId` 跟随（命令页"当前面板"显示对）。
3. 命令页：选面板 + 点卡片 → 数据进面板；开启重复发送 → 周期发送，再点停止；翻页正常。
4. 串口 tab：显示概览列表，点击聚焦联动工作区。
5. 脚本 tab：打开脚本编辑器。

## 7. 受影响文件

| 文件 | 操作 |
|------|------|
| `src/features/serial-panel/types.ts` | 改：加 `SerialPanelSummary` |
| `src/features/serial-panel/activeBridge.ts` | 新增 |
| `src/features/main-window/MainWindow.tsx` | 改：挂载 `installActiveBridge` |
| `src/mainwindow.tsx` | 改：引入 `script-editor.css`（独立入口，与 legacy `App.tsx` 分开） |
| `src/features/main-window/components/BottomNav.tsx` | 改：serial/script tab 实质内容 |
| `src/features/main-window/components/PanelOverviewPanel.tsx` | 新增 |
| `src/features/commands/CommandsPage.tsx` | 改：完整命令发送桥接 |
| `src/features/commands/sendCommand.ts` | 新增（纯函数） |
| `src/features/commands/components/CommandGrid.tsx` | 改：翻页 + 重复发送态 |
| `test/active-bridge.test.ts` | 新增 |
| `test/commands-send.test.ts` | 新增 |

## 8. 风险

- **双向同步循环**：用"值变化才写"+ 各 subscribe 只写对面 store 规避；单测覆盖"值相同时不写"。
- **重复发送泄漏**：组件卸载、`cmdRepeat` 关闭、再点同卡 都须清 interval；单测 fake timer 覆盖。
- **预览窗与 legacy 共存**：不新增 IPC、不改 flag，双轨互斥约束不变；`window.getSerialPanelSummaries` 仅作用于各自窗口上下文，无冲突。
