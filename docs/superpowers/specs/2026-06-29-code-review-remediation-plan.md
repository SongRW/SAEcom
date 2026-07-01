# 代码评审整改方案

- **日期**：2026-06-29
- **性质**：排查 + 整改方案（**不含代码实现**）
- **范围**：一份外部代码评审提出的 15 个问题，横跨脚本编辑器、命令面板、主进程/设置/共享/示波器、UI 四大子系统
- **核实结论**：**15 / 15 全部属实**，其中 3 条原评审措辞需细化修正，1 条（`'test'` 回退）实际暴露出比评审所述更深的语义缺陷

---

## 一、核实结论与对原评审的修正

### 1.1 全部属实

| 编号 | 标题 | 子系统 | 核实 |
|---|---|---|---|
| C1 | Rete 插件未销毁（仅 `area.destroy()`） | 脚本编辑器 | ✅ |
| C2 | 校验仅在字段内显示，不拦 Save/Run | 脚本编辑器 | ✅ |
| C3 | `normalizeScriptName` 过滤不全，静默返回 null | 脚本编辑器 | ✅ |
| C4 | `currentPanelId` 回退 `'test'`，无活动面板静默失败 | 脚本编辑器 | ✅（但缺陷更深，见下） |
| C5 | `addGroup` 重名/空名静默 no-op | 命令面板 | ✅ |
| C6 | `removeGroup` 静默删除组内命令 + 死代码 | 命令面板 | ✅ |
| C7 | 长命令阈值附近输入框↔textarea 切换丢光标 | 命令面板 | ✅ |
| C8 | 持久化无防抖、退出前无 flush | 命令面板 | ✅（机制见下） |
| C9 | 主题冷启动 FOUC，与设置弹窗耦合 | 设置/共享 | ✅ |
| C10 | `ActivePanelConfigPanel`（472 行）+ 示波器组件未国际化 | 主窗口/示波器 | ✅ |
| C11 | `hexToBytes('')` 抛 TypeError，catch 给误导信息 | 主窗口 | ✅ |
| C12 | z-index 策略散乱，全局 `!important` 提升弹窗 | UI | ✅ |
| C13 | `sonner.tsx` 用 next-themes 但项目无 ThemeProvider | UI | ✅ |
| C14 | `cn-toast` class 被引用但全局无定义 | UI | ✅ |

### 1.2 对原评审的 4 处细化修正

> 这些修正会写进对应整改卡片，避免按原评审措辞去修而修歪。

1. **C1 Rete 销毁（比评审更频繁）**
   原评审担心「StrictMode 双挂载泄漏」。实际更糟：`GraphCanvas` 的 `useEffect` 依赖是父组件**内联回调**（`onGraphChange`/`onSelectNodes`，每次渲染都是新引用），所以 effect 几乎**每次父组件渲染都 teardown + 重建**——6 个插件（`editor`/`connection`/`render`/`arrange`/`dock`/`minimap`）反复创建销毁，不止 StrictMode 场景。

2. **C2 校验（`validateGraphState` 是死代码）**
   评审说「校验只在字段内提示」。补充：`graphState.ts:248-250` 定义的 `validateGraphState` **全代码库零调用**。也就是说连「图级校验」的实现都是写了没用。校验唯一生效的地方是 `NodeConfigPanel` 里对**单个选中节点**的 `validateGraphNode`，纯展示。

3. **C8 退出丢保存（机制是 IPC 丢弃，非字节截断）**
   原评审「window-all-closed → app.quit 可能截断最后一次保存」措辞不准。`fs.writeFileSync` 同步写完整内容，单次调用不会字节截断。真实机制是：`commands.save` 用 `ipcRenderer.send`（异步火忘），若退出时该消息还在队列里未投递，主进程已退出 → **最后一次按键的保存丢失**（磁盘停留在更早一次状态）。无 `before-quit`/`will-quit` 监听器（grep 零命中）。

