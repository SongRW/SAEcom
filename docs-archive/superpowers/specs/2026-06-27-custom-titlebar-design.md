# 自定义窗口栏（TitleBar）覆盖所有 React 窗口设计

**日期**: 2026-06-27
**范围**: 新 React 侧（`src/components/titlebar/`、各窗口入口），`electron/main.ts` + `electron/preload.ts` 的窗口/IPC 配置
**目标**: 为所有 React 窗口实现统一的自定义窗口栏（拖拽区 + 品牌/标题 + 原生窗口按钮），参考 zcode 窗口栏观感。

---

## 1. 背景与现状

仓库处于 legacy → React 双轨迁移期。当前各窗口标题栏配置不一致：

| 窗口 | HTML 入口 | 当前 frame 配置 | 是否 React |
|---|---|---|---|
| 主窗（legacy） | `src/index.html` | `titleBarStyle:'hidden'` + `titleBarOverlay`（Win，30px） | 否（legacy renderer.js） |
| 主窗（React 预览） | `src/mainwindow.html` | default frame | 是 |
| 面板弹出 | `src/panel.html` | `frame:false`（完全无边框，无原生按钮） | 是 |
| 关于 | `src/about.html` | default frame | 否（plain HTML） |
| 更新日志 | `src/changelog.html` | default frame | 否（plain HTML） |

主窗已有 React 版本（`src/features/main-window/MainWindow.tsx`，shadcn Sidebar 体系）。about/changelog/panel 目前是独立 HTML，未来随迁移转为 React。

现状问题：
- React 主窗预览、面板弹出、关于/更新日志的标题栏风格各不相同，缺乏统一观感。
- panel 弹出窗 `frame:false` 导致完全没有窗口控件（最小化/关闭），只能靠自绘按钮关闭。
- 无统一的拖拽区与品牌呈现。

---

## 2. 决策记录

| 决策点 | 选择 | 备注 |
|---|---|---|
| 覆盖范围 | 全部未来 React 窗口 | 用户确认：mainwindow + panel + about + changelog（迁移为 React 后纳入） |
| 底层机制 | 混合（原生窗口按钮 + 自定义拖拽区） | 用户确认；跨平台原生手感，drag 区在 React 渲染 |
| 标题栏内容 | 品牌点 + 标题 + 连接状态徽章（方案 D，去除快捷动作） | 用户确认；`right` 插槽预留，本期不渲染快捷动作 |
| 视觉风格 | 微高亮 + 品牌渐变标题（风格 B） | 用户确认；栏背景 `--card`，标题 `--foreground→--primary` 文字渐变 |
| 组件架构 | 组合式底座 + 插槽（方案 B） | 一个 `TitleBarChrome` 底座，各窗口入口自行组合 |
| 快捷动作 | 本期不实现，仅预留 `right` 插槽 | 用户确认；刷新/设置/关于留待后续按需填入 |
| Linux 控件 | frame:false + 自绘最小化/最大化/关闭 | Linux 无 WCO，底座兜底渲染控件 |

---

## 3. 总体架构

新增 React 组件 `src/components/titlebar/`，各 React 窗口入口在其根布局顶部挂载底座。底座统一处理：拖拽区、原生控件留白（按平台）、主题适配、品牌/标题。主窗特有逻辑（连接徽章、快捷动作）通过插槽注入，不污染底座。

```
src/components/titlebar/
  TitleBarChrome.tsx     # 底座：drag 区 + 品牌/标题 + 原生控件留白 + 暗色适配
  ConnectionBadge.tsx    # 串口/TCP 连接状态徽章（仅主窗用，读 panels store）
  WindowControls.tsx     # Linux 自绘最小化/最大化/关闭（仅 Linux 渲染）
  useWindowControls.ts   # 窗口最大化/最小化/还原的 IPC hook
  titlebar.css           # drag region、平台间距、文字渐变样式
```

各窗口入口用法：
- **主窗**：`<TitleBarChrome status={<ConnectionBadge/>} />`（`right` 插槽预留空，本期不渲染快捷动作）
- **panel 弹出**：`<TitleBarChrome title={面板名} right={<关闭按钮/>} />`
- **about/changelog（React 化后）**：`<TitleBarChrome title="关于/更新日志" />`

---

## 4. 详细设计

### 4.1 TitleBarChrome 底座

职责：渲染 38px 高的窗口栏，含 drag 区、品牌点、标题（可传 `title` prop，默认读 `<title>`），并为原生窗口控件预留间距。

**Props**：
```ts
interface TitleBarChromeProps {
  title?: string                      // 显式标题；缺省读 document.title
  status?: React.ReactNode            // 主窗：连接徽章
  right?: React.ReactNode             // 快捷动作 / 关闭按钮
}
```

