# 脚本页窗口控制与弹出设计

- 日期：2026-06-28
- 分支：develop_srw
- 状态：设计已批准，待实现

## 1. 目标与范围

### 做什么

为脚本编辑器（`src/features/script-editor/`，主窗内固定居中弹层 `ScriptEditorDialog`）补齐三项窗口级能力：

1. **最大化 / 最小化**：补活现有死按钮（最大化），新增最小化为底栏条交互。
2. **弹出为独立 Electron 窗口**：全功能独立运行（编辑/保存/运行/输出均在弹出窗内），参照串口面板 popout 模式。
3. **空画布 minimap 交互修复**：节点数为 0 时，拖动 / 点击 / 滚轮 minimap 仍能平移 / 定位 / 缩放主画布。

### 明确不做（避免范围蔓延）

- 不改脚本编辑器的画布渲染、节点系统、脚本执行沙箱（`electron/scriptSandbox`）。
- 不动串口面板 popout（`panel.html` / `panel:popout`）既有流程。
- 不做跨窗 graph 实时同步 IPC——弹出窗与主窗读同一持久化（localStorage graph + scripts 目录文件），开窗时各读各的，不互推增量。
- 主窗内 windowMode（normal/maximized/minimized）不持久化，每次打开默认 `normal`。
- 不动脚本编辑器的命令页 / 串口 tab 集成（已在其它设计覆盖）。

### 验收标准

1. 主窗内脚本页：点最大化 → 全屏覆盖、圆角清零、图标切还原；再点还原。
2. 主窗内脚本页：点最小化 → 主体收起、移除 backdrop、主窗完全可操作；底栏条贴底浮在最上层，显示脚本名 + 还原按钮；点还原回到最小化前的模式（normal 或 maximized）。
3. 脚本页「弹出」按钮 → 开独立 Electron 窗口，内含完整编辑器（画布 + 调色板 + 节点配置 + 输出 + 工具栏）；主窗内弹层同时隐藏。
4. 弹出窗内可编辑 / 保存 / 运行 / 停止脚本，输出实时显示在弹出窗；串口数据源、端口列表、面板摘要跨进程可用（既有 IPC）。
5. 弹出窗「回到主窗 / dock」按钮 → 关闭独立窗，主窗内弹层重新打开。
6. 二次弹出 → 聚焦已有弹出窗，不重复开窗。
7. 弹出窗最小化走原生窗口最小化（`win.minimize()`），不收底栏条。
8. 空画布（`graph.nodes.length === 0`）时：拖动 minimap 平移画布、点击 minimap 定位画布中心、滚轮缩放画布；缩放范围受 `clampCanvasZoom` 约束，与画布滚轮缩放一致。
9. 有节点时回退 Rete 原生 minimap（带导航框），行为不变。

## 2. 现状与差距

| # | 差距 | 位置 |
|---|------|------|
| 1 | 「最大化」按钮无 `onClick`（死按钮） | `components/Toolbar.tsx:66-68` |
| 2 | dialog 固定居中弹层，无 windowMode 状态、无最小化交互 | `ScriptEditorDialog.tsx` + `script-editor.css:19-30`（`width: min(1420px,100vw-32px)`） |
| 3 | 脚本页只能在主窗内弹层，无独立窗弹出能力 | 无对应 main 进程 IPC / 无独立 HTML 入口 |
| 4 | `MinimapPlugin` 节点数为 0 时不渲染导航框，minimap 无可命中元素 → 点/拖/滚轮无反应 | `rete/setup.ts:244`（`new MinimapPlugin`）|

## 3. 架构总览

### 3.1 弹出独立窗（Feature 2）

仿串口面板 popout（`panel:popout` → `panel.html`），建一条平行的 `script-editor:popout` 流程：

