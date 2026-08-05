# 脚本编辑器自动排版顺序设计

- 日期：2026-08-03
- 分支：develop_srw
- 类型：脚本编辑器布局优化
- 影响范围：ELK 自动排版配置、Rete 自动排版预设、自动排版 Electron E2E、布局选项单元测试

## 背景

脚本编辑器当前使用 ELK 的 `layered` 算法从左向右自动排版。连线决定节点的依赖层级，但同一层中彼此没有依赖的节点没有应用定义的排序约束。因此，自动排版的上下位置可能和现有脚本代码的生成顺序不一致。

代码生成不读取节点坐标。它按连线拓扑保证前置依赖先于下游节点，并以 `graph.nodes[]` 的稳定数组顺序处理无依赖的并列节点。连续输入根节点仍会注册为并发监听器；本次不改变其运行模型。

## 目标

1. 点击“自动排版”后，节点依赖层级从左到右排列：无输入依赖的根节点位于第一列，节点位于其全部前置依赖的右侧。
2. 同一层、无直接依赖约束的节点，按当前代码生成使用的稳定 `graph.nodes[]` 顺序从上到下排列。
3. 自动排版只改变节点坐标，不改变 `nodes[]`、`connections[]`、持久化数据、代码生成或实际运行顺序。
4. 用户在自动排版后手动拖动节点时，不根据当前坐标重新计算或修改脚本行为；下一次自动排版再恢复与既有顺序一致的布局。

## 设计

### 排版排序来源

现有图状态中的 `nodes[]` 顺序是代码生成对互不依赖节点的既有稳定并列规则。自动排版直接复用该顺序，不新增 `executionOrder`、序号或其他持久化字段。

这样保持两个边界：

- 有连线依赖时，拓扑关系始终高于模型顺序，ELK 将下游节点放在右侧分层。
- 没有依赖可决定先后时，模型中靠前的节点在同层更靠上，使画布可按从左到右、从上到下的顺序阅读。
- 当严格保留该顺序会使连线交叉时，顺序优先于交叉最小化；ELK 可以保留必要交叉，但不得为减少交叉交换同层节点。

### ELK 配置与节点提示

根布局继续使用 `layered`、`RIGHT`、`elk.separateConnectedComponents = false`、正交连线、间距、`LAYER_SWEEP` 和 `elk.layered.considerModelOrder.strategy = NODES_AND_EDGES`。其中模型顺序策略只提供偏好，不能单独保证严格顺序。

`elk.separateConnectedComponents = false` 使断开的图组件作为一个分层布局组件共同排版。否则 ELK 0.8.2 会默认独立布局并打包各组件，`a → c` 与 `b → d` 这类断开路径的全局同层 `graph.nodes[]` 顺序和必要交叉都不能得到保证。

为实现强制的同层读取顺序，开启：

- `elk.layered.crossingMinimization.semiInteractive = true`

Rete 自动排版注册一个包装现有 classic preset 的预设。它保留 classic preset 的端口定位，并对每个 ELK 子节点附加：

- `elk.position = (0, N)`，其中 `N` 是该节点在当前 `graph.nodes[]` 中的零基索引。

`semiInteractive` 由这个节点级垂直提示导出每一层的固定顺序。ELK 仍负责依赖分层、最终坐标、不同节点高度的间距和路径几何；当两个独立路径的线必须交叉时，保留交叉以保持从上到下的读取顺序。

排序索引在每次布局时从 `GraphCanvas` 持有的当前图状态读取，不读取节点既有坐标、Rete DOM 或持久化的额外字段。`CreateReteEditorOptions` 增加只读的节点排序索引回调，供包装预设构造节点级 ELK options 使用。

### 不变性

`GraphCanvas.runArrangeLayout()` 仍只从 Rete 节点视图读取布局后的坐标，并通过 `updateGraphNodePositions()` 一次性写回 `position`。自动排版不重排 `nodes[]`，不更改连接数组，不影响撤销历史的既有合并策略。

脚本保存和运行继续使用既有代码生成器。连续监听根节点保持注册后并发等待，自动排版只稳定其可视声明/注册阅读顺序，不将事件处理改成串行。

## 测试与验证

1. 扩展 `test/script-editor-connection-path.test.ts`，断言 `NODES_AND_EDGES`、`semiInteractive` 与 `elk.separateConnectedComponents = false` ELK 选项和既有排版选项共同存在。
2. 为包装后的 Rete arrange preset 增加单元测试，验证每个节点从提供的排序索引取得 `elk.position = (0, N)`，且 classic 端口预设仍被保留。
3. 扩展 `e2e/script-editor-arrange.spec.ts`：按 `a, b, d, c` 的节点数组顺序创建两个 `input-manual` 根节点和两个 `output-log` 节点，连接 `a → c`、`b → d`。点击自动排版后验证：
   - 节点 ID 和类型保持不变；
   - 两个根节点处于同一左侧列且 `a` 位于 `b` 上方；
   - 两个输出节点处于同一右侧列且 `d` 位于 `c` 上方；
   - 两个输出节点均位于各自输入节点右侧；
   - 节点位置确实发生排版更新。
   该图必须保留交叉才可同时满足两个同层顺序，是严格顺序的回归门槛。
4. 保留现有 `test/rete-codegen.test.ts` 中的并列根节点和监听器行为覆盖，以证明本次不改变代码生成与运行模型。
5. 完整验证执行 `npm test`、`npm run typecheck`、`npm run test:e2e:build`。

## 非目标

- 不增加用户可编辑或持久化的执行序号。
- 不在每次保存、运行或拖动时按坐标重新排序代码生成。
- 不改变连续输入监听器的并发运行语义。
- 不保证用户手动布局后仍保持从左到右、从上到下的视觉顺序。
- 不修改节点连接、层级语义、循环图处理或代码生成算法。
