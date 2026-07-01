# 示波器迁移设计（高性能可交互曲线组件）

- **日期**：2026-06-27
- **分支**：develop_srw
- **状态**：待评审
- **相关**：迁移老 `renderer.js` 中的 Canvas 示波器（`openWaveWindow`，`renderer.js:3991-4185`）到新 React 面板

## 背景与动机

老示波器是一个 ~135 行、嵌在 `renderer.js` 里的 Canvas 2D 画图器，通过 `window.open` 开成独立 Electron 子窗口、`postMessage` 喂数据。它有几个结构性缺陷：

- **单通道**——正则 `/-?\d+(\.\d+)?/g` 抓出所有数字压成一条曲线，多值输入无法分通道。
- **性能病根**——环形缓冲用 `Array.push` + `Array.shift()`（O(n)），每帧 O(n) 重算 min/max，无界 `requestAnimationFrame` 空转，无 DPR 缩放（HiDPI 模糊）。
- **交互贫乏**——只有暂停/清空/置顶/统计覆盖层，没有缩放、平移、时间轴、游标。
- **跨窗口 IPC**——`postMessage` 每个数字一条消息，高频串口会淹没消息队列。

用户期望的成品对标**云服务器监控仪表盘**的曲线组件：实时刷新、平滑曲线、可放大看细节、时间轴、简洁当前值。本设计将其重写为一个高性能、可交互、主题自适应、解耦可复用的 React 组件。

## 需求决策（已与用户确认）

| # | 维度 | 决策 |
|---|---|---|
| 1 | 数据模型 | **多通道·按序号**。逗号/空白分隔的第 N 个数字 = CH N，最多 8 通道。解析用宽松正则，任何数字流都能画（保留老示波器的鲁棒性）。 |
| 2 | 时间窗模型 | **实时尾 + 历史缓冲（可回溯）**。可暂停、拖轴回溯、框选放大任意区间。 |
| 3 | 渲染引擎 | **uPlot**（超大数据集 + 高刷新率专用，~45KB，无依赖）。天然绕开 React 重渲染。 |
| 4 | 架构分层 | **三层**：业务层 → 解耦组件（唯一知道 uPlot）→ 引擎层。引擎可替换。 |
| 5 | 数据流 | 环形 `Float32Array`（O(1)）+ dirtyRef + rAF 节流 + uPlot 内部降采样，全程不进 React state。 |
| 6 | 主题 | **跟随主窗口深/浅色**，零硬编码颜色，全部走 `globals.css` CSS 变量。 |
| 7 | 承载形态 | **浮动窗格**（复用 `FloatingPane` / react-rnd 机制）。 |
| 8 | 内部布局 | **紧凑顶栏式**：顶栏工具条 + 全幅图表（悬停十字线）+ 底部通道图例/当前值/时间窗下拉。 |

### 配置项

| 配置 | 默认 | 说明 |
|---|---|---|
| 历史缓冲时长 | 5 分钟 | 设置可配；输入处提示"建议 30 分钟以内"，并**动态显示当前设置的预估内存占用**（`时长 × 实时采样率 × 通道数 × 4字节`）。 |
| 通道数上限 | 8 | 超出按序号截断。 |
| 解析 | 宽松正则 | `/-?\d+(\.\d+)?/g` 抓数字，按出现序号分通道。 |

## 架构

### 三层分层

```
业务层   src/features/oscilloscope/OscilloscopePane.tsx
         （知道面板 id、串口数据、用户操作；不知道 uPlot 存在）
           ↓ 仅传语义化 props
解耦边界 src/components/scope/TimeSeriesChart.tsx
         （唯一 import uPlot；持实例 ref；管理 rAF + setData 节流）
           ↓
引擎层   uplot（第三方，纯渲染，可替换为手写 Canvas / WebGL）
```

**封装纪律：**
- uPlot 的 option 对象、canvas ref、`setData` 调用**绝不泄漏**到 props。
- 组件对外只暴露语义化接口（`series` / `data` / `paused` / `windowSec` / `onRangeChange`）。
- 时间戳统一用**毫秒 epoch**，不暴露 uPlot 内部索引。

### 模块结构

```
src/components/scope/                    # 通用、解耦的曲线组件（无业务知识）
├── TimeSeriesChart.tsx                  # uPlot 胶水 + rAF 节流，唯一知道 uPlot
├── theme.ts                             # CSS 变量 → uPlot 主题对象，唯一颜色映射处
└── ringBuffer.ts                        # 环形缓冲数据结构（类型 + 工具函数）

src/features/oscilloscope/               # 业务层
├── store.ts                             # zustand：仅配置（panelId/paused/windowSec/series 可见性）
├── useScopeData.ts                      # hook：ipc.serial/tcp.onData 按 id 过滤 → 环形缓冲 + 解析
├── parser.ts                            # 字节 → {ts, vals:number[]} 的宽松解析
├── OscilloscopePane.tsx                 # 浮动窗格外壳 + 顶栏 + 底部图例，组装 TimeSeriesChart
└── components/
    ├── ScopeToolbar.tsx                 # 实时/暂停/清空/回实时 + 吞吐量
    ├── ChannelLegend.tsx                # 通道色点 + 当前值 + 可见性切换
    └── WindowSizeSelect.tsx             # 时间窗下拉 + 预估内存提示
```

