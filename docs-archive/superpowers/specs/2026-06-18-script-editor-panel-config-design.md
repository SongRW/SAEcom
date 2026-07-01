# 脚本编辑器：面板优先配置模型 + 输入输出类型化校验 — 设计文档

- 日期：2026-06-18
- 范围：`src/features/script-editor/`、`shared/`、legacy renderer 暴露给 React 的面板摘要
- 关联：`docs/superpowers/specs/2026-06-17-script-editor-interaction-shadcn-design.md`、`docs/superpowers/specs/2026-06-16-script-editor-canvas-tools-feedback-design.md`、`AGENTS.md`

## 1. 背景与目标

脚本编辑器已经进入 React/Rete 迁移阶段，但当前节点配置仍把“面板”“物理串口”“TCP 地址”“输入/输出类型配置”混在各个 control 里，导致几个问题：

1. 串口配置信息没有真正关联串口面板，用户容易在脚本节点里看到孤立的端口选择。
2. 组件库仍是横向分类 Tabs，不适合节点数量继续扩展。
3. “接收面板”的语义需要明确为接收某个串口/TCP 面板窗口的数据。
4. 画布选中节点时有突兀蓝色框，需要改为更克制的选中态。
5. 输入端需要按每种类型独立核对所需配置；真实接收流默认持续监听。
6. 输出端也需要按类型独立配置和校验，尤其是发送面板、发送串口、发送 TCP、写入文件。

### 目标

- 建立新的“面板优先配置模型”，让脚本节点通过统一配置引用绑定面板、串口、TCP 或本地配置。
- 接收串口优先继承当前活动串口面板参数；没有活动面板时使用基础串口参数；用户选裸串口时补齐基础参数并建立关联。
- 输入类和输出类都按节点类型显示字段、校验必填项，并在运行前统一校验整张图。
- 接收面板、接收串口、接收 TCP、TCP 服务器接收默认持续监听，直到手动停止、错误退出或脚本逻辑显式退出。
- 组件库从横向 Tabs 改为左侧二级面板内的纵向可折叠树，优先使用现有 shadcn/ui 风格组件。
- 去掉突兀蓝色选中框，保留清晰但克制的节点选中反馈。

### 非目标

- 不重写 legacy 面板系统，不改变主界面创建、打开、关闭串口/TCP 面板的核心流程。
- 不把所有节点都强行改成长连接；手动输入、读取文件、定时触发保留各自语义。
- 不引入新的大 UI 框架；继续使用项目已有 shadcn/ui 组件和本地 CSS token。
- 不破坏旧脚本加载；旧 `panelId`、`portPath` 数据需要兼容迁移。

## 2. 核心决策

### 2.1 面板优先配置模型

新增脚本层配置引用概念，作为输入/输出外部资源节点的统一入口。节点不再直接散落保存 `panelId`、`portPath`、串口基础参数，而是通过配置引用表达“我要使用哪个面板或连接资源”。

采用结构：

```ts
interface PanelConfigRef {
  kind: 'current-panel' | 'panel' | 'serial-port' | 'tcp-endpoint' | 'tcp-server' | 'file' | 'local'
  panelId?: string
  portPath?: string
  host?: string
  port?: number
  serialOptions?: SerialOpenOptions
  usesFallbackOptions?: boolean
}
```

其中：

- `current-panel` 表示运行时使用当前活动面板。
- `panel` 表示显式绑定某个面板 ID。
- `serial-port` 表示用户选到了裸串口，系统需要补齐基础串口参数并建立面板关联。
- `tcp-endpoint` / `tcp-server` 表示 TCP 客户端或服务端资源。
- `file` / `local` 表示文件或节点本地配置，不依赖面板。

基础串口参数固定为：

```ts
{ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none' }
```

### 2.2 Legacy 面板摘要扩展

legacy renderer 仍是 Phase 1 的面板状态来源。现有 `window.getSerialPanelSummaries()` 需要扩展面板摘要字段，让 React 脚本编辑器可以读取继承参数。

扩展 `SerialPanelSummary`：

```ts
interface SerialPanelSummary {
  id: string
  name: string
  type: 'serial' | 'tcp'
  open: boolean
  active: boolean
  hidden?: boolean
  options?: SerialOpenOptions
}
```

串口面板返回 `options`；TCP 面板可以不返回串口 options。React 配置面板据此展示继承参数和打开状态。

## 3. UI 与交互设计