4. **C4 `'test'` 回退（语义缺陷，比评审严重）**
   原评审「无活动面板时脚本静默失败」只说对一半。深挖发现 `ctx.id` 身兼两职且互相污染：
   - **真串口绑定**：`input-serial`/`output-serial` 节点的 `portPath`（脚本自己 `ensureSerialOpen` 开口），**完全不经过面板**；
   - **`ctx.id` 实际职责**：①「当前面板」便捷函数（`send()`/`listenCurrentPackets()`）的默认目标；②**隐藏的干跑开关**——`ctx.id === 'test'` 在主进程被判断 **13 次**；
   - **致命缺陷**：`'test'` 回退不只干跑便捷函数，**连显式指定了 portPath 的 `input-serial`/`output-serial` 也被干跑**（`main.ts:1310`）。用户在节点选了 COM3，但没激活面板 → 脚本照样不真发，且无任何提示；
   - **死职责**：唯一会真正用 `ctx.id` 收发的 `output-panel`/`input-panel` 节点，**在代码库根本不存在**（grep 零命中）。所以 `ctx.id` 现在的实际作用只剩「干跑开关」；
   - **结论**：脚本和面板是两个独立功能。脚本完全可以独立于面板运行（靠节点 portPath 自开口）。`'test'` 魔法字符串把「无面板」和「干跑」两种语义捆在一起，应拆开。

---

## 二、严重度分级

| 级别 | 含义 | 编号 |
|---|---|---|
| **P0** | 数据丢失 / 正确性 | C6, C11, C8 |
| **P1** | 静默失败（体验差，用户不知发生了什么） | C4, C2, C3, C5 |
| **P2** | 性能 / 内存泄漏 / 交互焦点 | C1, C7 |
| **P3** | 架构一致性 / 可维护性 | C9, C10, C12, C13, C14 |

---

## 三、整改卡片（逐条）

每张卡片字段固定：现状 / 风险 / 整改方向（高层，不含 diff）/ 依赖 / 工作量（S≤半天 / M 1–2 天 / L 3+ 天）/ 验证方法 / 建议批次。

---

### C1 · Rete 插件未销毁，且每次渲染重建 —— P2

- **涉及**：`src/features/script-editor/rete/setup.ts:212-275`（注册）、`:273`（仅 `area.destroy()`）；`src/features/script-editor/components/GraphCanvas.tsx:158-243`（effect 依赖内联回调）
- **现状**：`createReteEditor` 创建 6 个插件，`destroy()` 闭包只调 `area.destroy()`。`GraphCanvas` 的 `useEffect` 依赖父组件内联回调 → 几乎每次父渲染都 teardown+重建 6 个插件。
- **风险**：内存/监听器泄漏，频繁 GC 压力；极端情况旧插件监听器残留导致重复回调。
- **整改方向**：
  - `destroy()` 改为按相反顺序销毁全部插件（`minimap`/`dock`/`arrange`/`render`/`connection`/`area`/`editor`，遵循 Rete 各插件 `destroy()` API）；
  - 稳定 `GraphCanvas` 的 effect 依赖：父组件用 `useCallback` 包裹 `onGraphChange`/`onSelectNodes`，或 effect 内只依赖稳定值（如 `[setupRef]`），把回调放进 ref。
- **依赖**：无。
- **工作量**：M（销毁顺序需对照 Rete 版本文档确认 API；effect 依赖重构需回归测试）。
- **验证**：手动在脚本编辑器反复切换/编辑，用 DevTools Memory snapshot 对比插件实例数；StrictMode 下双挂载后无残留监听。
- **批次**：批次 3。

---

### C2 · 校验不拦 Save/Run，且 `validateGraphState` 是死代码 —— P1

- **涉及**：`src/features/script-editor/rete/graphState.ts:248-250`（死代码）；`ScriptEditorDialog.tsx:260-267`（saveScript）、`:313-322`（runScript，无校验）；`components/Toolbar.tsx:69/78`（按钮无 disabled）；`panelConfig.ts:247-275`（已有节点级校验逻辑）
- **现状**：`validateGraphState` 定义但全库零调用。`saveScript`/`runScript` 直接写文件/跑代码，无校验门。Toolbar Save 无 disabled，Run 仅 `disabled={running}`。
- **风险**：无效图（未选串口、未选面板）被保存/运行，运行时才暴露错误，用户排查成本高。
- **整改方向**（已与你确认：**Save/Run 都拦截**）：
  - 复活 `validateGraphState`：遍历图所有节点，聚合 `validateGraphNode` 的错误，返回 `{ errors: Record<nodeId, string[]> }`；
  - Save 与 Run 入口先调用之；有错误则拦截 + toast 汇总（如「图有 3 处错误，无法保存/运行」）+ 可选跳转到第一个出错节点；
  - Toolbar 按钮在有错误时显示角标（不强制 disable，让用户点击时得到明确反馈更友好——这点可在实现时定）。
