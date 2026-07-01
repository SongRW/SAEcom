# 设计文档：新面板底部功能区对齐老面板 `#page-serial`

- 日期：2026-06-26
- 分支：`develop_srw`
- 状态：待评审
- 关联代码：
  - 老面板 `renderer.js`（`setActive` 1644-1688、`fillPortSelect` 2136、`applyBottomPanelForPane` 1044、`writeOptions`/`attachOptionListeners` 3236-3258、共享 `4452-4530`）；DOM `src/index.html:65-153`（`#page-serial`）
  - 新面板 `src/features/main-window/components/BottomNav.tsx`、`PanelOverviewPanel.tsx`、`src/features/serial-panel/store.ts`、`types.ts`、`paneViewModel.ts`、`components/SendBar.tsx`、`dataBus.ts`

## 1. 目标与范围

把新 React 面板底部的「概览 / serial」标签页，从**只读面板列表**改造成**当前选中面板的配置区**，完整复刻老面板 `#page-serial` 的功能。让新面板底部功能区在语义上「始终绑定当前选中面板」，与老面板一致。

### 在范围内

- 新建 `ActivePanelConfigPanel` 组件，替换 `BottomNav` 中 `serial` 分支的 `PanelOverviewPanel`
- 每面板独立的「发送选项」数据模型（`SendOptions`），对齐老面板 `pane.options` 的发送字段
- 底部配置区渲染：面板名 + 辅助按钮、串口参数、发送选项、文件发送、共享端口
- 切换面板时自动回填（受控组件直接读 `panel.*`，天然对齐老 `setActive`→`fillPortSelect`）
- 无选中面板时空状态
- `SendBar` 发送选项状态源迁移到 store（每面板独立）
- 双轨兼容（`panels.json` 双写、向后兼容缺字段）
- 配套 Vitest 测试

### 不在范围内

- 浮动面板的发送栏（每面板独立）—— 保留现状
- 命令页、脚本页、关于页 —— 完全不动
- 侧边栏 `PaneList`（面板增删改、连接切换）—— 不动
- `activeBridge` / `appShell` 三标签骨架 —— 不动
- 示波器（老面板独立 `window.open` 窗口）—— 仅占位按钮 + toast，单独任务迁移
- XModem / ZModem 协议后端 —— UI 项标记「暂未实现」禁用，单独任务
- TCP 共享后端深度实现 —— IPC 契约已存在，前端接通；若 preload 未实现则降级为 toast

## 2. 现状对比

| 维度 | 老面板 `#page-serial` | 新面板「概览」标签页 | 差距 |
|---|---|---|---|
| 绑定对象 | 当前选中面板 `state.activeId` | 无（全局只读列表） | 新面板不绑定 |
| 串口参数 | 波特率/数据位/停止位/校验，可改可回填 | 无 | 缺失 |
| 发送选项 | append/hexMode/echoSend/bufferTime，每面板独立 | `SendBar` 本地 `useState`，部分全局 | 作用域错 + 不持久化 |
| 文件发送 | raw/XModem/YModem/ZModem | SendBar 内 raw/YModem | 缺 XModem/ZModem（标记禁用） |
| 共享端口 | 共享端口/共享为 TCP（serial only） | 无 | IPC 已存在，前端未接 |
| 切换面板回填 | `setActive`→`fillPortSelect` | 无 | 缺失 |
| 辅助按钮 | 示波器/导出/行数限制/实时日志 | 散在 `PaneHeader` | 霐集中到配置区 |
| 无面板状态 | 空 `#activePanelLabel` | —— | 需空状态 |

## 3. 数据模型扩展

### 3.1 新增 `SendOptions` 类型

`src/features/serial-panel/types.ts`：