**职责边界：**
- `TimeSeriesChart` / `theme.ts` / `ringBuffer.ts` 属于 `src/components/scope/`，**无串口知识、无面板知识、无业务逻辑**，可被任何需要时序曲线的功能复用（如脚本编辑器输出）。
- `src/features/oscilloscope/` 持有业务语义，负责把串口字节变成曲线。

## 视图状态语义

示波器有三种视图状态，明确区分"采集"与"显示跟随"：

| 状态 | 含义 | 采集是否继续 | 视图是否跟随实时右沿 |
|---|---|---|---|
| **实时** | 默认状态 | 是 | 是（自动滚到最新） |
| **暂停** | 用户点暂停 | **是**（数据不丢） | 否（视图冻结在当前窗口） |
| **回溯/缩放** | 用户拖轴或框选 | 是 | 否（视图脱离右沿） |

关键原则：**采集（入环形缓冲）在任何状态下都不停**，只有历史时长上限会丢旧数据。这样暂停/回溯期间的数据都被保留，"回到实时"按钮重新吸附右沿即可看到完整连续曲线。这与老示波器"暂停即丢数据"（`!paused` 守卫在 push 之前，`renderer.js:4117`）的行为**不同**——是有意改进，避免回溯时出现数据空洞。

> 注：若未来需要"暂停即停止采集"的硬暂停语义，可作为配置项追加，不在本次范围。

## 数据流（高性能路径）

```
① ipc.serial.onData({id,bytes,ts})          千次/秒
     ↓ 按 id 过滤
② parser: 正则取数字 → 按逗号序号分通道      宽松、鲁棒
     ↓ push 进环形 Float32Array               O(1)，绝不 shift()
③ dirtyRef = true                            几乎零成本，不碰 React
     ↓ requestAnimationFrame 循环（与显示器刷新同步）
④ 脏才 plot.setData(linearize(buffer))       ≤ 60 次/秒
     ↓
⑤ uPlot 内部按像素列 min/max 降采样 + canvas 重绘   百万点 60fps
```

### 环形缓冲结构

```ts
interface RingBuffer {
  ts: Float64Array     // 时间戳（ms），环形
  ch: Float32Array[]   // [通道0, 通道1, ...]，每个环形
  head: number         // 写入位置
  count: number        // 已写入点数（≤ 容量）
  cap: number          // 容量上限
}
```

- 容量按"时间窗 × 最大采样率"估算，覆盖配置的历史时长。
- 入队：`head = (head + 1) % cap`，O(1)。
- 历史裁剪：按时间上限（如 5 分钟）丢旧；同时 `count` 不超 `cap`。
- 读 uPlot 时**线性化**（环形 → 连续），整体 `setData`。
- **绝不**使用 `Array.push` + `shift()`（老示波器的 O(n) 病根）。

### 性能保障（对照老示波器病根）

| 病根（老） | 对策（新） |
|---|---|
| `push`+`shift()` O(n) | 固定容量 `Float32Array` + head 索引，入队 O(1) |
| 每帧 O(n) 重算 min/max | uPlot 内部按像素列聚合，渲染时降采样 |
| 无界 rAF 空转重绘 | dirtyRef 守卫，无新数据不重绘 |
| 无 DPR 缩放（HiDPI 模糊） | uPlot 内置 DPR 处理 |
| `postMessage` 每数一条 | 进程内直接读 ref，无 IPC |

## 组件接口

### `TimeSeriesChart`（解耦组件，对外语义化）

```ts
interface ScopeSeries {
  label: string
  color: string          // 来自 theme.ts，由 --chart-N 解析
  visible: boolean
}

interface TimeSeriesChartProps {
  series: ScopeSeries[]
  buffer: React.MutableRefObject<RingBuffer>   // 读 ref，不触发重渲染
  paused: boolean
  windowSec: number       // 当前时间窗（秒）
  onRangeChange?: (range: [number, number]) => void   // [tStart, tEnd] ms
  onHover?: (ts: number | null) => void               // 悬停十字线回调
  className?: string
}
```

- 内部：`useRef` 持 uPlot 实例；`useEffect` 建实例 + 销毁；`requestAnimationFrame` 循环读 dirtyRef + `setData`。
- option 变化（series/theme/axes）才重建 option 对象；主题变化走 `applyTheme`（不销毁实例）。

### `OscilloscopePane`（业务外壳）