- **依赖**：无（C2 逻辑自洽）。
- **工作量**：M。
- **验证**：新建脚本不选串口 → Save/Run 应被拦截并提示；补单测覆盖 `validateGraphState`。
- **批次**：批次 2。

---

### C3 · `normalizeScriptName` 过滤不全 + 静默 null —— P1

- **涉及**：`src/features/script-editor/viewModel.ts:27-31`；调用点 `ScriptEditorDialog.tsx:421-423`、`:433-442`（`if (!name) return` 无反馈）
- **现状**：仅 `replace(/[/\\]/g, '')`，不过滤 `:` `*` `?` `"` `<` `>` `|`（Windows 非法）、控制字符、`..`（穿越）。null 时静默 return。
- **风险**：非法文件名导致写盘失败（Windows 尤甚）；路径穿越；用户输入被吞无反馈。
- **整改方向**：
  - 收紧正则到 Windows + macOS + Linux 通用非法字符集；额外拒绝 `.`/`..`、纯点串、控制字符；
  - 返回 `{ ok: true, name } | { ok: false, reason }` 联合类型，调用点据 `reason` 给 toast；
  - 或保持返回 `string | null` 但调用点在 null 时显式 toast「文件名非法或为空」。
- **依赖**：无。
- **工作量**：S。
- **验证**：单测覆盖各种非法输入（`..`、`COM3:`、`a*b`、控制字符、空串）；手动验证 toast 出现。
- **批次**：批次 2。

---

### C4 · `'test'` 回退：魔法字符串同时表达「无面板」+「干跑」—— P1（语义缺陷）

- **涉及**：
  - 渲染：`ScriptEditorDialog.tsx:313-322`（`|| 'test'`）、`:618-620`（`currentPanelId`）、`:622-632`（读面板）
  - 主进程：`main.ts:971`（handler）、`:51`（`writeGeneric`）、`:1279-1353`（`send`/`sendToPanel`/`sendToSerial`/`listenSerialPackets`）、`ctx.id === 'test'` 共 13 处（`:1031,1086,1211,1248,1282,1296,1310,1324,1357,1418,1468,1551,1565`）
  - codegen：`emit/output.ts:27-34,42`、`emit/input.ts:28-35`
  - 类型：`shared/types.ts:89-91`（`ScriptRunContext { id: string }`）
- **现状**：见上文「1.2 修正 4」。`'test'` 把「无活动面板」和「干跑模式」两种语义捆在一个魔法字符串上，且误伤了显式 portPath 的串口节点。
- **风险**：用户显式选了串口却因「没激活面板」导致脚本干跑且无提示——**这是最难排查的一类静默失败**；语义耦合让后续扩展（如真正的「调试干跑」开关）无从下手。
- **整改方向**（高层，三步，具体 API 实现时定）：
  1. **拆语义**：`ScriptRunContext` 从 `{ id: string }` 扩展为 `{ defaultTarget?: string; dryRun?: boolean }`（或类似），让「默认目标」可为空、「干跑」独立成显式标志；
  2. **修正干跑误伤**：`sendToSerial(portPath)` / `listenSerialPackets(portPath)` 这类**显式指定端口**的操作，无论 `ctx` 如何，都应真实执行（它们本就独立于面板）；`ctx.dryRun` 只该影响便捷函数；
  3. **渲染层 UI**：无活动面板时，若脚本只用了显式端口节点 → 照常真实运行；若脚本用了「当前面板」便捷函数而无默认目标 → 明确提示「请先激活一个面板」或让用户显式选默认目标，不再静默 `'test'`。
- **依赖**：独立，但建议在 C2 之后（都涉及 ScriptEditorDialog 运行入口，可一起回归）。
- **工作量**：L（跨主进程/类型/codegen/渲染四层，且要回归 13 处 `'test'` 分支的语义）。
- **验证**：
  - 场景 A：无激活面板 + `output-serial` 选了 COM3 → 应**真实发送**（修前会被干跑）；
  - 场景 B：无激活面板 + 用了 `send()` 便捷函数 → 应明确提示而非静默干跑；
  - 单测覆盖 `ScriptRunContext` 新结构的各分支。
- **批次**：批次 2（与 C2 同批，P1）。

---

### C5 · `addGroup` 重名/空名静默 no-op —— P1

