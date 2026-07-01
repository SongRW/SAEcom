# 面板「保留条数」限制 — 设计文档

- 日期：2026-06-28
- 分支：develop_srw
- 关联入口：
  - `src/features/main-window/components/ActivePanelConfigPanel.tsx:198`「设置数据显示条数」按钮（当前 toast「暂未实现」）
  - `src/features/serial-panel/components/PaneContextMenu.tsx:95`「设置保留条数」菜单项（当前 appendSysLine「暂未实现」）
- 对齐 legacy：`renderer.js:1595-1637`（`toggleLimitView` / `updateLimitBtnUI`）、`renderer.js:169-221`（`showLimitDialog`）、`renderer.js:1144`（`LIMIT_VIEW_COUNT=1000`）、`renderer.js:2499-2500`（createPane 默认值）、`renderer.js:1396-1432`（`trimPane`）

## 1. 背景与目标

React 版串口面板当前只有全局硬编码常量 `CHUNK_LIMIT = 1000`（`store.ts:7`），无 per-pane「保留条数」数据模型，也无任何 UI/交互。底部配置区按钮、工作区面板右键菜单各有一个占位入口，点击只弹「暂未实现」系统行。

这两个入口本质是 legacy 同一个功能（`toggleLimitView`）的两个触发点。本任务把它完整迁移到 React 版：per-pane 引入「是否限制 + 保留条数」字段，弹数字输入框，支持「关闭限制」，限制立即生效并持久化，两个入口共用同一套 store action + 弹窗组件。

### 决策汇总（已与用户确认）

1. **功能范围**：完整对齐 legacy（per-pane、可开关、限制条数 = chunk 数）
2. **数值约束**：原样照搬 legacy —— `<=0` 归一为 1000，`<10` 归一为 10，最小 10
3. **生效时机**：用户改完立即裁剪现有超限历史数据
4. **trim 接入点**：store 内部（`appendChunk` 读 panel 字段 + `setLimit` 立即 trim）
5. **弹窗 UI**：扩展现有 `PromptDialog` 支持左下角「关闭限制」副作用按钮（方案 A）

## 2. 数据模型 (`types.ts` + `store.ts`)

### 2.1 `Panel` 新增字段

对齐 legacy `pane.limitView` / `pane.limitCount`：

```ts
/** 是否启用「保留最新 N 条」限制（对应 legacy pane.limitView）。false 时仅按全局上限兜底 */
limitView: boolean
/** 保留条数（对应 legacy pane.limitCount，默认 LIMIT_VIEW_COUNT=1000） */
limitCount: number
```

### 2.2 常量（`store.ts` 顶部）

```ts
const LIMIT_VIEW_COUNT = 1000  // 默认保留条数（对齐 legacy renderer.js:1144）
```

现有 `CHUNK_LIMIT = 1000` **保留**，作为 `limitView=false` 时的兜底硬上限。

> 与 legacy 的差异：legacy `trimPane` 在 `limitView=false` 且非 logging 时按字符数 `LOG_MAX_CHARS` 兜底（`renderer.js:1423`）。React 版统一用 chunk 数兜底——更简单，且 `CHUNK_LIMIT` 数值与 `LIMIT_VIEW_COUNT` 相同，对用户行为无变化。React 版的 `textBuffer/hexBuffer` 由 `trimChunks` 同步裁剪，不会因 chunk 数兜底而字符数失控。

### 2.3 `genPanel` 初始化

```ts
limitView: false,
limitCount: LIMIT_VIEW_COUNT,
```

对齐 legacy `renderer.js:2499-2500`。

### 2.4 store action

新增：

```ts
/** 设置面板「保留条数」限制（对应 legacy toggleLimitView）。
 *  limitView=false 时关闭限制（仅全局上限兜底）；limitView=true 时用 limitCount。
 *  立即对现有 chunks 做一次 trim，并持久化。 */
setLimit: (id: string, limitView: boolean, limitCount: number) => void
```

### 2.5 `appendChunk` 改动