```
主窗 ScriptEditorDialog
  └─ Toolbar「弹出」按钮
       └─ ipc.scriptEditor.popout()
            └─ main: ipcMain.handle('script-editor:popout')
                 └─ new BrowserWindow → loadFile('script-editor.html')
主窗内：隐藏 ScriptEditorDialog（windowMode 不变，仅 isVisible=false）

独立窗 script-editor.html → script-editor.tsx
  └─ <ScriptEditorDialog isPopout />（全屏铺满，无 backdrop、无内窗控制外的标题栏）
       └─ Toolbar「回到主窗」按钮
            └─ ipc.scriptEditor.requestDock()
                 └─ main: 关闭独立窗 + 通知主窗 ipc.send('script-editor:dock')
主窗收到 dock → 重新显示 ScriptEditorDialog
```

**入口决策**：新建 `src/script-editor.html` + `src/script-editor.tsx`，不复用 `panel.html`。理由：编辑器组件树（画布+调色板+节点配置+输出）与串口面板差异大，专用入口避免 `panel.html` 里按 argv/分支；串口面板的 query 区分（`id`/`title`/`viewMode`/`opts`）也不适用于编辑器。注：串口面板用 URL query 传参（`u.searchParams.set`），编辑器无参数，故开窗时直接 `loadFile`/`loadURL` 不带 query，靠 `--script-editor-popout` argv 标记让 renderer 自检。

**弹出窗标题栏**：弹出窗为 frameless（复用面板 popout 的 `titleBarStyle`/`titleBarOverlay`/`frame` 配置），用 `TitleBarChrome`（`src/components/titlebar`）作标题栏。**双栏结构**：顶部 `TitleBarChrome`（窗口控制，`right` 插槽放「最小化/最大化/dock 回主窗」），其下才是编辑器自身的 `Toolbar`（文件/运行/工具等编辑器控制）。`TitleBarChrome` 的最小化/最大化走原生窗口（`win.minimize()` / `win.maximize()`）。

**单例约束**：弹出窗单例（`scriptEditorPopoutWindow: BrowserWindow | null`）。二次 popout → 聚焦已有窗，不新开。

**跨窗运行时**：`scripts:run/stop`、`scripts:log/ended`、`serial:*`、`config:*`、`window.getSerialPanelSummaries` 等已在 preload / 全局暴露，弹出窗作为普通 renderer 直接复用，无需新增跨窗 IPC。graph 与脚本文件走既有持久化（localStorage graph + `scripts` 目录文件 IPC），开窗各读各的。

### 3.2 最大化 / 最小化（Feature 1，主窗内）

`ScriptEditorDialog` 的 uiState 新增：

```ts
windowMode: 'normal' | 'maximized' | 'minimized'
preMinimizeMode: 'normal' | 'maximized'  // 最小化时记住还原目标
```

- **maximized**：dialog 加 class `is-maximized`；CSS 覆盖 `width:100vw; height:100vh; border-radius:0`；最大化按钮图标切还原。
- **minimized**：dialog 加 class `is-minimized`：
  - 主体（toolbar+canvas+side panel+output）`display:none`。
  - 仅渲染底栏条（贴底、高 ~36px、`left:0; right:0`、z-index 高于一切）：脚本名 + 还原按钮。
  - **移除 backdrop**（主窗完全可操作）；底栏条 `position:fixed; bottom:0` 浮在最上层。
  - 还原 → 回 `preMinimizeMode`。
- **持久化**：windowMode 不持久化，每次打开默认 `normal`。脚本内容已有持久化，最小化不丢数据。
- **弹出窗内**：独立窗的最小化/最大化走原生窗口（`win.minimize()` / `win.maximize()`），不收底栏条——独立窗有任务栏图标，原生行为更符合预期。故 Feature 1 的 windowMode 逻辑只在主窗内弹层生效；弹出窗的 `ScriptEditorDialog` 用 `isPopout` prop 跳过这套，最小化/最大化由 `TitleBarChrome` 的原生按钮承担（见 3.1 双栏结构）。

### 3.3 空画布 minimap 交互（Feature 3）

根因：`MinimapPlugin`（`rete/setup.ts:244`）节点数为 0 时不渲染导航框，minimap 无可命中元素 → pointer/wheel 无反应。

方案：在 minimap 容器（`[data-testid="minimap"]`）叠一层透传事件层，仅 `graph.nodes.length === 0` 时启用：

