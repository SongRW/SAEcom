# 脚本编辑器：画布交互修复 + shadcn 改造 — 设计文档

- 日期：2026-06-17
- 范围：`src/features/script-editor/` 单一子系统（Phase 1，React 轨道）
- 关联：`docs/superpowers/specs/2026-06-15-react-rete-migration-design.md`（架构权威参考）、`CLAUDE.md`、`AGENTS.md`

## 1. 背景与目标

脚本编辑器（Rete.js v2 节点图）当前有三个问题需一并解决，合成一份设计、一个实现计划推进：

1. **画布交互可大量复用 shadcn/ui** —— 仍有多处手写 HTML/CSS，观感与项目其余 shadcn 界面不统一。
2. **双击节点无法打开节点配置** —— 双击画布节点，右侧「节点配置」抽屉不弹出。
3. **左上角鼠标操作工具（指针/选择/拖动画布）无效** —— 切换工具后画布行为无实质变化。

### 目标
- 三种鼠标工具语义正确、真正生效；「选择」支持框选多个节点。
- 双击节点稳定打开右侧配置抽屉。
- 把 7 处仍手写的界面改造为 shadcn 组件（两处高风险项仅做视觉对齐）。
- 交互逻辑抽成可单测的纯函数模块，符合项目既有 `uiState.ts` / `viewModel.ts` / `nodeInteraction.ts` 约定。

### 非目标 / 边界（铁律）
- 不改动 legacy/React 共存机制与 `#root` `pointer-events:none` 叠加层边界。
- 不在 legacy 与 React 两条轨道间重复绑定同一 IPC / 同一 DOM 行为。
- 不替换对话框外壳为 shadcn `Dialog` 结构（仅视觉/间距对齐）。
- 不改动 Rete 节点本体的渲染结构与 socket/拖拽命中区（仅 CSS 视觉统一）。

## 2. 根因判断

### 2.1 鼠标工具无效（#3）
现实现于 `GraphCanvas.tsx` 的 `area.addPipe` 中，对 `translate / translated / nodetranslate / nodetranslated / nodepicked` 信号 `return undefined` 试图拦截。Rete v2 的平移与拖拽是**指针驱动**的：先改 area transform，再发出信号。事后在 pipe 里拦截信号**无法撤销已经发生的平移/拖拽**，因此「选择」模式仍可平移画布、工具切换看起来「无效」。

### 2.2 双击不开配置（#2）
开配置目前有**三条并存路径**，互相 `preventDefault/stopPropagation` 打架，可靠性差：
- `rete/setup.ts` 节点 React `onClick`(detail≥2) / `onDoubleClick` → 派发自定义事件 `SCRIPT_NODE_OPEN_CONFIG_EVENT`；
- `GraphCanvas.tsx` 容器 capture 阶段监听 `click`/`dblclick`（`openNodeConfigFromPointerGesture`）；
- `GraphCanvas.tsx` 容器监听自定义事件（`openNodeConfigFromCustomEvent`）。

## 3. 工作线 A：画布交互重构（修 #2 / #3）

### 3.1 新增纯逻辑模块 `canvasInteraction.ts`
集中、可单测，替代/扩展现 `getCanvasToolBehavior`：

- `getToolCapabilities(tool: CanvasTool): ToolCapabilities`
  - `ToolCapabilities = { nodeDrag: boolean; areaPan: boolean; nodeClickSelect: boolean; marquee: boolean }`
  - 指针：`{nodeDrag:true, areaPan:true, nodeClickSelect:true, marquee:false}`
  - 选择：`{nodeDrag:false, areaPan:false, nodeClickSelect:true, marquee:true}`
  - 拖动画布：`{nodeDrag:false, areaPan:true, nodeClickSelect:false, marquee:false}`
- 框选数学（纯函数）：
  - `computeMarqueeRect(start, current): {x,y,width,height}`
  - `nodesInMarquee(nodeRects: Array<{id,rect}>, marquee): string[]`（矩形相交判定）
- 手势判定（收敛双击逻辑到单一入口）：
  - `resolveOpenConfigGesture(type, detail): boolean`（取代分散在两处的 `shouldOpenConfigFromCanvasGesture` / `shouldOpenConfigFromClickDetail`）

### 3.2 GraphCanvas 绑定层改动
- **工具门控改为源头机制**，不再事后拦信号：
  - 平移：根据 `capabilities.areaPan` 启停 area 的拖拽平移（Rete 支持的开关方式），而非拦 `translate` 信号。
  - 节点可交互性：用工具 class（`is-tool-*`）+ `pointer-events` 控制节点是否可点/可拖。
  - 节点拖拽：`capabilities.nodeDrag` 为 false 时禁止拖动（pan/select 模式下节点不可拖）。
- **框选多选**（select 模式）：
  - 空白处 `pointerdown` 起始 → 覆盖层 div 绘制选框矩形 → `pointermove` 更新 `computeMarqueeRect` → `pointerup` 用 `nodesInMarquee` 命中 `area.nodeViews` 的节点 rect，得到选中集合。
- **双击**：只保留**一条**路径——节点 React `onDoubleClick` → 回调 `onNodeDoubleClick(id)` → 打开右侧配置抽屉。删除容器 capture 阶段拦截与自定义事件链。
- **调试桥精简**：`nodeInteraction.ts` 现有大量调试脚手架，重构后仅保留 `scriptDebug=1` 调试桥与必要的命中/描述工具函数。