trim 时用的 limit 从硬编码 `CHUNK_LIMIT` 改为：

```ts
const limit = p.limitView ? p.limitCount : CHUNK_LIMIT
```

调用方（`dataBus.ts` / `SendBar.tsx` / `CommandsPage.tsx`）无感知。

### 2.6 `setLimit` 内部逻辑

1. `set` 写回 `limitView` / `limitCount`
2. 立即对现有 chunks 调 `trimChunks(chunks, textBuffer, hexBuffer, limit)`，limit 取新值（`limitView=false` 时用 `CHUNK_LIMIT` 兜底，等于不额外裁剪）
3. `persist()`

由于 `chunks` / `textBuffer` / `hexBuffer` 是 store 响应式数据，`DataDisplay` 订阅 panel 后自动重渲染，用户立刻看到旧数据被裁掉，无需额外事件。

### 2.7 持久化

- `persist()` 的 config 对象加 `limitView` / `limitCount`
- `load()` 用 `?? false` / `?? LIMIT_VIEW_COUNT` 防御读取（旧数据没有这两个字段）
- **不写 legacy 兼容扁平字段**（legacy renderer.js 不读这两个字段，写了无用）

## 3. 弹窗 UI（扩展 `PromptDialog`）

### 3.1 新增可选 prop

```ts
/** 左下角副作用按钮（可选）。如「关闭限制」。不传则不渲染。 */
extraAction?: { text: string; onAction: () => void }
```

布局：footer 左侧放 extraAction 按钮（`variant="outline"`），右侧仍是 取消/确定。视觉对应 legacy `showLimitDialog` 的 `.btn-off`（`style="margin-right:auto"`）。

其他调用方（备注、重命名）不传 `extraAction`，行为零变化。

### 3.2 文案/数值（原样照搬 legacy `showLimitDialog`）

- title: `设置数据保留条数`
- description: `请输入要保留的最新数据行数：`（+ 小字 `(录制日志时，此设置优先级高于默认的100条限制)`）
- input: `type="number"`，`min={10}`，`step={100}`，defaultValue = 当前 `limitCount`（legacy 用 `pane.limitCount || LIMIT_VIEW_COUNT`）
- **仅在 `limitView === true` 时**才传 `extraAction`（文案「关闭限制」）——legacy 同样只在 `isEnabled` 时渲染 `.btn-off`

### 3.3 数值归一化（在调用方做，不污染 PromptDialog）

原样照搬 legacy `showLimitDialog` 的 `onConfirm`：

```ts
let val = parseInt(input, 10)
if (isNaN(val) || val <= 0) val = 1000
if (val < 10) val = 10
```

## 4. 两个入口的接入

### 4.1 入口 1：`ActivePanelConfigPanel.tsx`「设置数据显示条数」

- 新增本地 state `limitOpen`
- 按钮 onClick 从 toast「暂未实现」改为 `setLimitOpen(true)`
- 按钮态对齐 legacy `updateLimitBtnUI`：`limitView` 为 true 时 `variant="default"`（高亮），否则 `variant="ghost"`
- 弹窗放在文件末尾的 `<>` 里（与备注 PromptDialog 并列）
- confirm 回调：归一化数值 → `setLimit(pnl.id, true, val)`
- extraAction 回调（仅 limitView=true 时出现）：`setLimitOpen(false); setLimit(pnl.id, false, pnl.limitCount)`

### 4.2 入口 2：`PaneContextMenu.tsx`「设置保留条数」

- 新增本地 state `limitOpen`
- 菜单项 onClick 从 `appendSysLine('暂未实现')` 改为 `setLimitOpen(true)`
- 渲染同一个弹窗，逻辑与入口 1 完全一致

> 两个入口各自持有本地 state + 重复 ~5 行归一化逻辑，不抽 util（量太小，抽了反而过度设计）。

## 5. 测试

沿用现有测试风格（store 级断言，参考 `active-panel-config.test.ts` / `serial-panel-viewmodel.test.ts`）。

### 5.1 `trimChunks` 纯函数（`serial-panel-viewmodel.test.ts`）