- **拖动平移**：pointerdown→move，按拖动向量调用 `area.translate(dx, dy)`（AreaPlugin API）平移主画布。
- **点击定位**：pointerdown 无 move（即 click），把点击点对齐视口中心（`area.translate` 算偏移）。
- **滚轮缩放**：minimap 容器挂 `wheel`，调用 `area.zoom()`（围绕 minimap 鼠标点），`preventDefault` 阻止页面滚动；缩放范围经 `clampCanvasZoom`（`viewModel.ts` 既有）约束。

实现：新增 `useEmptyMinimapInteraction(minimapEl, editor, isEmpty)` hook，在 `GraphCanvas` 内挂载。

- 空画布：事件层 `position:absolute; inset:0; cursor:grab`，吃 pointer/wheel 转 Rete area API。
- 有节点：事件层 `pointer-events:none`，回退 Rete 原生 minimap。
- minimap 背景保持主题色（无节点无可缩略内容），作为纯交互热区。

## 4. 组件与改动清单

### 4.1 主进程 `electron/main.ts`

- 新增 `scriptEditorPopoutWindow: BrowserWindow | null`（单例）。
- `ipcMain.handle('script-editor:popout')`：若已有 → `win.focus()`；否则新建 BrowserWindow，`loadFile(script-editor.html)`（dev 走 `DEV_SERVER_URL + '/src/script-editor.html'`），开窗时 `webPreferences.additionalArguments: ['--script-editor-popout']` 注入标记。
- `ipcMain.on('script-editor:request-dock')`：关闭独立窗、置 null、向主窗 `mainWindow.webContents.send('script-editor:dock')`。
- 窗口配置参照串口面板 popout（`electron/main.ts:866-919`）：合理默认尺寸（如 1200×780）、可调整、`webPreferences` 复用 preload。

### 4.2 preload `electron/preload.ts`

新增 `scriptEditor` 命名空间（仿 `panel`）：

```ts
scriptEditor: {
  popout: () => ipcRenderer.invoke('script-editor:popout'),
  requestDock: () => ipcRenderer.send('script-editor:request-dock'),
  onDock: (cb) => ipcRenderer.on('script-editor:dock', (_e) => cb()),
  isPopout: () => (process.argv || []).includes('--script-editor-popout'),
}
```

`--script-editor-popout` argv 标记由 main 进程开窗时经 `webPreferences.additionalArguments: ['--script-editor-popout']` 注入（参考 Electron 通行做法，preload 里 `process.argv` 可见），供 renderer 自检是否在弹出窗内。

### 4.3 renderer 入口

- **新增 `src/script-editor.html`**：仿 `src/panel.html`，`<div id="root">` + 加载 `./script-editor.tsx` + `mock-api.js`（web 预览安全网）。
- **新增 `src/script-editor.tsx`**：挂载 `<ScriptEditorDialog isPopout />`，全屏铺满。
- **`electron.vite.config.ts`**：renderer 多入口加 `script-editor.html`（参照 `panel.html` 现有配置）。

### 4.4 `ScriptEditorDialog.tsx`

- props 新增 `isPopout?: boolean`。
- uiState 新增 `windowMode` / `preMinimizeMode`（仅 `!isPopout` 时用）。
- `isPopout` 时：无 backdrop、dialog 铺满、Toolbar 不显示主窗内最大/最小化按钮，改显「回到主窗」按钮；最小化/最大化交原生标题栏。
- `!isPopout` 时：实现最大化/最小化（Feature 1）；Toolbar 新增「弹出」按钮。
- 监听 `ipc.scriptEditor.onDock` → 收到 dock 信号重新显示弹层。

### 4.5 `components/Toolbar.tsx`

- 「最大化」按钮接 `onClick`：toggle `normal ↔ maximized`，图标随状态切换。
- 新增「最小化」按钮 → `setWindowMode('minimized')`，记住 `preMinimizeMode`。
- 新增「弹出」按钮 → `onPopout()`（调 IPC，仅 `!isPopout`）。
- `isPopout` 时：显示「回到主窗」按钮 → `onDock()`；隐藏最大/最小化/弹出。

### 4.6 `script-editor.css`