**布局（从左到右）**：
1. 品牌点（圆角方块，`--primary` 渐变，内含 "S" 或 logo）+ 标题（文字渐变）
2. `status` 插槽（主窗徽章）
3. flex 弹性占位
4. `right` 插槽（快捷动作 / 关闭）
5. 平台留白（见 4.4）

**drag 语义**：
- 整个栏 `-webkit-app-region: drag`。
- 所有可交互元素（连接徽章 hover、关闭按钮、`right` 插槽内容）打 `no-drag`（`-webkit-app-region: no-drag`），否则点击穿透到拖拽。
- 双击空白拖拽区 → 最大化/还原（系统原生行为，hidden/WCO 默认支持，无需自实现）。

**视觉（风格 B）**：
- 栏背景 `bg-card`，底部 1px `border-b border-border`。
- 品牌点：`bg-primary` 圆角 6px，18×18，白色字。
- 标题：`bg-gradient-to-r from-foreground to-primary bg-clip-text text-transparent`。
- 高度 38px（用内联样式 `style={{ height: 38 }}` 或 `h-[38px]`，避免非标准 `h-9.5`）。

### 4.2 ConnectionBadge（主窗串口状态）

读 `usePanelsStore`：`activeId` → `panels[activeId]`。

| 条件 | 显示 |
|---|---|
| 无 `activeId` 或面板不存在 | 不渲染（隐藏） |
| `open === false` | 灰点 + "未连接" |
| `type === 'serial'` 且 `open` | 绿点 + `● ${id} 已连接`（如 "COM3 已连接"） |
| `type === 'tcp'` 且 `open` | 绿点 + `● ${host:port} 已连接` |

样式：`muted` 底 + `border`，圆角胶囊，6px 状态点，11px 字号。绿点 `#16a34a`（亮）/`#4ade80`（暗）。订阅 store 自动更新。

### 4.3 right 插槽（预留）

`TitleBarChrome` 保留 `right?: React.ReactNode` 插槽，**本期主窗不传入任何内容**（渲染为空，不占额外宽度）。

- 插槽仅为后续扩展预留（如刷新/设置/关于等快捷动作），具体动作在需要时再填入。
- 主窗根无需因本插槽额外引入 `TooltipProvider`（已有，不受影响）。
- panel 弹出窗会用该插槽放关闭按钮（见 4.5 WindowControls 与面板用法）。

### 4.4 平台适配（写一次在底座）

| 平台 | frame 配置 | 窗口控件 | 留白 |
|---|---|---|---|
| **Windows** | `titleBarStyle:'hidden'` + `titleBarOverlay:{height:38,color,symbolColor}` | 原生 overlay（最小化/最大化/关闭，系统绘制） | 用 `env(titlebar-area-x)` / `env(titlebar-area-width)` 让内容避开右侧原生按钮；或简化为固定右侧 138px padding |
| **macOS** | `titleBarStyle:'hiddenInset'` | 原生红绿灯（系统绘制） | 左侧 78px padding 给红绿灯 |
| **Linux** | `frame:false` | 底座兜底渲染 `WindowControls`（自绘最小化/最大化/关闭） | 控件在栏右侧，无额外留白 |

平台检测：`process.platform`（preload 暴露）或 `navigator.userAgent`。优先 preload 暴露 `api.window.platform`。

**Windows 留白简化决策**：WCO 的 `env()` 在 React 渲染时机上较脆。采用固定 `pl-[138px]`（Win）/ `pl-[78px]`（Mac）方案，padding 通过底座按平台输出 class。若后续原生按钮遮挡内容，再切 `env()` 动态方案。

### 4.5 WindowControls（Linux 自绘）

仅在 Linux 渲染（`process.platform === 'linux'`）。三个按钮：
- 最小化 `ipc.window.minimize()`
- 最大化/还原 `ipc.window.toggleMaximize()`（按当前最大化态切换图标）
- 关闭 `ipc.window.close()`

样式：hover 时最小化/最大化 `bg-muted`，关闭 `bg-destructive` + 白字（类 macOS 红点的 Win/Linux 习惯）。调用 `useWindowControls` 获取最大化态。

### 4.6 electron 配置改动（main.ts）

| 窗口 | 当前 | 改为 |
|---|---|---|
| 主窗 React 预览（`dev:open-react-mainwindow`） | default frame | `titleBarStyle:'hidden'`（Win）/`'hiddenInset'`（Mac）+ overlay 高度 38；Linux `frame:false` |
| 主窗 legacy（`createMainWindow`） | hidden+overlay(30) | overlay 高度改 38 对齐（legacy 内容由 renderer.js 管，栏仍用原生，本次不动 React 化） |
| panel popout（`panel:popout`） | `frame:false` | `titleBarStyle:'hidden'`/`'hiddenInset'`；Linux `frame:false` |
| about（`about:open`） | default frame | 同 panel（**随 about React 化一起做，见第 7 节**） |
| changelog（`changelog:open`） | default frame | 同 about（**随 changelog React 化一起做**） |