- **涉及**：`src/features/commands/store.ts:219-228`（`addGroup`）；`renameGroup:230-245` 同模式
- **现状**：空名/重名直接 `return s`，store 无 UI 反馈通道（toast 只在组件层）。
- **风险**：用户添加/重命名分组无反应，不知是重名还是空名还是没点上。
- **整改方向**：store 的 `addGroup`/`renameGroup` 返回 `{ ok: boolean; reason?: 'empty' | 'duplicate' }`，调用组件据 `reason` 弹 toast（如「分组名已存在」）。或 store 抛特定错误由组件 catch。
- **依赖**：无。
- **工作量**：S。
- **验证**：手动验证重名/空名时出现对应 toast。
- **批次**：批次 2。

---

### C6 · `removeGroup` 静默删命令 + 死代码 —— P0

- **涉及**：`src/features/commands/store.ts:247-262`
- **现状**：`:257` `.filter` 删掉组内所有命令；`:258` `.map` 的「重分配到 fallback」分支因前一步已删光而**永不命中**（死代码）。无确认弹窗。
- **风险**：用户误删分组 → 组内全部命令**永久丢失**（持久化即时生效，无撤销）。
- **整改方向**（已与你确认：**迁移命令到其他组**，兑现死代码原意）：
  - 删除 `.filter`（`:257`），保留 `.map`（`:258`）的「迁移到 fallback」逻辑——这正好是原作者意图；
  - 加确认弹窗：「删除分组「X」？其下 N 条命令将迁移到「Y」」，用户确认后才执行；
  - 同步检查 `renameGroup` 无同类死代码（核实显示其无 `.map`，仅静默 no-op，归 C5）。
- **依赖**：无。但若同时做 C5，可一并加确认弹窗组件复用。
- **工作量**：S–M（迁移逻辑简单，确认弹窗若项目已有可复用）。
- **验证**：
  - 单测：删组后组内命令应迁移到 fallback 组，命令数不变；
  - 手动：删组弹确认框，确认后命令出现在 fallback 组，取消则不变。
- **批次**：批次 1（P0 优先）。

---

### C7 · 阈值附近 input↔textarea 切换丢光标 —— P2

- **涉及**：`src/features/commands/components/CommandEditor.tsx:70-71`（`isLong`）、`:103-118`（切换）
- **现状**：`isLong = data.length > threshold`，跨阈值时 `<Input>` 与 `<textarea>` 互切，DOM 节点销毁重建 → 失焦丢光标。
- **风险**：用户在阈值附近连续输入时频繁失焦，输入体验断裂。
- **整改方向**（任选其一，实现时定）：
  - **A（推荐）**：始终用 `<textarea>`，通过 CSS 在短内容时视觉压缩成单行高度（`rows`/`field-sizing`/`auto-resize`），去掉类型切换；
  - **B**：用「滞后切换」——长度跨阈值后仍维持当前类型，直到失焦或长度远离阈值（如 ±10 字符）再切；
  - **C**：切换时用 ref 保存光标位置，`useLayoutEffect` 在新元素恢复焦点与 selection range（脆弱，不推荐）。
- **依赖**：无。
- **工作量**：S（方案 A）/ M（B）。
- **验证**：在阈值附近连续粘贴/输入长文本，焦点与光标不丢。
- **批次**：批次 3。

---

### C8 · 持久化无防抖、退出前无 flush —— P0

- **涉及**：渲染 `store.ts:92-100`（`persist`）、`:151-156`（`updateCommand` 每次按键触发）；`preload.ts:88-91`（`save` 用 `send` 火忘）；主进程 `main.ts:632`（handler）、`:69-74`（`saveJsonSafe`）、`:1666`（`window-all-closed`，无 flush）
- **现状**：每次按键 → 全量 `JSON.stringify` + `writeFileSync` 重写整个 `commands.json`；`save` 用异步 `send`；无 `before-quit` flush。
- **风险**：① 磁盘/IO 压力（大命令集 + 快速输入）；② 退出时最后一条在途 `send` 丢失，磁盘停在更早状态。
- **整改方向**：
  - **防抖**：`persist()` 包 `debounce(300–500ms)`，或改用增量/脏标记 + 定时落盘；
  - **退出 flush**：主进程加 `app.on('before-quit')` / 渲染层 `window.onbeforeunload` 触发一次**同步** flush（`ipcRenderer.sendSync('commands:flush')`，主进程同步写盘后返回）；
  - 注意：`sendSync` 会阻塞，但仅在退出时一次，可接受；或确保 flush 用 `invoke` 且主进程在 `before-quit` 里 await 完再退出。