```ts
import type { AppendMode } from '@shared/types'

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

### 3.2 默认值

`src/features/serial-panel/paneViewModel.ts`（紧邻 `DEFAULT_SERIAL_OPTIONS`）：

```ts
export const DEFAULT_SERIAL_SEND_OPTIONS = {
  append: 'none' as const,
  hexMode: false,
  echoSend: false, // 对齐全局 useSettingsStore.echoSend 默认值（settings.ts:45）
  bufferTime: 50   // 对齐全局 useSettingsStore.bufferTime 默认值（settings.ts:44）
}
```

> 默认值对齐 `src/shared/store/settings.ts` 的全局默认（`echoSend: false`、`bufferTime: 50`），避免迁移后默认行为回归。`bufferTime` 用 50 而非 0，与全局默认一致。

### 3.3 `Panel` 类型扩展

`types.ts` 的 `Panel` 与 `PanelConfig` 都新增字段：

```ts
export interface Panel {
  // ... 原有字段
  sendOptions: SendOptions
}
```

### 3.4 store 改动

`src/features/serial-panel/store.ts`：

- `genPanel`：`sendOptions: params.sendOptions ?? { ...DEFAULT_SERIAL_SEND_OPTIONS }`
- `PanelsState` 新增 action：
  ```ts
  updateSendOptions: (id: string, options: Partial<SendOptions>) => void
  ```
  实现类比已有 `updateOptions`（`store.ts:251-257`）：写回 `panel.sendOptions` 并 `persist()`。
- `persist()`（`store.ts:93-122`）：在写出 config 时附带 `sendOptions` 字段。为双轨兼容，同时把它扁平写进 legacy 风格的可选字段（`appendMode`/`hexMode`/`echoSend`/`bufferTime`），让 legacy `renderer.js` 读到不报错；legacy 侧已有防御读取（本任务不修改 legacy 代码，仅在持久化结构上保持可忽略）。
- `load()`（`store.ts:351-390`）：回填 `sendOptions` 时用 `?? DEFAULT_SERIAL_SEND_OPTIONS`，保证旧数据无该字段时得到默认值（向后兼容）。

## 4. 新组件 `ActivePanelConfigPanel`

文件：`src/features/main-window/components/ActivePanelConfigPanel.tsx`

### 4.1 数据源

```ts
const activeId = usePanelsStore((s) => s.activeId)          // 经 activeBridge 与 appShell.activePanelId 同步
const panel = usePanelsStore((s) => (activeId ? s.panels[activeId] : null))
const updateOptions = usePanelsStore((s) => s.updateOptions)
const updateSendOptions = usePanelsStore((s) => s.updateSendOptions)
```

**回填**：受控组件直接读 `panel.options` / `panel.sendOptions`；`activeId` 变化触发重渲染即回填，**天然对齐**老面板 `setActive`→`fillPortSelect`，无需 effect。

### 4.2 布局（复刻 `#page-serial` 行结构）

紧凑横向排列，适配底部约 38% 高度。使用项目已有 shadcn 组件（`Select`/`Input`/`Label`/`Button`/`Switch`）。

| 行 | 内容 | serial | tcp |
|---|---|---|---|
| L1 面板名行 | `当前面板：` + `panel.name` + 辅助按钮组（示波器 / 导出 / 行数限制 / 实时日志） | 显示 | 显示 |
| L2 串口参数行 | 波特率 / 数据位 / 停止位 / 校验（`Select`，onChange 写回 `updateOptions`） | 显示 | **整行隐藏**（对齐 `applyBottomPanelForPane` 1044-1053） |
| L3 发送选项行 | 结尾符 `append` / HEX发送 `hexMode` / 发送回显 `echoSend` / 接收缓冲 `bufferTime`（写回 `updateSendOptions`） | 显示 | 显示 |
| L4 文件发送行 | 选文件按钮 + 协议下拉（raw / YModem 可用；XModem / ZModem 标记「暂未实现」禁用）+ 发送 | 显示 | 显示 |
| L5 共享行 | 共享端口 / 共享为 TCP（`ipc.tcpShare.start/stop/status`） | 显示 | **隐藏** |

### 4.3 串口参数候选项（对齐老面板）

- 波特率：9600 / 19200 / 38400 / 57600 / 115200（+ 自定义数字输入，可选）
- 数据位：8 / 7 / 6 / 5
- 停止位：1 / 1.5 / 2
- 校验：none / even / odd / mark / space（类型已在 `SerialOptions.parity`）

### 4.4 辅助按钮行为

- **示波器**：toast「示波器暂未迁移」（占位，单独任务）
- **导出**：复用 `PaneHeader` 已有导出逻辑，抽成共享 util（如 `src/features/serial-panel/exportLog.ts`），配置区与 PaneHeader 共用
- **行数限制**：对应老面板 `LIMIT_VIEW_COUNT`（per-pane 显示上限）。新面板当前是全局 `CHUNK_LIMIT` 常量（`store.ts:7`），**无 per-pane UI 也无 settings 字段**。决策：本任务**仅占位**（按钮显示但点击 toast「行数限制暂未实现」），per-pane 化留作后续任务。spec 中明确标注此为**简化处理**
- **实时日志**：复用 `setLogging` + IPC 选路径（对齐老面板 `#btnRealtimeLog`）

> 行数限制的 per-panel 化是已知简化点，写入 spec 「风险/已知简化」一节。

### 4.5 无选中面板空状态

`activeId == null` 或 `panel == null` 时渲染空状态卡片：

> 请先选中一个面板（在工作区点击面板，或从侧边栏列表选择）

所有输入禁用。

## 5. `SendBar` 发送选项状态迁移

`src/features/serial-panel/components/SendBar.tsx`：

| 当前来源 | 迁移后来源 |
|---|---|
| `const [mode, setMode] = useState('text')` | `panel.sendOptions.hexMode`（`mode = hexMode ? 'hex' : 'text'`） |
| `const [append, setAppend] = useState('none')` | `panel.sendOptions.append` |
| `useSettingsStore((s) => s.echoSend)` | `panel.sendOptions.echoSend`（per-panel 覆盖全局） |
| `settings.bufferTime`（在 `dataBus.ts:45`） | `panel.sendOptions.bufferTime`（dataBus 改读面板级） |

改动：