现有 3 个用例（未超限 / 超限移除头部 / 缓存同步裁剪）**已足够**，签名不变，无需新增。

### 5.2 store 行为（`active-panel-config.test.ts` 新增用例）

1. `genPanel` 默认值：`limitView=false`、`limitCount=1000`（对齐 legacy createPane）
2. `setLimit(id, true, 50)` 写回字段并触发 persist（断言 `mockConfig.save` 被调、config 含 limitView/limitCount）
3. `setLimit` 立即裁剪：先 append 超过 limitCount 个 chunk，再 setLimit(id, true, small)，断言 chunks 长度 ≤ limitCount
4. `appendChunk` 在 limitView=true 时用 limitCount 裁剪（不是全局 CHUNK_LIMIT）：setLimit(id, true, 5) 后 append 第 6 个 chunk，断言 chunks 长度 = 5
5. `setLimit(id, false, ...)` 关闭限制：append 到超过 limitCount 但不超过 CHUNK_LIMIT，断言不被裁剪（回到全局兜底）
6. `load()` 向后兼容：旧数据无 limitView/limitCount → 回填 `false` / `1000`

### 5.3 不测组件渲染层

与现有 test 文件一致：SSR server-snapshot 限制下，弹窗/按钮交互以 store 级断言覆盖。

### 5.4 运行

`npm test` + `npm run typecheck`（AGENTS.md 要求）。

## 6. 风险与已知简化

- **双轨持久化**：`limitView`/`limitCount` 写入 `panels.json`。legacy `renderer.js` 不读这两个字段（createPane 自己设默认值），写入对 legacy 无副作用；读时 legacy 侧也不受影响。**不写 legacy 兼容扁平字段**（无意义）。
- **向后兼容**：现有面板无这两个字段，`load()` 用 `?? false` / `?? LIMIT_VIEW_COUNT` 防御读取。
- **logging 兜底语义不补**（已知简化）：legacy `trimPane` 在 `logging.active` 时用 `LOGGING_SAFE_COUNT=100` 兜底——本任务**不实现**该分支。原因：React 版 logging 行为本就不完整（`logging` 仅用于写文件，appendChunk 完全不区分 logging 状态做裁剪），且该分支属于 logging 功能范畴，与本任务（保留条数）是两件事。spec 明确标注为简化。
- **CHUNK_LIMIT 兜底**：limitView=false 时仍用全局 `CHUNK_LIMIT=1000` 兜底（数值与 legacy LIMIT_VIEW_COUNT 相同，行为不变），防止关闭限制后内存无界增长。
- **两个入口共享弹窗逻辑**：各自持有本地 state + 重复 ~5 行归一化代码，不抽 util（量太小）。

## 7. 不改动项（清单）

- `trimChunks` / `formatBytes` / `renderChunks` 等纯函数（签名不变）
- `dataBus.ts` / `SendBar.tsx` / `CommandsPage.tsx`（appendChunk 内部改 trim 来源，调用方无感知）
- `DataDisplay`（订阅 store 自动重渲染，无需改）
- `FloatingPane.tsx`（仅因 PaneContextMenu 改动而间接受益，不直接改）
- 示波器、XModem/ZModem、logging 写文件逻辑

## 8. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/features/serial-panel/types.ts` | `Panel` 加 `limitView` / `limitCount` |
| `src/features/serial-panel/store.ts` | 常量 `LIMIT_VIEW_COUNT`；`genPanel` 初始化；`appendChunk` trim 来源；新增 `setLimit`；`persist`/`load` 字段 |
| `src/components/ui/prompt-dialog.tsx` | 加可选 `extraAction` prop + footer 左侧按钮 |
| `src/features/main-window/components/ActivePanelConfigPanel.tsx` | 入口 1：按钮态 + 弹窗 |
| `src/features/serial-panel/components/PaneContextMenu.tsx` | 入口 2：菜单项 + 弹窗 |
| `test/active-panel-config.test.ts` | 新增 6 个 store 级用例 |