- **依赖**：无。
- **工作量**：M（防抖简单；退出 flush 涉及主进程退出时序，需回归 macOS Cmd+Q / Windows 关窗 / Linux 多场景）。
- **验证**：
  - 快速连续输入 → 用 `strace`/FS 监控确认写盘频率从「每键一次」降到「每 N 秒一次」；
  - 输入后立即 Cmd+Q / 关窗 → 重开 App 确认最后一次输入已落盘。
- **批次**：批次 1（P0 优先）。

---

### C9 · 主题冷启动 FOUC + 与设置弹窗耦合 —— P3

- **涉及**：`src/features/settings/SettingsDialog.tsx:30-35`（唯一应用主题的 effect）；`mainwindow.html`（无内联主题脚本）；`MainWindow.tsx:46-67`（只给 Toaster 传 theme）；对比 `panel.tsx:73-84`/`AboutWindow`/`ChangelogWindow`（这些窗口启动时同步应用主题并监听 `ipc.theme.onApply`）
- **现状**：主窗口主题仅靠 `SettingsDialog` 的 effect（挂载虽早但在首帧之后）应用 → 深色用户冷启动先闪白。其它窗口已正确同步应用。
- **风险**：体验瑕疵（FOUC）；主题逻辑只该在 settings 里，耦合不合理。
- **整改方向**：
  - 在 `mainwindow.html` 注入内联同步脚本：启动时立即读 persisted 主题（localStorage / IPC 同步取）给 `<html>` 加 `.dark`/`.theme-dark` 类，**先于 React 首帧**；
  - 把「应用主题」逻辑从 `SettingsDialog` 抽到独立 hook（如 `useThemeApplier`）或共享模块，`SettingsDialog` 只负责设置值；
  - 复用其它窗口已有的 `ipc.theme.onApply` 监听模式。
- **依赖**：无。与 C13（sonner next-themes）有主题上下文关联，可一并梳理。
- **工作量**：M。
- **验证**：冷启动（清缓存）深色模式无白闪；切换主题立即生效。
- **批次**：批次 4。

---

### C10 · `ActivePanelConfigPanel`（472 行）+ 示波器组件未国际化 —— P3

- **涉及**：
  - `src/features/main-window/components/ActivePanelConfigPanel.tsx`（472 行，全硬编码中文，无 `useTranslation`）
  - `src/features/oscilloscope/components/ScopeToolbar.tsx:19-31`、`WindowSizeSelect.tsx:18-33`、`OscilloscopeFloatingWindow.tsx:57`、`OscilloscopePane.tsx`（全硬编码）
  - i18n 系统已就绪：`src/shared/i18n/index.ts`（i18next + react-i18next），locales 在 `src/shared/i18n/locales/{zh-CN,en-US}.json`
- **现状**：项目 i18n 已正确用于 `SettingsDialog` 等，但这两块完全没接，切到 `en-US` 仍中文。
- **整改方向**（已与你确认：**两块都做**）：
  - 抽取所有硬编码中文到 i18n key，按功能命名空间组织（如 `panel.*`、`oscilloscope.*`）；
  - 组件接 `useTranslation` + `t()`；
  - **顺带**（机会性重构）：`ActivePanelConfigPanel` 472 行偏大，i18n 抽取时可按子区块（串口配置 / 文件发送 / 共享 / 备注）拆成更小组件，降低单文件复杂度——但这属于「机会改进」，不应喧宾夺主，可在卡片里标为可选。
- **依赖**：无（i18n 系统已就绪）。
- **工作量**：L（472 行 + 示波器多组件，纯体力 + key 命名设计；拆分组件另算）。
- **验证**：切 `en-US` 全英文，无遗漏中文；切回 `zh-CN` 正常。
- **批次**：批次 4。

---

### C11 · `hexToBytes('')` 抛 TypeError + 误导信息 —— P0