### 3.3 选择状态升级为多选
- `selectedNodeId: string | null` → 多选集合（`selectedNodeIds: string[]` 或 `Set`），在 `ScriptEditorDialog.tsx` 维护。
- 整组**移动/删除**作用于全部选中节点。
- 右侧「节点配置」面板**仅在恰好选中 1 个节点时**显示参数；多选时显示「已选 N 个」提示（不做批量编辑）。
- `uiState.ts` 中与选择/删除相关的转换（`onNodeDeleted` / `onSelectedNodeDeleted` / `onNodeDoubleClick`）相应适配多选语义。

## 4. 工作线 B：shadcn 改造（7 处）

### 4.1 新增 shadcn 基元
`src/components/ui/` 新增：`input`、`label`、`tabs`、`context-menu`、`badge`。

### 4.2 逐处映射

| 界面 | 现状 | 改造 |
|---|---|---|
| 脚本列表 `ScriptList` | 全手写 | 统一列表项 + `Button`，激活/hover 用主题色 token |
| 画布右键菜单（`GraphCanvas`） | 手写 `<button>` + 手动定位 | shadcn **ContextMenu**：包裹画布触发区，光标处弹出；菜单内容按命中目标分「节点上 / 空白处」两种渲染（复用现有命中判断），含分隔线、快捷键标注、危险项 |
| 节点配置表单 `NodeConfigPanel` | 原生 `<input>`、原生连线 `<select>`、手写链接按钮 | `Input` / `Label` / `Select` / `Button` |
| 组件库标签页 `NodePalette` | 手写分类按钮 | shadcn `Tabs` |
| 运行输出面板 `ScriptOutputPanel` | 手写列表 | `ScrollArea` + `Badge` 标注 `[完成]/[错误]` 状态 |
| ⚠ 对话框外壳 + 顶栏 | 手写 backdrop/dialog/Toolbar | **仅视觉/间距对齐**，不换 `Dialog` 结构 |
| ⚠ 画布节点本体 | Rete `createElement` div | **仅 CSS 视觉统一**，不动结构/命中区 |

> ⚠ 两项受「§1 边界铁律」约束：只做视觉层面，不替换结构。

### 4.3 ContextMenu 的动态内容
右键时先用现有命中函数判断光标下的节点（有则选中该节点），再据此让 `ContextMenuContent` 渲染：
- 命中节点：配置节点 / 复制节点 / 删除节点。
- 空白处：打开组件树 / 添加常用节点 / 重置视图。

## 5. 工作线 C：测试与验证

### 5.1 Vitest 单测（Node 环境，沿用 `test/script-editor-*.test.ts` 风格）
- 新增 `test/script-editor-canvas-interaction.test.ts`：
  - `getToolCapabilities` 三种工具的能力映射。
  - `computeMarqueeRect` 各方向拖拽的归一化矩形。
  - `nodesInMarquee` 相交/不相交边界。
  - `resolveOpenConfigGesture` 单/双击判定。
- 更新受影响用例：`script-editor-ui-state.test.ts`（多选语义）、`script-editor-node-interaction.test.ts`（手势收敛）、必要时 `script-editor-view-model.test.ts`。

### 5.2 手动验证
- `npm run dev`（必须经 `scripts/dev.js`）后，加 `?scriptDebug=1` 打开调试桥，逐项确认：
  1. 双击任一节点 → 右侧配置抽屉打开并显示该节点参数。
  2. 指针：可拖节点/连线、空白拖动可平移、滚轮缩放。
  3. 拖动画布（手型）：仅平移，节点不可拖/不可点。
  4. 选择：空白拖拽出选框 → 命中多个节点；多选下配置面板显示「已选 N 个」；Del 删除整组。

### 5.3 提交前
- `npm run typecheck`（`tsconfig.json` + `tsconfig.node.json`）全绿。
- `npm test` 全绿。

## 6. 预计触碰文件

**交互（A）**
- 新增 `src/features/script-editor/canvasInteraction.ts`
- 改 `components/GraphCanvas.tsx`、`rete/setup.ts`（双击单一路径 + 工具门控）、`nodeInteraction.ts`（精简）、`uiState.ts`（多选）、`ScriptEditorDialog.tsx`、`script-editor.css`

**shadcn（B）**
- 新增 `src/components/ui/{input,label,tabs,context-menu,badge}.tsx`
- 改 `components/ScriptList.tsx`、`NodeConfigPanel.tsx`、`NodePalette.tsx`、`ScriptOutputPanel.tsx`、`GraphCanvas.tsx`（右键菜单）

**测试（C）**
- 新增 `test/script-editor-canvas-interaction.test.ts`
- 更新 `test/script-editor-ui-state.test.ts`、`script-editor-node-interaction.test.ts`、（按需）`script-editor-view-model.test.ts`

## 7. 风险与缓解
- **Rete 平移/拖拽开关 API 细节**：源头门控需用 Rete v2 实际支持的方式；实现期先小验证（dev 手测）再铺开，避免再次「事后拦信号」陷阱。
- **框选与 Rete 既有选择扩展（`selectableNodes`）共存**：覆盖层自绘选框，选中结果统一写入应用层多选状态，避免与 Rete 内置选择语义冲突。
- **共存边界**：ContextMenu / 抽屉等改造不得改变 `pointer-events` 叠加层边界；改后回归确认 legacy 轨道不受影响。
- **多选状态扩散**：`selectedNodeId → 多选` 影响面较广，集中在 `ScriptEditorDialog` + `uiState`，配置面板单选门槛把复杂度限制住。

## 8. 决策记录
- 三件事合成一份设计、一个实现计划，一起做。
- 鼠标工具保留三个并修正语义；「选择」支持框选多选。
- shadcn 改造 7 处全部纳入，两处 ⚠ 仅做视觉对齐。
- 交互 bug 采用「重构为可单测控制器」而非最小补丁。
- 右键菜单采用 shadcn **ContextMenu**。
- 多选时配置面板**仅在选中 1 个节点时**显示参数。