注：about/changelog 的 `titleBarStyle` 改造前提是它们先 React 化（引入 React 挂载点）。本期**不**单独改这两个窗口的 frame——否则会变成"半 React 半 HTML"的栏。它们的 frame 配置 + 底座挂载捆绑进各自的 React 化任务，作为下一个独立 spec（见第 7 节）。

### 4.7 preload + IPC 扩展

`shared/types.ts` 的 `WindowAPI.window` 新增：
```ts
interface WindowAPI {
  window: {
    // 既有
    setFullscreen, toggleFullscreen, focus, setOscilloscopeTop
    // 新增
    platform: () => Promise<'win32'|'darwin'|'linux'>  // 进程平台
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (cb: (max: boolean) => void) => () => void
  }
}
```

main.ts 对应 IPC：
- `window:minimize` → `BrowserWindow.fromWebContents(sender)?.minimize()`
- `window:toggleMaximize` → 当前窗（非 mainWindow，需 `fromWebContents`）的 `isMaximized() ? unmaximize() : maximize()`
- `window:close` → `fromWebContents(sender)?.close()`
- `window:isMaximized`（invoke）→ `fromWebContents(sender)?.isMaximized() ?? false`
- `window:maximizeChange`（event）→ 给当前窗挂 `maximize`/`unmaximize` 监听，reply 给对应 webContents

关键：所有窗口操作用 `BrowserWindow.fromWebContents(e.sender)` 定位**当前发出请求的窗口**，而非全局 `mainWindow`——panel/关于/更新日志是多窗口，不能用单一 mainWindow。

---

## 5. 数据流

```
[usePanelsStore]  ──activeId/panels──▶  ConnectionBadge  ──▶  TitleBarChrome.status
                                              │
用户拖拽空白 ──▶  Electron 原生 drag（系统移动窗口）
                                              │
Linux 控件 ──▶  useWindowControls ──ipc──▶  main.ts(fromWebContents) ──▶ 窗口操作
```

无新增持久化；连接态来自既有 panels store；窗口控件态来自 Electron 事件。`right` 插槽本期为空，无数据流。

---

## 6. 测试计划

**单元测试（`test/titlebar-*.test.ts`，Vitest）**：
- `titlebar-connection-badge.test.ts`：四态渲染（无面板 / 未连接 / serial 连接 / tcp 连接），mock panels store。
- `titlebar-chrome.test.ts`：`title` prop 覆盖 document.title；`status`/`right` 插槽渲染；平台 class（mock `platform`）。
- `titlebar-window-controls.test.ts`：Linux 渲染三按钮、Win/Mac 不渲染；点击触发对应 ipc（mock）。

**类型检查**：`npm run typecheck` 通过（`shared/types.ts` WindowAPI 扩展）。

**手动验证（PR 说明）**：
- Win：主窗 React 预览栏拖拽、双击最大化、原生最小化/关闭可用；徽章随串口开关变化。
- Win：panel 弹出栏有原生按钮、可关闭。（about/changelog 留待其 React 化后再验证。）
- Mac：红绿灯不重叠标题；栏留白正确。
- Linux：自绘三按钮可点，关闭 hover 红。
- 亮/暗主题切换栏样式跟随。

---

## 7. 范围与分阶段

本期 spec 范围：
- **必做**：`TitleBarChrome` 底座（含 `right` 预留插槽）+ `ConnectionBadge` + Linux `WindowControls` + preload/main IPC + 平台配置。挂载到**主窗（mainwindow.html）**与**panel 弹出**（这两已是 React）。本期主窗 `right` 插槽为空，不渲染快捷动作。
- **可拆分后续**：about/changelog 的 **React 化迁移**本身（HTML→TSX + 挂底座）。这两个窗口的 frame 配置改造（`titleBarStyle:'hidden'`）随其 React 化一起做，避免半 React 半 HTML 的栏。

理由：about/changelog 当前是 plain HTML，强行加 React 标题栏需先引入 React 挂载点，工作量与本期标题栏核心脱钩。建议作为下一个独立 spec。

---

## 8. 风险与取舍

- **Windows WCO 留白**：固定 padding 方案在 DPI 缩放或不同系统主题下可能偏移。本期用固定值，若实测遮挡再切 `env()` 动态。
- **drag 区与子组件事件冲突**：所有交互元素必须 `no-drag`，遗漏会导致按钮失效（表现为点了没反应）。测试需覆盖。
- **多窗口 IPC 定位**：`fromWebContents` 是正确做法，但需确保所有新 IPC 都用它，不能图省事复用 `mainWindow`。
- **legacy 主窗**：`src/index.html`（实际生产主窗）本期**不动**其 React 化，栏仍用原生 overlay。React 标题栏先在预览窗验证，待主窗整体 React 化时统一替换。