- `.script-editor-dialog.is-maximized`：`width:100vw; height:100vh; border-radius:0`。
- `.script-editor-dialog.is-minimized`：主体 `display:none`；dialog 收为贴底条（`position:fixed; bottom:0; left:0; right:0; height:36px`）。
- `.script-editor-minimized-bar`：底栏条样式（脚本名 + 还原按钮）。
- `isPopout` 模式：dialog 铺满（`width:100vw; height:100vh`）、无 backdrop。

### 4.7 `components/GraphCanvas.tsx` + 新 hook

- 新增 `useEmptyMinimapInteraction(minimapEl, editor, isEmpty)`：
  - 找到 `[data-testid="minimap"]` 容器，挂 pointer/wheel 监听。
  - `isEmpty` 为 true 时启用透传层；false 时 `pointer-events:none`。
  - 转发到 `editor.area.translate` / `editor.area.zoom`，缩放经 `clampCanvasZoom`。
- 在 `GraphCanvas` useEffect 内调用该 hook（`graph.nodes.length === 0` 作为 `isEmpty`）。

## 5. 数据流

```
[Feature 2 弹出]
Toolbar「弹出」─ipc.scriptEditor.popout()─▶ main:开 BrowserWindow(load script-editor.html)
                                            ▶ 主窗:ScriptEditorDialog.isVisible=false
script-editor.tsx ─load─▶ <ScriptEditorDialog isPopout/> ─读 localStorage graph + scripts dir─▶ 全功能编辑器
Toolbar「回到主窗」─ipc.scriptEditor.requestDock()─▶ main:关独立窗 + send('script-editor:dock')
                                                       ▶ 主窗:onDock → isVisible=true

[Feature 1 max/min]  ScriptEditorDialog 内 uiState，纯前端，无 IPC
[Feature 3 minimap]  GraphCanvas 内 hook → editor.area API，纯前端，无 IPC
```

## 6. 错误处理与边界

- **dev 模式 loadFile 失败**：参照串口面板 popout（`main.ts:897-905`）走 `DEV_SERVER_URL` fallback。
- **二次弹出**：单例检查 → 聚焦已有窗，不重复创建。
- **独立窗被用户直接关 X**：`win.on('closed')` → 置 null；主窗 `onDock` 不触发（主窗弹层仍处隐藏态，用户需从入口重开）——此为可接受行为，记录在验收说明里。
- **空画布 minimap 无 area 实例**：hook 在 editor 未就绪时 no-op（`editor?.area` 可选链）。
- **minimap 容器尚未渲染**：hook 用 MutationObserver / ref 轮询定位 `[data-testid="minimap"]`，未找到时 no-op。
- **web 预览（无 ipc）**：`isPopout` 自检为 false，弹出按钮 `try/catch` 静默（与 `FloatingPane.handlePopout` 一致）。

## 7. 测试

按 AGENTS.md「为代码生成 / IPC 契约 / 共享逻辑加聚焦测试」：

- **`test/script-editor-window-mode.test.ts`**（Feature 1）：windowMode 状态机切换逻辑（normal↔maximized、minimized 记住/还原 preMinimizeMode）——抽成纯函数 `nextWindowMode` 便于单测。
- **`test/script-editor-popout-ipc.test.ts`**（Feature 2）：mock IPC，验证 popout→单例聚焦、dock→关窗+通知、`isPopout` argv 自检。
- **`test/empty-minimap-interaction.test.ts`**（Feature 3）：`isEmpty` 切换时透传层 pointer-events、拖动向量化（dx,dy → translate 调用参数）、滚轮缩放经 clampCanvasZoom。
- 手动 Electron 验证：三项功能的验收标准逐条走查，PR 附录屏/截图。

## 8. 影响与回滚

- **serialport 打包 / native rebuild**：无影响（不动 serialport 相关）。
- **legacy / React 共存**：脚本编辑器是 React 新轨，不动 legacy `renderer.js`。新增 `script-editor.html` 入口需在 `electron.vite.config.ts` 注册。
- **回滚**：三项功能相互独立，可分三个 commit；回滚单 feature 不影响其余。Feature 2 的 main/preload/HTML 入口为一组，回滚需同撤。