- **涉及**：`src/features/main-window/components/ActivePanelConfigPanel.tsx:21-23`（`hexToBytes`）、`:198`（`hexToBytes(res.hex || '')`）、`:231-235`（catch 给 `文件发送失败：${String(e)}`）
- **现状**：`''.match(/.{2}/g)` 返回 `null`，`!` 断言后 `null.map()` 抛 `TypeError`，外层 catch 把它拼成「文件发送失败：TypeError」，用户完全无法理解。
- **风险**：空 hex 发文件时崩溃 + 误导信息；非空但奇数位 hex 也会行为异常（`.{2}` 截断）。
- **整改方向**：
  - `hexToBytes` 空串直接返回空 `Uint8Array`（或抛语义化错误）；
  - 校验 hex 合法性（偶数位、仅 0-9a-fA-F），非法时给明确提示「HEX 格式错误：包含非十六进制字符 / 奇数位」；
  - catch 里区分「格式错误」「IO 错误」，分别给针对性文案，不再裸拼 `String(e)`。
- **依赖**：无。
- **工作量**：S。
- **验证**：单测覆盖空串、奇数位、非法字符；手动验证提示文案准确。
- **批次**：批次 1（P0 优先）。

---

### C12 · z-index 散乱 + 全局 `!important` 提升弹窗 —— P3

- **涉及**：
  - `src/features/script-editor/script-editor.css:1-4`（backdrop `3000`）、`:1062`（`3100 !important`）、`:1399`（`3050`）、`:1446-1454`（全局把所有 `dialog-overlay`/`alert-dialog-overlay` 提到 `3200 !important`，content `3201`）
  - `src/components/ui/dialog.tsx:42,64`、`alert-dialog.tsx:37,59`、`sheet.tsx`/`select.tsx`/`context-menu.tsx`/`tooltip.tsx`（均硬编码 `z-50`）
  - `src/styles/globals.css`（无任何 z-index 尺度）
- **现状**：z-index 散落在 Tailwind 工具类（50）+ 两处 CSS 文件（3000/3050/3100/3200/3201）的魔法数字里；特性 CSS 用全局 `!important` 把**全站所有弹窗**提到 3200，且定义在脚本编辑器特性目录下。
- **风险**：z-index 不可预测、难维护；特性文件影响全站是架构异味；新增浮层易踩坑。
- **整改方向**：
  - 在 `globals.css` 定义文档化的 z-index 尺度（CSS 变量或 Tailwind 自定义 token），如：
    ```
    base < dropdown < popover < dialog < drawer < toast < script-editor-backdrop < script-editor-overlay < (弹窗在脚本编辑器之上)
    ```
  - 各处魔法数字替换为 token；
  - 移除脚本编辑器 CSS 里的**全局** `!important` 提升规则，改为「脚本编辑器内部的弹窗」用局部 scope 或更高 token 解决层叠（脚本编辑器是全屏接管 backdrop 的场景，本就该有自己的层叠上下文）。
- **依赖**：无，但属「全局重构」，需整体回归所有浮层组件的视觉栈序。
- **工作量**：M。
- **验证**：逐个打开 dialog/alert/sheet/select/tooltip/toast + 脚本编辑器内弹窗，确认栈序正确无遮挡；改 token 后全局回归。
- **批次**：批次 4。

---

### C13 · `sonner.tsx` 用 next-themes 但项目无 ThemeProvider —— P3

- **涉及**：`src/components/ui/sonner.tsx`（全文 `useTheme()` from next-themes）；`MainWindow.tsx:44`（注释明确「项目用 `<html>.dark` class 切换，非 next-themes」）、`:67`（靠 `theme={dark?'dark':'light'}` prop override 续命）；全库无 `<ThemeProvider>`
- **现状**：`useTheme()` 在无 provider 下返回 undefined → 解构成 `'system'`，仅因 `MainWindow` 显式传 `theme` prop（经 `{...props}` 后置覆盖）才正常。去掉那个 prop 或别处用 `<Toaster/>` 不传 prop 就会静默回退 system。
- **风险**：潜在陷阱——未来改动易踩；语义混乱（组件假装依赖 next-themes 实则不用）。
- **整改方向**（任选）：
  - **A（推荐，最小）**：`sonner.tsx` 移除 next-themes 依赖，`theme` 改为必传 prop（或从项目自己的 theme store 读），消除虚假依赖；
  - **B**：真正引入 next-themes 并挂 ThemeProvider，统一主题源（改动大，与 C9 主题重构可一并考虑）。
- **依赖**：与 C9 主题重构同主题，建议同批梳理。
- **工作量**：S（A）/ M（B）。
- **验证**：移除 next-themes 后 toast 主题跟随 dark 设置；或挂 provider 后 `useTheme` 正常。
- **批次**：批次 4。