### 3.1 组件库纵向树

采用已确认的 A 方案：保留左侧竖向 rail，点击“组件”打开二级面板；二级面板内部从横向 Tabs 改为纵向树。

实现方向：

- `NodePalette` 使用 `Collapsible` 分类，`ScrollArea` 承载内容。
- 默认展开“输入类”，其余分类收起。
- 分类行显示名称、颜色标识和节点数量。
- 节点行保持点击添加与拖拽添加。
- 继续沿用项目 shadcn/ui 风格：`Button`、`Badge`、`Tooltip`、`Collapsible`、`ScrollArea`，不引入新视觉系统。

### 3.2 节点配置面板

节点配置面板改为按节点类型渲染字段，而不是简单循环全部 controls。

外部资源节点显示“配置引用”选择器：

- 接收面板 / 发送面板：选择当前面板或指定面板。
- 接收串口 / 发送串口：优先选择串口面板；可选择裸串口；裸串口使用基础参数补齐。
- 接收 TCP / 发送 TCP：可选择 TCP 面板或填写 host/port。
- TCP 服务器接收 / 发送：填写或选择服务端口/服务器实例。

接收串口的配置区展示：

- 当前绑定面板或串口。
- 打开状态。
- 继承的波特率、数据位、停止位、校验位。
- 当使用基础参数时，显示轻量提示：“当前使用默认基础参数”。

文件、日志、变量、手动输入等节点显示自己的本地字段，不走面板引用。

### 3.3 选中态调整

去掉画布节点突兀蓝色外框。选中节点改为：

- 提高边框对比度。
- 使用较浅的阴影或弱 ring。
- 不再使用粗 `outline: 2px solid primary`。
- 键盘焦点保留可访问反馈，但视觉上保持克制。

## 4. 输入/输出配置矩阵

### 4.1 输入类

| 节点 | 配置来源 | 必填/校验 | 执行语义 |
|---|---|---|---|
| 接收面板 | 面板配置引用 | 面板必须存在，或使用当前面板 | 持续监听面板数据 |
| 接收串口 | 串口面板优先，裸串口补默认参数 | 面板/串口 + 串口基础参数 | 持续监听串口数据 |
| 接收 TCP | TCP 面板或 host/port | host、port | 持续监听 TCP 数据 |
| TCP 服务器接收 | 监听端口/服务器实例 | port | 持续监听客户端数据 |
| 手动输入 | 节点本地配置 | 内容、格式 | 静态输入，一次注入 |
| 读取文件 | 文件路径 | path、encoding | 按运行读取一次 |
| 定时触发 | 时间配置 | interval、repeat | 单次或循环触发 |

### 4.2 输出类

| 节点 | 配置来源 | 必填/校验 | 执行语义 |
|---|---|---|---|
| 发送面板 | 面板配置引用 | 面板、格式、结尾 | 发送到面板窗口 |
| 发送串口 | 串口面板优先 | 面板/串口、格式、结尾 | 发送到关联面板/串口 |
| 发送 TCP | TCP 面板或 host/port | host、port、格式 | 发送到 TCP 连接 |
| TCP 服务器发送 | 服务端口/服务器实例 | port、格式 | 广播到客户端 |
| 写入文件 | 文件路径 | path、写入模式 | 追加或覆盖写入 |
| 日志输出 | 节点本地配置 | level，prefix 可选 | 写运行日志 |
| 变量存储 | 节点本地配置 | 变量名 | 写入全局变量 |

## 5. 运行时与代码生成

### 5.1 接收面板

“接收面板”明确表示接收面板窗口的数据流。节点绑定面板 ID 后，运行时监听该面板的收包事件；若选择当前面板，则使用脚本运行上下文的面板 ID。

### 5.2 接收串口

接收串口优先绑定串口面板。新建节点时：

1. 有当前活动串口面板：使用该面板引用，并继承 `options`。
2. 没有活动串口面板：使用基础参数生成可运行配置。
3. 用户选择裸串口：补齐基础参数，并建立面板关联。

### 5.3 持续监听

真实接收流节点默认持续监听：

- 接收面板
- 接收串口
- 接收 TCP
- TCP 服务器接收

运行后每收到一包数据，就执行该输入节点下游处理链。脚本不会因为第一包数据结束。脚本结束条件：

- 用户点击停止。
- 发生不可恢复错误。
- 脚本逻辑显式退出。

手动输入、读取文件、定时触发不强行套用持续监听：