组装：`ScopeToolbar` + `TimeSeriesChart` + `ChannelLegend` + `WindowSizeSelect`。
通过 `useScopeData(panelId)` 订阅串口数据并喂给 `TimeSeriesChart`。
浮动窗格行为（拖拽/缩放/置顶）复用 `usePaneDrag` / `usePaneResize` / pin 机制。

## 主题对接（跟随深/浅色）

```ts
// src/components/scope/theme.ts —— 唯一颜色映射处
function readTheme(): ScopeTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    bg:     v('--background'),
    grid:   v('--border'),
    text:   v('--muted-foreground'),
    series: ['--chart-1','--chart-2','--chart-3','--chart-4','--chart-5'].map(v),
  }
}
```

- `TimeSeriesChart` 内部用 `MutationObserver` 监听 `documentElement` 的 `class` 变化（主窗切换 `.dark` 时触发），调用 `applyTheme(readTheme())`。
- **实例不销毁、只更新样式** → 切换无闪烁、无数据丢失。
- 通道色用 `--chart-1..5`；8 通道时循环复用 5 色 + 区分线型（实线/虚线）保证可辨识。
- oklch 颜色原样传给 canvas（浏览器原生支持，无需转换）。
- **纪律：组件内部任何地方禁止写死 `#hex`/rgb。**

## 接入点

- **UI 入口**：`src/features/main-window/components/ActivePanelConfigPanel.tsx:215` 的"示波器"按钮，当前是占位（`appendSysLine(pnl.id, '[系统] 示波器暂未迁移')`），改为打开当前面板的示波器浮动窗格。
- **数据入口**：`useScopeData` 仿 `src/panel.tsx:85-112`，自行注册 `ipc.serial.onData` / `ipc.tcp.onData`，按 `panelId` 过滤，保留原始 `Uint8Array`，**不经过 `usePanelsStore`**（主进程会 fan-out 到所有监听者，文本总线不受影响）。
- **挂载位置**：在 `SerialPanelWorkspace` 的浮动窗格渲染分支（`SerialPanelWorkspace.tsx:55-66` 附近）增挂 `OscilloscopePane`，与现有 `FloatingPane` 并列。

## 老示波器的处置

- 老 `openWaveWindow` / `feedWaveData` / `SerialWave` 子窗口逻辑（`renderer.js:3991-4185`）在迁移完成、经验证后**移除**。
- 相关 IPC `window:set-oscilloscope-top`（`electron/main.ts:1557-1568`）、`preload.ts:34` 的 `setOscilloscopeTop`、`shared/types.ts:210` 类型声明一并清理（新方案复用现有 pin 机制，不再需要专用置顶 IPC）。
- 迁移期间两套并存，由 feature flag（`useFlags`）控制切换。

## 测试策略

遵循仓库 Vitest 约定（`test/**/*.test.ts`）：

1. **`ringBuffer.test.ts`**——入队 O(1) 行为、环形回绕、容量上限裁剪、时间上限裁剪、线性化输出正确。
2. **`parser.test.ts`**——宽松正则：单数字、逗号分隔多数字、空白分隔、带单位文本（`Temp:25.5`）、无数字输入、非法输入不崩。
3. **`theme.test.ts`**——`readTheme` 从 mock `getComputedStyle` 正确解析变量；8 通道循环复用色 + 线型。
4. **`useScopeData` 行为测试**——按 id 过滤、暂停/回溯时采集仍继续入队（验证视图状态与采集解耦）、卸载时移除监听（mock `ipc`）。
5. **组件渲染**——`TimeSeriesChart` 挂载/卸载不泄漏 uPlot 实例（mock uPlot）。

需手动验证：Electron 内真实串口流的刷新率、缩放/平移/框选手感、深浅切换无闪烁、预估内存提示数值。

## YAGNI（明确不做）

- 触发器（trigger）、游标测 Δt/ΔV、FFT、测量值面板——超出云监控仪表盘风格，留待后续。
- 数据导出（CSV/PNG）——非本次目标，可用面板日志另存覆盖。
- 多 Y 轴 / 自定义 Y 缩放——先用自动 Y 范围（uPlot 默认）。
- 标签解析（`key:value` 分通道）——评估后舍弃，示波器场景宽松正则更鲁棒。

## 风险与权衡

| 风险 | 应对 |
|---|---|
| uPlot 非 React 风格，命令式胶水 | 封装在 `TimeSeriesChart` 单文件，业务侧零感知；可替换。 |
| 引入新依赖偏离"零重依赖"风格 | uPlot ~45KB 无依赖，且契合"高频数据不进 React"既定模式；工作量与手写相当但交互成熟度远高。 |
| 高采样率 × 长历史窗撑爆内存 | 预估内存提示 + 时间上限裁剪；容量按时间窗动态计算。 |
| oklch 颜色在 canvas 兼容性 | 现代浏览器/Electron Chromium 原生支持；如遇问题 `theme.ts` 单点回退转 rgb。 |