---

### C14 · `cn-toast` class 无定义 —— P3

- **涉及**：`src/components/ui/sonner.tsx:39`（`classNames.toast: "cn-toast"`）；全库 CSS 零定义
- **现状**：toast 元素被加上 `cn-toast` 类，但没有任何 CSS 规则 → 该类是空的，toast 缺失预期样式（具体缺什么取决于原作者意图，现已不可考）。
- **风险**：toast 视觉可能不完整；死类名误导维护者。
- **整改方向**：
  - 明确 `cn-toast` 想要的样式意图（对比 sonner 默认 + 项目设计），在 `globals.css` 或 `sonner.tsx` 内补全 `.cn-toast` 定义；
  - 或若与 C13 一起做、确认无需该类，则移除引用。
- **依赖**：与 C13 同文件，建议同批。
- **工作量**：S。
- **验证**：toast 在 light/dark 下视觉完整一致。
- **批次**：批次 4。

---

## 四、推荐排期（4 批次）

> 原则：先止血（P0）→ 再补静默失败（P1）→ 性能/交互（P2）→ 架构（P3）。每批内部尽量可并行。每批各自走 spec→plan→implement，不混批。

### 批次 1 · 止血（P0，数据丢失/正确性）—— 最高优先

| 卡片 | 工作量 | 可并行 |
|---|---|---|
| C6 removeGroup 迁移命令 + 确认 | S–M | ✓ |
| C11 hexToBytes 空串/格式校验 | S | ✓ |
| C8 持久化防抖 + 退出 flush | M | ✓（退出 flush 需多平台回归） |

三条互相独立，可并行。目标：**消除数据丢失风险**。

### 批次 2 · 补静默失败（P1）

| 卡片 | 工作量 | 依赖 |
|---|---|---|
| C4 `'test'` 语义拆分 | L | 建议在 C2 后（同改 ScriptEditorDialog 运行入口） |
| C2 校验拦 Save/Run | M | — |
| C3 normalizeScriptName | S | — |
| C5 addGroup 反馈 | S | — |

C4 是本批最大头，跨四层，建议单独成 plan。C2/C3/C5 可并行。

### 批次 3 · 性能/交互（P2）

| 卡片 | 工作量 | 可并行 |
|---|---|---|
| C1 Rete 销毁 + effect 依赖 | M | ✓ |
| C7 input↔textarea 焦点 | S–M | ✓ |

独立，可并行。

### 批次 4 · 架构一致性（P3）

| 卡片 | 工作量 | 聚簇 |
|---|---|---|
| C9 主题 FOUC | M | 主题簇（与 C13） |
| C13 sonner next-themes | S–M | 主题簇 |
| C14 cn-toast | S | toast 簇（与 C13 同文件） |
| C12 z-index 尺度 | M | 独立（全局回归） |
| C10 i18n 两块 | L | 独立（体力活） |

建议：C9+C13+C14 同批（主题/toast 梳理）；C12、C10 各自独立 plan。

---

## 五、待决策事项

本方案已就你已拍板的 3 点（removeGroup 迁移、Save/Run 都拦截、i18n 两块都做）落实。仍开放、可在实现阶段再定的取舍：

1. **C2 拦截 UI 形态**：有错误时是 `disable` 按钮，还是按钮可点但点击给 toast？倾向后者（让用户得到「为什么不能」的反馈）。
2. **C7 焦点方案**：A（始终 textarea + 视觉压缩）/ B（滞后切换）/ C（ref 恢复光标）三选一，倾向 A。
3. **C13 主题源**：A（移除 next-themes，必传 prop）/ B（引入 ThemeProvider 统一）。若与 C9 主题重构同批，B 更彻底；否则 A 更轻。
4. **C10 机会性拆分**：i18n 抽取时是否顺带把 472 行 `ActivePanelConfigPanel` 拆成子组件？倾向「是，但作为可选子任务」。
5. **C8 flush 机制**：`sendSync`（简单阻塞）vs `invoke` + 主进程 `before-quit` await（更优雅）。倾向后者。

以上 5 点不阻塞方案落地，留待对应批次的实现计划中定夺。

---

## 六、下一步

本文件是**整改方案**，不含实现。每批次实施时，应各自走 brainstorming → writing-plans → 实现 的流程。建议从**批次 1（P0 止血）**启动。