- 手动输入：一次性注入静态内容。
- 读取文件：每次运行读取一次。
- 定时触发：按单次/循环模式触发。

## 6. 错误处理与兼容策略

### 6.1 旧脚本迁移

旧图数据中已有 `panelId`、`portPath` 或原始 controls 时，加载阶段转换为新的配置引用。迁移不删除旧字段，保存时写入新结构，保证旧脚本可打开、可运行、可逐步保存升级。

### 6.2 配置缺失

配置面板显示字段级错误。运行前对整张图做统一校验，错误信息需要指向具体节点和字段，例如：

- `接收串口：未选择面板或串口`
- `发送 TCP：host 不能为空`
- `写入文件：文件路径不能为空`

### 6.3 引用失效

如果节点引用的面板已删除、串口已拔出或 TCP 面板不存在：

- 配置面板显示引用失效状态。
- 用户可重新选择面板或裸串口。
- 运行时阻止脚本启动，并输出明确错误日志。

### 6.4 持续监听释放

脚本停止时必须释放监听器。持续监听过程中如果单包处理发生错误，记录错误并停止当前脚本，避免无限刷错误或残留回调。

## 7. 测试与验收

### 7.1 自动化测试

新增或更新 Vitest 覆盖：

- 配置模型迁移：旧 `panelId` / `portPath` 节点能加载为新的配置引用。
- 面板摘要：`SerialPanelSummary` 包含串口 options，React 选项能显示继承参数。
- 节点默认数据：接收串口新建时优先继承当前面板；没有面板时使用基础参数。
- 节点校验：输入类、输出类按类型检查必填字段。
- 代码生成：接收流节点生成持续监听语义；手动输入、读取文件、定时触发保持各自语义。
- UI 状态：组件树默认展开输入类；选中节点不再出现突兀蓝框。

### 7.2 手动验收

- 打开脚本编辑器，组件库从横向 Tabs 变成纵向树。
- 新增接收串口节点后能看到继承参数。
- 选择裸串口时自动补基础参数。
- 接收面板能接收面板窗口数据。
- 发送面板 / 发送串口也按面板优先配置执行。
- 脚本运行后持续监听，点停止后监听释放。
- 旧脚本可打开，并在保存后迁移为新结构。

## 8. 预计触碰文件

**共享类型**

- `shared/types.ts`

**Legacy 面板摘要**

- `renderer.js`

**脚本编辑器模型与视图**

- `src/features/script-editor/nodes/definitions.ts`
- `src/features/script-editor/rete/graphState.ts`
- `src/features/script-editor/viewModel.ts`
- `src/features/script-editor/components/NodeConfigPanel.tsx`
- `src/features/script-editor/components/NodePalette.tsx`
- `src/features/script-editor/script-editor.css`
- `src/features/script-editor/ScriptEditorDialog.tsx`

**代码生成与运行时**

- `src/features/script-editor/codegen/emit/input.ts`
- `src/features/script-editor/codegen/emit/output.ts`
- `electron/main.ts`

**测试**

- `test/rete-codegen.test.ts`
- `test/script-editor-graph-state.test.ts`
- `test/script-editor-view-model.test.ts`
- 新增 `test/script-editor-panel-config.test.ts`

## 9. 风险与缓解

- **持续监听改动影响代码生成结构**：实现时先为简单单输入链路建立测试，再扩展到输出和转换节点。
- **旧脚本兼容复杂**：迁移函数集中在 graph state 或 view model，避免在 UI 和 codegen 多处散落兼容逻辑。
- **面板与裸串口关联边界**：裸串口补默认参数时需要在 UI 中明确提示，避免用户误以为继承了真实面板参数。
- **输出类被遗漏**：用配置矩阵作为测试清单，确保输入类和输出类都覆盖。
- **蓝色框治理范围包含两层样式**：实现时同时调整应用层 `data-app-selected` 和 Rete 默认 selected 样式。

## 10. 决策记录

- 选择方案 2：重做配置模型，而不是仅修补现有字段。
- 配置模型以面板为优先来源。
- 组件库选择 A 方案：左侧 rail + 二级面板 + 纵向折叠树。
- 输入端选择 A：真实接收流默认持续监听，直到手动停止或错误退出。
- 接收串口新建行为选择 A+B：优先继承当前活动面板；选裸串口时补基础参数并建立关联。
- 输入类和输出类都需要按类型独立配置和校验。