- 删除 `SendBar` 内 `mode`/`append` 的本地 `useState`
- 发送时写回：用户切换 hex/append 时调 `updateSendOptions(panel.id, { hexMode, append })`
- **保留** `SendBar` 内的 hex/append 快捷切换 UI（状态源切到 store，配置区与发送栏两处一致，避免用户必须切到底部才能改）
- `dataBus.ts` 的 `bufferTime` 改为读对应面板的 `sendOptions.bufferTime`（dataBus 已按 panelId 分发，传参即可）
- `echoSend` 全局设置作为新建面板的**默认初值**，运行期完全用 per-panel

### 5.1 `dataBus` bufferTime 传参

`dataBus.ts:45` 当前 `const bufferTime = settings.bufferTime ?? 0`。改为接收 panel 级 bufferTime（dataBus 的注册回调已带 panelId 上下文，从 store 查 `panels[panelId].sendOptions.bufferTime`）。

## 6. `BottomNav` 改动

`src/features/main-window/components/BottomNav.tsx:34`：

```tsx
// 原：content = <PanelOverviewPanel />
content = <ActivePanelConfigPanel />
```

`PanelOverviewPanel.tsx` **保留文件**（不删，避免误伤；后续可能复用于侧边栏详情），仅从 BottomNav 移除引用。`BottomNav` 顶部 import 同步移除 `PanelOverviewPanel`。

## 7. 共享端口接通

`shared/types.ts:200-204` 已有 `TcpShareAPI`（`start(id, port)`/`stop(id)`/`status(id)`）。

- L5 共享行渲染 serial 面板时：输入端口号 + 启动/停止按钮
- 启动：`ipc.tcpShare.start(panel.id, port)`；停止：`ipc.tcpShare.stop(panel.id)`
- 状态查询：`ipc.tcpShare.status(panel.id)` 决定按钮态
- **降级**：若 preload 未实现该 API（运行期 `ipc.tcpShare` 为 undefined 或抛错），点击 toast「共享功能后端待迁移」，不阻塞主目标。需在 mock-api（`src/mock-api.js`）补一个空实现避免 web 预览崩溃。

## 8. 测试

新增 `test/active-panel-config.test.ts`（Vitest，Node 环境）：

1. `updateOptions` 写回面板 options 并触发 persist（mock `ipc.config.save` 断言被调用、参数含新 options）
2. `updateSendOptions` 写回 panel.sendOptions 并 persist
3. `load()` 对缺 `sendOptions` 的旧数据回填 `DEFAULT_SERIAL_SEND_OPTIONS`（向后兼容）
4. 切换 `activeId` 时配置区数据源切换 —— 测 `ActivePanelConfigPanel` 在不同 `activeId` 下读取的面板对象正确（用 react render 测试或纯选择器函数）
5. TCP 面板时串口参数行不渲染（`panel.type === 'tcp'` 条件）
6. 无 `activeId` 时空状态渲染

运行：`npm test` + `npm run typecheck`（AGENTS.md 要求）。

## 9. 风险与已知简化

- **双轨兼容**：`sendOptions` 双写到 `panels.json`。legacy `renderer.js` 读旧字段（`hexMode`/`append` 等）时本任务不修改 legacy 代码，仅保证持久化结构不破坏 legacy 运行（legacy 侧已有 `?? ` 防御读取的习惯）。需在实现时验证 legacy 加载新格式数据不报错。
- **向后兼容**：现有面板无 `sendOptions`，`load()` 必须用 `?? DEFAULT_SERIAL_SEND_OPTIONS`，已写入第 3.4 节。
- **已知简化**：行数限制**仅占位**（按钮 toast「暂未实现」），因为新面板当前是全局 `CHUNK_LIMIT` 常量、无 per-pane 数据模型，完整 per-pane 化留作后续。示波器、XModem/ZModem 为占位/禁用。
- **回退点**：`BottomNav.tsx` 一行 import 还原即可恢复概览页；`PanelOverviewPanel.tsx` 保留不删。
- **发送栏与配置区双控**：两处都写 `panel.sendOptions`，状态源唯一（store），不会冲突。

## 10. 不改动项（清单）

- `FloatingPane` / `PaneHeader` / `DataDisplay` / `SendBar` 发送栏 UI（仅改 SendBar 状态源）
- `CommandsPage` / `CommandGrid` / `RepeatManager`
- `ScriptEditorDialog` 及脚本编辑器全部
- 关于页 / 设置对话框
- `PaneList`（侧边栏）
- `activeBridge` / `appShell`（仅消费 `activeId`，不改其逻辑）
- 老面板 `renderer.js` / `src/index.html` / `styles.css`

## 11. 验收标准

1. 底部「概览」标签页变为「当前面板配置区」，显示当前选中面板的串口参数 + 发送选项 + 文件发送 + 共享
2. 切换工作区面板时，配置区参数自动回填为新面板的值（无需手动刷新）
3. 改波特率/校验等立即生效并持久化（重启后保留）
4. 发送选项（hex/append/echo/缓冲）每面板独立，切换面板各自保留
5. TCP 面板时隐藏串口参数行与共享行
6. 无面板选中时显示空状态
7. `npm test` 全绿，新增测试覆盖上述 1-6
8. `npm run typecheck` 通过
9. 老面板加载新格式 `panels.json` 不报错（手动验证）
