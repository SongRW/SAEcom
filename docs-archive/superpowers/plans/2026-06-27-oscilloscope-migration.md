# 示波器迁移实施计划（高性能可交互曲线组件）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把老 `renderer.js` 的 Canvas 示波器重写为一个高性能、可交互、主题自适应、解耦可复用的 React 曲线组件，以浮动窗格形态接入新面板。

**Architecture:** 三层解耦——业务层 `src/features/oscilloscope/`（知道面板 id 与串口数据）→ 通用解耦组件 `src/components/scope/TimeSeriesChart.tsx`（唯一 import uPlot，对业务透明）→ 引擎层 uPlot。高频串口数据进 `useRef` 环形 `Float32Array`，经 `dirtyRef` + `requestAnimationFrame` 节流喂给 uPlot，全程不进 React state。

**Tech Stack:** React 19、Zustand v5、TypeScript、Vitest、uPlot（新增依赖）。主题走 `globals.css` CSS 变量。

**设计规格：** `docs/superpowers/specs/2026-06-27-oscilloscope-migration-design.md`

---

## 约定（适用于所有任务）

- 路径别名：`@/` → `src/`，`@shared/` → `shared/`。
- TS/TSX 两空格缩进、不加分号（沿用本仓库新文件风格，参见 `src/features/serial-panel/store.ts`）。
- React 组件 PascalCase，hook/util camelCase，测试 `*.test.ts`。
- 颜色**严禁硬编码** `#hex`/rgb，全部走 `globals.css` CSS 变量。
- 高频数据**严禁**进 React state（`useState`/`setX`），只进 `useRef`。
- 每个任务结束 `npm run typecheck` + `npm test` 必须通过。
- 提交信息用 Conventional Commits + scope，如 `feat(oscilloscope): ...`。

---

## 阶段总览

- **阶段 1（任务 1-3）**：通用层基础——环形缓冲、宽松解析、主题映射。纯逻辑、可单测、零 React。
- **阶段 2（任务 4-5）**：通用解耦组件 `TimeSeriesChart`（uPlot 胶水 + rAF 节流）。
- **阶段 3（任务 6-8）**：业务层——store、数据 hook、解析器装配。
- **阶段 4（任务 9-11）**：UI 外壳——窗格、工具栏、图例、时间窗下拉。
- **阶段 5（任务 12）**：接入主面板 + feature flag。
- **阶段 6（任务 13）**：清理老示波器死代码。

---

## 文件结构

**新建：**
- `src/components/scope/ringBuffer.ts` — 环形缓冲类型与工具
- `src/components/scope/theme.ts` — CSS 变量 → uPlot 主题映射
- `src/components/scope/TimeSeriesChart.tsx` — uPlot 解耦组件
- `src/components/scope/scope.css` — 示波器样式（CSS 变量驱动）
- `src/features/oscilloscope/parser.ts` — 字节 → 多通道样本
- `src/features/oscilloscope/store.ts` — zustand 配置 store（仅配置，无样本）
- `src/features/oscilloscope/useScopeData.ts` — 串口订阅 → 环形缓冲
- `src/features/oscilloscope/OscilloscopePane.tsx` — 浮动窗格外壳
- `src/features/oscilloscope/components/ScopeToolbar.tsx`
- `src/features/oscilloscope/components/ChannelLegend.tsx`
- `src/features/oscilloscope/components/WindowSizeSelect.tsx`
- `test/ringBuffer.test.ts`
- `test/scope-parser.test.ts`
- `test/scope-theme.test.ts`
- `test/scope-store.test.ts`

**修改：**
- `package.json` — 新增 `uplot` 依赖
- `src/shared/store/flags.ts` — 新增 `useReactOscilloscope` flag
- `src/features/serial-panel/components/SerialPanelWorkspace.tsx` — 挂载 `OscilloscopePane`
- `src/features/main-window/components/ActivePanelConfigPanel.tsx:215` — 接入按钮
- `electron/main.ts:1557-1589`、`electron/preload.ts:34`、`shared/types.ts:210` — 清理（阶段 6）
- `renderer.js:3991-4185`、`src/index.html:78` — 清理（阶段 6）

---

## 阶段 1：通用层基础（纯逻辑）

### Task 1: 环形缓冲数据结构

**Files:**
- Create: `src/components/scope/ringBuffer.ts`
- Test: `test/ringBuffer.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/ringBuffer.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createRingBuffer, pushSample, linearize, clearBuffer } from '../src/components/scope/ringBuffer'

describe('ringBuffer', () => {
  it('pushes and reads back samples in order when under capacity', () => {
    const rb = createRingBuffer({ capacity: 4, channels: 2 })
    pushSample(rb, 1000, [10, 20])
    pushSample(rb, 2000, [11, 21])
    const out = linearize(rb)
    expect(out.ts).toEqual(new Float64Array([1000, 2000]))
    expect(out.ch).toEqual([new Float32Array([10, 11]), new Float32Array([20, 21])])
    expect(out.count).toBe(2)
  })

  it('wraps around when exceeding capacity, dropping oldest', () => {
    const rb = createRingBuffer({ capacity: 3, channels: 1 })
    pushSample(rb, 1, [1])
    pushSample(rb, 2, [2])
    pushSample(rb, 3, [3])
    pushSample(rb, 4, [4]) // 覆盖最早
    const out = linearize(rb)
    expect(out.ts).toEqual(new Float64Array([2, 3, 4]))
    expect(out.ch).toEqual([new Float32Array([2, 3, 4])])
    expect(out.count).toBe(3)
  })

  it('records count separately from capacity', () => {
    const rb = createRingBuffer({ capacity: 5, channels: 1 })
    expect(rb.count).toBe(0)
    pushSample(rb, 1, [9])
    expect(rb.count).toBe(1)
  })

  it('clearBuffer resets count to 0 but keeps capacity/channels', () => {
    const rb = createRingBuffer({ capacity: 3, channels: 2 })
    pushSample(rb, 1, [1, 2])
    clearBuffer(rb)
    expect(rb.count).toBe(0)
    expect(rb.cap).toBe(3)
    expect(rb.ch.length).toBe(2)
    const out = linearize(rb)
    expect(out.count).toBe(0)
  })

  it('trims samples older than the time horizon', () => {
    const rb = createRingBuffer({ capacity: 10, channels: 1 })
    for (let i = 0; i < 6; i++) pushSample(rb, i * 1000, [i])
    // 保留最近 3 秒（t >= 3000）
    const dropped = trimOlderThan(rb, 3000)
    expect(dropped).toBe(3)
    const out = linearize(rb)
    expect(out.ts).toEqual(new Float64Array([3000, 4000, 5000]))
  })

  it('pushSample pads missing channels with NaN', () => {
    const rb = createRingBuffer({ capacity: 2, channels: 3 })
    pushSample(rb, 1, [5]) // 只给了 1 个通道
    const out = linearize(rb)
    expect(out.ch[0]).toEqual(new Float32Array([5]))
    expect(out.ch[1][0]).toBeNaN()
    expect(out.ch[2][0]).toBeNaN()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/ringBuffer.test.ts`
Expected: FAIL，"Cannot find module '../src/components/scope/ringBuffer'"

- [ ] **Step 3: 实现 ringBuffer.ts**

创建 `src/components/scope/ringBuffer.ts`：

```ts
/**
 * 高性能环形缓冲。固定容量 Float32Array/Float64Array + head 索引，入队 O(1)。
 * 替代老示波器的 Array.push + shift()（O(n) 病根）。
 * 仅纯逻辑，无 React、无 uPlot 依赖，可被任何时序组件复用。
 */

export interface RingBuffer {
  ts: Float64Array
  ch: Float32Array[]
  head: number
  count: number
  cap: number
}

/** linearize 输出：环形 → 连续，便于整体喂给 uPlot.setData */
export interface Linearized {
  ts: Float64Array
  ch: Float32Array[]
  count: number
}

export function createRingBuffer(opts: { capacity: number; channels: number }): RingBuffer {
  return {
    ts: new Float64Array(opts.capacity),
    ch: Array.from({ length: opts.channels }, () => new Float32Array(opts.capacity)),
    head: -1,
    count: 0,
    cap: opts.capacity
  }
}

/** 入队一个多通道样本。vals 不足通道数时用 NaN 填充。O(1)。 */
export function pushSample(rb: RingBuffer, ts: number, vals: number[]): void {
  rb.head = (rb.head + 1) % rb.cap
  rb.ts[rb.head] = ts
  for (let c = 0; c < rb.ch.length; c++) {
    rb.ch[c][rb.head] = c < vals.length ? vals[c] : NaN
  }
  if (rb.count < rb.cap) rb.count++
}

/** 环形 → 连续（旧→新），返回新数组。count=0 时返回空。 */
export function linearize(rb: RingBuffer): Linearized {
  const n = rb.count
  const ts = new Float64Array(n)
  const ch = rb.ch.map(() => new Float32Array(n))
  if (n === 0) return { ts, ch, count: 0 }
  // 起始索引：head 是最新，往前 n-1 是最旧
  const start = (rb.head - (n - 1) + rb.cap) % rb.cap
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % rb.cap
    ts[i] = rb.ts[idx]
    for (let c = 0; c < rb.ch.length; c++) {
      ch[c][i] = rb.ch[c][idx]
    }
  }
  return { ts, ch, count: n }
}

/** 清空（保留容量与通道结构）。 */
export function clearBuffer(rb: RingBuffer): void {
  rb.head = -1
  rb.count = 0
}

/**
 * 丢弃时间戳早于 minTs 的样本（按时间窗上限裁剪）。
 * 通过移动逻辑起点实现，不改数组内容。
 * 返回丢弃的样本数。
 */
export function trimOlderThan(rb: RingBuffer, minTs: number): number {
  if (rb.count === 0) return 0
  const lin = linearize(rb)
  let drop = 0
  for (let i = 0; i < lin.count; i++) {
    if (lin.ts[i] < minTs) drop++
    else break
  }
  if (drop === 0) return 0
  // 重建缓冲：把保留部分重新写入一个干净起点。
  // 简单做法：把 head/count 语义后移——直接重置 head 到 (head - count + drop) 的逻辑。
  // 这里用重写保证正确性（drop 通常远小于 count，开销可接受）。
  const keep = lin.count - drop
  const start = (rb.head - (rb.count - 1) + drop + rb.cap) % rb.cap
  // 复制保留部分到缓冲前部
  const tsKeep = new Float64Array(keep)
  const chKeep = rb.ch.map(() => new Float32Array(keep))
  for (let i = 0; i < keep; i++) {
    const idx = (start + i) % rb.cap
    tsKeep[i] = rb.ts[idx]
    for (let c = 0; c < rb.ch.length; c++) chKeep[c][i] = rb.ch[c][idx]
  }
  for (let i = 0; i < keep; i++) {
    rb.ts[i] = tsKeep[i]
    for (let c = 0; c < rb.ch.length; c++) rb.ch[c][i] = chKeep[c][i]
  }
  rb.head = keep - 1
  rb.count = keep
  return drop
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/ringBuffer.test.ts`
Expected: PASS，全部 6 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/components/scope/ringBuffer.ts test/ringBuffer.test.ts
git commit -m "feat(scope): add O(1) ring buffer with time-horizon trim"
```

---

### Task 2: 宽松多通道解析器

**Files:**
- Create: `src/features/oscilloscope/parser.ts`
- Test: `test/scope-parser.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/scope-parser.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { parseChunk, extractSamples, MAX_CHANNELS } from '../src/features/oscilloscope/parser'

describe('scope parser', () => {
  it('extracts numbers from a single-number line', () => {
    expect(extractSamples('25.5\r\n')).toEqual([25.5])
  })

  it('splits comma-separated values into ordered channels', () => {
    expect(extractSamples('1.23,4.56,7.89')).toEqual([1.23, 4.56, 7.89])
  })

  it('splits whitespace-separated values into ordered channels', () => {
    expect(extractSamples('1 2 3')).toEqual([1, 2, 3])
  })

  it('extracts numbers from key:value text but loses the key (by design)', () => {
    // 宽松正则：只取数字，key 丢弃。符合"任何数字流都能画"的鲁棒目标。
    expect(extractSamples('temp:25.5 humi:60')).toEqual([25.5, 60])
  })

  it('ignores non-numeric text', () => {
    expect(extractSamples('hello world')).toEqual([])
  })

  it('handles negative numbers', () => {
    expect(extractSamples('-1.5,-2.5')).toEqual([-1.5, -2.5])
  })

  it('caps channel count at MAX_CHANNELS', () => {
    const many = Array.from({ length: MAX_CHANNELS + 3 }, (_, i) => i).join(',')
    expect(extractSamples(many)).toHaveLength(MAX_CHANNELS)
  })

  it('parseChunk yields one sample set per line, returning non-empty lines', () => {
    const sets = parseChunk('1,2\r\n3\r\nno-numbers\r\n4,5,6')
    expect(sets).toEqual([[1, 2], [3], [4, 5, 6]])
  })

  it('parseChunk handles chunk without trailing newline', () => {
    expect(parseChunk('1.1,2.2')).toEqual([[1.1, 2.2]])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/scope-parser.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 parser.ts**

创建 `src/features/oscilloscope/parser.ts`：

```ts
/**
 * 宽松多通道解析器。移植自老示波器的正则 /-?\d+(\.\d+)?/g（renderer.js:4168），
 * 但保留通道序号：逗号/空白分隔的第 N 个数字 = CH N。
 * 鲁棒优先：任何数字流都能画，不假设格式。
 */

/** 通道数上限。超出按序号截断。 */
export const MAX_CHANNELS = 8

/** 抓数字的宽松正则（与老示波器一致） */
const NUM_RE = /-?\d+(?:\.\d+)?/g

/** 从一段文本中提取所有数字，截断到 MAX_CHANNELS 通道 */
export function extractSamples(text: string): number[] {
  const out: number[] = []
  let m: RegExpExecArray | null
  NUM_RE.lastIndex = 0
  while ((m = NUM_RE.exec(text)) !== null) {
    out.push(parseFloat(m[0]))
    if (out.length >= MAX_CHANNELS) break
  }
  return out
}

/**
 * 解析一个数据块（可能含多行）。按行切分，每行提取一组通道值。
 * 空行（无数字）被丢弃。
 * 返回的每组对应一个时间戳下的多通道样本。
 */
export function parseChunk(chunk: string): number[][] {
  const lines = chunk.split(/\r?\n/)
  const sets: number[][] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const samples = extractSamples(line)
    if (samples.length > 0) sets.push(samples)
  }
  return sets
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/scope-parser.test.ts`
Expected: PASS，全部 9 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/features/oscilloscope/parser.ts test/scope-parser.test.ts
git commit -m "feat(oscilloscope): add lenient multi-channel parser"
```

---

### Task 3: 主题映射（CSS 变量 → ScopeTheme）

**Files:**
- Create: `src/components/scope/theme.ts`
- Test: `test/scope-theme.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/scope-theme.test.ts`：

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { readTheme, buildSeriesStyles } from '../src/components/scope/theme'

describe('scope theme', () => {
  beforeEach(() => {
    // mock getComputedStyle 返回 globals.css 的变量值
    const vars: Record<string, string> = {
      '--background': 'oklch(0.148 0.004 228.8)',
      '--border': 'oklch(1 0 0 / 10%)',
      '--muted-foreground': 'oklch(0.723 0.014 214.4)',
      '--chart-1': 'oklch(0.855 0.138 181.071)',
      '--chart-2': 'oklch(0.704 0.14 182.503)',
      '--chart-3': 'oklch(0.6 0.118 184.704)',
      '--chart-4': 'oklch(0.511 0.096 186.391)',
      '--chart-5': 'oklch(0.437 0.078 188.216)'
    }
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => vars[name] ?? ''
    }))
  })

  it('reads background, grid, text from CSS variables', () => {
    const t = readTheme()
    expect(t.bg).toBe('oklch(0.148 0.004 228.8)')
    expect(t.grid).toBe('oklch(1 0 0 / 10%)')
    expect(t.text).toBe('oklch(0.723 0.014 214.4)')
  })

  it('reads 5 chart series colors', () => {
    const t = readTheme()
    expect(t.series).toHaveLength(5)
    expect(t.series[0]).toBe('oklch(0.855 0.138 181.071)')
    expect(t.series[4]).toBe('oklch(0.437 0.078 188.216)')
  })

  it('buildSeriesStyles cycles colors for channels beyond 5 and alternates line style', () => {
    const styles = buildSeriesStyles(readTheme(), 8)
    expect(styles).toHaveLength(8)
    // 通道 0-4 用 chart-1..5
    expect(styles[0].stroke).toBe('oklch(0.855 0.138 181.071)')
    expect(styles[4].stroke).toBe('oklch(0.437 0.078 188.216)')
    // 通道 5-7 循环复用 chart-1..3
    expect(styles[5].stroke).toBe('oklch(0.855 0.138 181.071)')
    expect(styles[7].stroke).toBe('oklch(0.6 0.118 184.704)')
    // 第 6 个起（index>=5）用虚线区分
    expect(styles[4].dash).toBeUndefined()
    expect(styles[5].dash).toEqual([6, 4])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/scope-theme.test.ts`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 theme.ts**

创建 `src/components/scope/theme.ts`：

```ts
/**
 * CSS 变量 → uPlot 主题对象。全组件唯一颜色映射处。
 * 通过 getComputedStyle 读取 globals.css 的 OKLCH 变量，原样传给 canvas（浏览器原生支持）。
 * 通道色循环复用 --chart-1..5，超出 5 通道用虚线区分。
 */

export interface ScopeTheme {
  bg: string
  grid: string
  text: string
  series: string[] // chart-1..5
}

/** 单条曲线的样式 */
export interface SeriesStyle {
  stroke: string
  width: number
  dash?: number[]
}

const CHART_VARS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'] as const

export function readTheme(): ScopeTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (n: string) => css.getPropertyValue(n).trim()
  return {
    bg: v('--background'),
    grid: v('--border'),
    text: v('--muted-foreground'),
    series: CHART_VARS.map(v)
  }
}

/**
 * 为 N 个通道生成样式。颜色循环复用 5 个 chart 色；
 * 第 6 个起（index >= 5）加虚线 dash，保证可辨识。
 */
export function buildSeriesStyles(theme: ScopeTheme, channelCount: number): SeriesStyle[] {
  const styles: SeriesStyle[] = []
  for (let i = 0; i < channelCount; i++) {
    styles.push({
      stroke: theme.series[i % theme.series.length],
      width: 1.5,
      dash: i >= theme.series.length ? [6, 4] : undefined
    })
  }
  return styles
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/scope-theme.test.ts`
Expected: PASS，全部 3 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/components/scope/theme.ts test/scope-theme.test.ts
git commit -m "feat(scope): add CSS-variable-driven theme mapping"
```

---

## 阶段 2：通用解耦组件 TimeSeriesChart

### Task 4: 安装 uPlot 依赖

**Files:**
- Modify: `package.json`
- Create: `src/components/scope/TimeSeriesChart.tsx`

- [ ] **Step 1: 安装 uPlot**

Run:
```bash
npm install uplot
```
Expected: `package.json` 的 `dependencies` 出现 `"uplot": "^1.6.x"`，`package-lock.json` 更新。

- [ ] **Step 2: 确认类型声明存在**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i uplot || echo "no uplot type errors"`
Expected: uPlot 自带类型声明（`uplot/dist/uPlot.d.ts`），无类型错误。如缺失类型，安装 `npm install -D @types/uplot`。

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore(oscilloscope): add uplot dependency"
```

---

### Task 5: TimeSeriesChart 解耦组件（uPlot 胶水 + rAF 节流）

**Files:**
- Create: `src/components/scope/TimeSeriesChart.tsx`
- Create: `src/components/scope/scope.css`

- [ ] **Step 1: 写组件骨架与 props 类型**

创建 `src/components/scope/TimeSeriesChart.tsx`：

```tsx
import { useEffect, useRef } from 'react'
import UPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { readTheme, buildSeriesStyles, type ScopeTheme } from './theme'
import type { RingBuffer } from './ringBuffer'
import { linearize } from './ringBuffer'
import './scope.css'

/** 对外语义化通道定义 */
export interface ScopeSeries {
  label: string
  visible: boolean
}

export interface TimeSeriesChartProps {
  series: ScopeSeries[]
  /** 环形缓冲 ref——读 ref，不触发 React 重渲染 */
  buffer: React.MutableRefObject<RingBuffer>
  /** 脏标记 ref——数据入队时置 true */
  dirty: React.MutableRefObject<boolean>
  /** 当前是否吸附实时右沿 */
  live: boolean
  /** 时间窗（秒），用于设置 X 轴跨度 */
  windowSec: number
  /** 通道数（决定 Y 轴 series 数） */
  channelCount: number
  onHover?: (ts: number | null) => void
  className?: string
}

/** 通道索引 → uPlot series 索引（0 是 X 轴） */
const X_AXIS_INDEX = 0

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { series, buffer, dirty, live, windowSec, channelCount } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<UPlot | null>(null)
  const themeRef = useRef<ScopeTheme>(readTheme())
  const liveRef = useRef(live)
  const windowSecRef = useRef(windowSec)
  liveRef.current = live
  windowSecRef.current = windowSec

  // 建实例 + 销毁
  useEffect(() => {
    if (!containerRef.current) return
    const theme = themeRef.current
    const styles = buildSeriesStyles(theme, channelCount)

    const opts: UPlot.Options = {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      series: [
        {}, // X 轴（时间，秒）
        ...Array.from({ length: channelCount }, (_, i) => ({
          label: `CH${i + 1}`,
          stroke: styles[i].stroke,
          width: styles[i].width,
          dash: styles[i].dash,
          show: series[i]?.visible ?? true
        }))
      ],
      axes: [
        { stroke: theme.text, grid: { stroke: theme.grid, width: 1 } },
        { stroke: theme.text, grid: { stroke: theme.grid, width: 1 } }
      ],
      scales: { x: { time: true }, y: { auto: true } },
      cursor: { drag: { x: true, y: true, setScale: false } }
    }

    const plot = new UPlot(opts, [], containerRef.current)
    plotRef.current = plot

    return () => {
      plot.destroy()
      plotRef.current = null
    }
    // 仅在通道数变化时重建实例
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelCount])

  // rAF 节流渲染循环
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const plot = plotRef.current
      if (!plot) return
      if (dirty.current) {
        dirty.current = false
        const lin = linearize(buffer.current)
        const data: UPlot.AlignedData = [
          Array.from(lin.ts, (t) => t / 1000), // ms → s（uPlot time 用秒）
          ...lin.ch.map((c) => Array.from(c))
        ]
        plot.setData(data, false)
        if (liveRef.current && lin.count > 1) {
          const tEnd = lin.ts[lin.count - 1] / 1000
          plot.setScale('x', { min: tEnd - windowSecRef.current, max: tEnd })
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [buffer, dirty])

  // 主题跟随（MutationObserver 监听 .dark 类）
  useEffect(() => {
    const apply = () => {
      themeRef.current = readTheme()
      const plot = plotRef.current
      if (!plot) return
      const styles = buildSeriesStyles(themeRef.current, channelCount)
      for (let i = 0; i < channelCount; i++) {
        plot.series[i + 1].stroke = styles[i].stroke
        plot.series[i + 1].dash = styles[i].dash
      }
      plot.axes.forEach((a) => {
        a.stroke = themeRef.current.text
        if (a.grid) a.grid.stroke = themeRef.current.grid
      })
      plot.redraw()
    }
    const ro = new MutationObserver(apply)
    ro.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => ro.disconnect()
  }, [channelCount])

  // 通道可见性变化
  useEffect(() => {
    const plot = plotRef.current
    if (!plot) return
    series.forEach((s, i) => {
      if (plot.series[i + 1]) plot.series[i + 1].show = s.visible
    })
    plot.redraw()
  }, [series])

  return <div ref={containerRef} className={`scope-chart-container ${props.className ?? ''}`} />
}
```

- [ ] **Step 2: 写样式**

创建 `src/components/scope/scope.css`：

```css
/* 示波器容器。uPlot 自身样式由 uplot/dist/uPlot.min.css 提供。
   这里只覆盖背景/尺寸，全部用 CSS 变量，零硬编码颜色。 */
.scope-chart-container {
  width: 100%;
  height: 100%;
  background: var(--background);
  border-radius: var(--radius);
  overflow: hidden;
}

/* uPlot 画布填满容器 */
.scope-chart-container .uplot {
  width: 100% !important;
  height: 100% !important;
}

/* 悬停十字线颜色用主题 */
.scope-chart-container .u-cursor-x,
.scope-chart-container .u-cursor-y {
  stroke: var(--primary) !important;
}
```

- [ ] **Step 3: typecheck 确认类型正确**

Run: `npm run typecheck`
Expected: 无错误。若 uPlot 类型路径不对，调整 `import UPlot from 'uplot'` 为 `import UPlot from 'uplot/dist/uPlot.cjs'` 或参照其 d.ts。

- [ ] **Step 4: 提交**

```bash
git add src/components/scope/TimeSeriesChart.tsx src/components/scope/scope.css
git commit -m "feat(scope): add TimeSeriesChart decoupled uPlot component with rAF throttle"
```

---

## 阶段 3：业务层

### Task 6: 示波器配置 store（zustand，仅配置）

**Files:**
- Create: `src/features/oscilloscope/store.ts`
- Test: `test/scope-store.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/scope-store.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { useOscilloscopeStore } from '../src/features/oscilloscope/store'

describe('oscilloscope store', () => {
  beforeEach(() => {
    useOscilloscopeStore.setState({
      openPaneId: null,
      panes: {},
      windowSec: 300
    })
  })

  it('opens a pane for a panel id with default config', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    const s = useOscilloscopeStore.getState()
    expect(s.openPaneId).toBe('COM3')
    expect(s.panes['COM3']).toBeDefined()
    expect(s.panes['COM3'].paused).toBe(false)
    expect(s.panes['COM3'].live).toBe(true)
  })

  it('opening an already-open pane just focuses it (no duplicate)', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    const first = useOscilloscopeStore.getState().panes['COM3']
    useOscilloscopeStore.getState().openPane('COM3')
    expect(Object.keys(useOscilloscopeStore.getState().panes)).toHaveLength(1)
    expect(useOscilloscopeStore.getState().panes['COM3']).toBe(first)
  })

  it('pause sets paused=true but keeps live state for resume', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    useOscilloscopeStore.getState().setPaused('COM3', true)
    expect(useOscilloscopeStore.getState().panes['COM3'].paused).toBe(true)
    expect(useOscilloscopeStore.getState().panes['COM3'].live).toBe(false)
  })

  it('toggleChannelVisibility flips visible', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    useOscilloscopeStore.getState().toggleChannelVisibility('COM3', 1)
    expect(useOscilloscopeStore.getState().panes['COM3'].channelVisible[1]).toBe(false)
  })

  it('setWindowSec updates windowSec', () => {
    useOscilloscopeStore.getState().setWindowSec(600)
    expect(useOscilloscopeStore.getState().windowSec).toBe(600)
  })

  it('closePane removes the pane', () => {
    useOscilloscopeStore.getState().openPane('COM3')
    useOscilloscopeStore.getState().closePane('COM3')
    expect(useOscilloscopeStore.getState().panes['COM3']).toBeUndefined()
    expect(useOscilloscopeStore.getState().openPaneId).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/scope-store.test.ts`
Expected: FAIL，`Cannot find module '../src/features/oscilloscope/store'`

- [ ] **Step 3: 实现 store.ts**

创建 `src/features/oscilloscope/store.ts`：

```ts
import { create } from 'zustand'
import { MAX_CHANNELS } from './parser'

/** 单个示波器窗格的配置（不含样本数据） */
export interface ScopePaneConfig {
  panelId: string
  paused: boolean
  /** 是否吸附实时右沿（回溯/框选时变 false） */
  live: boolean
  /** 各通道可见性（索引 0..MAX_CHANNELS-1） */
  channelVisible: boolean[]
}

interface OscilloscopeState {
  /** 当前聚焦的窗格 panel id */
  openPaneId: string | null
  panes: Record<string, ScopePaneConfig>
  /** 显示时间窗（秒） */
  windowSec: number

  openPane: (panelId: string) => void
  closePane: (panelId: string) => void
  setPaused: (panelId: string, paused: boolean) => void
  setLive: (panelId: string, live: boolean) => void
  toggleChannelVisibility: (panelId: string, channelIndex: number) => void
  setWindowSec: (sec: number) => void
}

export const useOscilloscopeStore = create<OscilloscopeState>((set) => ({
  openPaneId: null,
  panes: {},
  windowSec: 300, // 5 分钟默认

  openPane: (panelId) =>
    set((s) => {
      if (s.panes[panelId]) {
        return { openPaneId: panelId }
      }
      const cfg: ScopePaneConfig = {
        panelId,
        paused: false,
        live: true,
        channelVisible: Array.from({ length: MAX_CHANNELS }, () => true)
      }
      return { openPaneId: panelId, panes: { ...s.panes, [panelId]: cfg } }
    }),

  closePane: (panelId) =>
    set((s) => {
      const panes = { ...s.panes }
      delete panes[panelId]
      return {
        panes,
        openPaneId: s.openPaneId === panelId ? null : s.openPaneId
      }
    }),

  setPaused: (panelId, paused) =>
    set((s) => {
      const p = s.panes[panelId]
      if (!p) return s
      return { panes: { ...s.panes, [panelId]: { ...p, paused, live: paused ? false : p.live } } }
    }),

  setLive: (panelId, live) =>
    set((s) => {
      const p = s.panes[panelId]
      if (!p) return s
      return { panes: { ...s.panes, [panelId]: { ...p, live, paused: live ? false : p.paused } } }
    }),

  toggleChannelVisibility: (panelId, channelIndex) =>
    set((s) => {
      const p = s.panes[panelId]
      if (!p) return s
      const channelVisible = [...p.channelVisible]
      channelVisible[channelIndex] = !channelVisible[channelIndex]
      return { panes: { ...s.panes, [panelId]: { ...p, channelVisible } } }
    }),

  setWindowSec: (sec) =>
    set({ windowSec: sec })
}))
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/scope-store.test.ts`
Expected: PASS，全部 6 个测试通过

- [ ] **Step 5: 提交**

```bash
git add src/features/oscilloscope/store.ts test/scope-store.test.ts
git commit -m "feat(oscilloscope): add config-only zustand store for scope panes"
```

---

### Task 7: 串口数据订阅 hook（useScopeData）

**Files:**
- Create: `src/features/oscilloscope/useScopeData.ts`

- [ ] **Step 1: 实现 hook**

创建 `src/features/oscilloscope/useScopeData.ts`：

```ts
import { useEffect, useRef } from 'react'
import { useIPC, getIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import { createRingBuffer, pushSample, trimOlderThan, clearBuffer, type RingBuffer } from '@/components/scope/ringBuffer'
import { parseChunk } from './parser'
import { useOscilloscopeStore } from './store'

/**
 * 订阅指定面板的串口数据 → 解析 → 入环形缓冲。仿 src/panel.tsx:85-112 直连监听模式。
 * 关键：原始字节不进 React state，全部在 ref 里；采集在任何视图状态下都不停
 * （暂停/回溯只冻结视图，不丢数据——与老示波器不同，是有意改进）。
 *
 * @param panelId 要监听的面板 id
 * @param channelCount 通道数
 * @param historyMs 历史缓冲时长（毫秒），用于按时间上限裁剪
 * @returns { buffer, dirty, clear } —— buffer/dirty 是 ref，clear 清空
 */
export function useScopeData(panelId: string, channelCount: number, historyMs: number) {
  const ipc = useIPC()
  const buffer = useRef<RingBuffer>(
    createRingBuffer({ capacity: estimateCapacity(historyMs), channels: channelCount })
  )
  const dirty = useRef(false)
  const historyMsRef = useRef(historyMs)
  historyMsRef.current = historyMs

  // 采样率估计（用于容量自适应 + UI 显示吞吐量）
  const sampleRate = useRef(0)
  const rateAccum = useRef({ count: 0, t0: performance.now() })

  useEffect(() => {
    const onData = ({ id, bytes }: { id: string; bytes: Uint8Array }) => {
      if (id !== panelId) return
      const settings = useSettingsStore.getState()
      const enc = settings.charEncoding || 'utf-8'
      const text = new TextDecoder(enc).decode(bytes)
      const sets = parseChunk(text)
      if (sets.length === 0) return
      const now = Date.now()
      const rb = buffer.current
      for (const vals of sets) {
        pushSample(rb, now, vals)
      }
      // 按时间上限裁剪
      const minTs = now - historyMsRef.current
      trimOlderThan(rb, minTs)
      dirty.current = true
      // 吞吐量统计
      const acc = rateAccum.current
      acc.count += sets.length
      const elapsed = performance.now() - acc.t0
      if (elapsed >= 500) {
        sampleRate.current = Math.round((acc.count * 1000) / elapsed)
        acc.count = 0
        acc.t0 = performance.now()
      }
    }
    ipc.serial.onData(onData)
    ipc.tcp?.onData(onData)
    // 注：preload 的 onData 无卸载句柄返回，监听随组件卸载/窗口销毁释放
  }, [ipc, panelId])

  const clear = () => {
    clearBuffer(buffer.current)
    dirty.current = true
  }

  return { buffer, dirty, clear, getSampleRate: () => sampleRate.current }
}

/** 估算环形缓冲容量：历史时长 × 假设最大采样率（保守 1000/s），设下限。 */
function estimateCapacity(historyMs: number): number {
  const maxRate = 1000 // pts/s 保守估计
  const cap = Math.ceil((historyMs / 1000) * maxRate)
  return Math.max(1000, Math.min(cap, 500000)) // 1k ~ 500k
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/features/oscilloscope/useScopeData.ts
git commit -m "feat(oscilloscope): add useScopeData hook for direct serial subscription"
```

---

### Task 8: 在 store 中接入 dataClear 信号 + 预估内存工具

**Files:**
- Modify: `src/features/oscilloscope/store.ts`
- Create: `src/features/oscilloscope/memEstimate.ts`
- Test: `test/scope-store.test.ts`（追加用例）

- [ ] **Step 1: 写预估内存测试**

在 `test/scope-store.test.ts` 末尾追加：

```ts
import { estimateMemoryMB } from '../src/features/oscilloscope/memEstimate'

describe('memory estimate', () => {
  it('computes MB from duration, rate, channels (4 bytes/sample/channel)', () => {
    // 300s * 1000/s * 4ch * 4B = 4_800_000 B ≈ 4.58 MB
    expect(estimateMemoryMB({ sec: 300, rate: 1000, channels: 4 })).toBeCloseTo(4.58, 1)
  })

  it('handles low rate gracefully', () => {
    expect(estimateMemoryMB({ sec: 300, rate: 10, channels: 2 })).toBeCloseTo(0.023, 2)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/scope-store.test.ts`
Expected: FAIL，`estimateMemoryMB` 不存在

- [ ] **Step 3: 实现 memEstimate.ts**

创建 `src/features/oscilloscope/memEstimate.ts`：

```ts
/**
 * 预估环形缓冲内存占用：sec * rate * channels * 4 字节（Float32）。
 * 用于时间窗设置的诚实提示（动态显示当前配置预估占多少 MB）。
 */
export function estimateMemoryMB(opts: { sec: number; rate: number; channels: number }): number {
  const bytes = opts.sec * opts.rate * opts.channels * 4
  return bytes / (1024 * 1024)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/scope-store.test.ts`
Expected: PASS，全部用例通过

- [ ] **Step 5: 提交**

```bash
git add src/features/oscilloscope/memEstimate.ts test/scope-store.test.ts
git commit -m "feat(oscilloscope): add honest memory estimate for window-size hint"
```

---

## 阶段 4：UI 外壳

### Task 9: ScopeToolbar / ChannelLegend / WindowSizeSelect 子组件

**Files:**
- Create: `src/features/oscilloscope/components/ScopeToolbar.tsx`
- Create: `src/features/oscilloscope/components/ChannelLegend.tsx`
- Create: `src/features/oscilloscope/components/WindowSizeSelect.tsx`

- [ ] **Step 1: 实现 ScopeToolbar**

创建 `src/features/oscilloscope/components/ScopeToolbar.tsx`：

```tsx
import { Button } from '@/components/ui/button'
import { Pause, Play, ArrowsClockwise, Eraser } from '@phosphor-icons/react'

interface ScopeToolbarProps {
  paused: boolean
  live: boolean
  sampleRate: number
  onPause: () => void
  onResume: () => void
  onClear: () => void
  onBackToLive: () => void
}

export function ScopeToolbar(props: ScopeToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30">
      {props.paused ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onResume}>
          <Play size={14} weight="fill" /> 实时
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onPause}>
          <Pause size={14} weight="fill" /> 暂停
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onClear} title="清空">
        <Eraser size={14} /> 清空
      </Button>
      {!props.live && (
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onBackToLive}>
          <ArrowsClockwise size={14} /> 回到实时
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground font-mono">
        ~{props.sampleRate} pts/s
      </span>
    </div>
  )
}
```

- [ ] **Step 2: 实现 ChannelLegend**

创建 `src/features/oscilloscope/components/ChannelLegend.tsx`：

```tsx
import { readTheme } from '@/components/scope/theme'

interface ChannelLegendProps {
  /** 当前各通道最新值（NaN 表示无数据）；索引 0..N-1 */
  latest: number[]
  visible: boolean[]
  onToggle: (channelIndex: number) => void
}

export function ChannelLegend(props: ChannelLegendProps) {
  const theme = readTheme()
  return (
    <div className="flex items-center gap-3 px-2 py-1 border-t border-border bg-muted/30 flex-wrap">
      {props.latest.map((val, i) => {
        const color = theme.series[i % theme.series.length]
        const on = props.visible[i] ?? true
        return (
          <button
            key={i}
            className="flex items-center gap-1 text-xs font-mono cursor-pointer"
            style={{ opacity: on ? 1 : 0.4 }}
            onClick={() => props.onToggle(i)}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span>CH{i + 1}</span>
            <span className="font-bold text-foreground">
              {Number.isNaN(val) ? '—' : val.toFixed(2)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: 实现 WindowSizeSelect**

创建 `src/features/oscilloscope/components/WindowSizeSelect.tsx`：

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { estimateMemoryMB } from '../memEstimate'

interface WindowSizeSelectProps {
  windowSec: number
  sampleRate: number
  channelCount: number
  onChange: (sec: number) => void
}

const OPTIONS = [
  { label: '30秒', sec: 30 },
  { label: '1分钟', sec: 60 },
  { label: '5分钟', sec: 300 },
  { label: '10分钟', sec: 600 },
  { label: '30分钟', sec: 1800 }
]

export function WindowSizeSelect(props: WindowSizeSelectProps) {
  const mem = estimateMemoryMB({
    sec: props.windowSec,
    rate: Math.max(props.sampleRate, 1),
    channels: Math.max(props.channelCount, 1)
  })
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">时间窗</span>
      <Select value={String(props.windowSec)} onValueChange={(v) => props.onChange(Number(v))}>
        <SelectTrigger className="h-6 w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.sec} value={String(o.sec)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground" title="按当前采样率与通道数预估">
        ≈ {mem < 1 ? `${(mem * 1024).toFixed(0)} KB` : `${mem.toFixed(1)} MB`}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 无错误。若 Phosphor 图标名不存在，换成 `@phosphor-icons/react` 中已有的（如 `Pause`/`Play` 确实存在）。

- [ ] **Step 5: 提交**

```bash
git add src/features/oscilloscope/components/
git commit -m "feat(oscilloscope): add toolbar, channel legend, window-size select"
```

---

### Task 10: OscilloscopePane 浮动窗格外壳

**Files:**
- Create: `src/features/oscilloscope/OscilloscopePane.tsx`

- [ ] **Step 1: 实现外壳**

创建 `src/features/oscilloscope/OscilloscopePane.tsx`：

```tsx
import { useEffect, useRef, useState } from 'react'
import { TimeSeriesChart, type ScopeSeries } from '@/components/scope/TimeSeriesChart'
import { linearize } from '@/components/scope/ringBuffer'
import { useScopeData } from './useScopeData'
import { useOscilloscopeStore } from './store'
import { MAX_CHANNELS } from './parser'
import { ScopeToolbar } from './components/ScopeToolbar'
import { ChannelLegend } from './components/ChannelLegend'
import { WindowSizeSelect } from './components/WindowSizeSelect'

interface OscilloscopePaneProps {
  panelId: string
  title: string
}

/**
 * 示波器浮动窗格内容（不含拖拽/缩放外壳，外壳由父级浮动窗格提供）。
 * 也可作为独立窗口内容渲染。
 */
export function OscilloscopePane({ panelId, title }: OscilloscopePaneProps) {
  const cfg = useOscilloscopeStore((s) => s.panes[panelId])
  const windowSec = useOscilloscopeStore((s) => s.windowSec)
  const setPaused = useOscilloscopeStore((s) => s.setPaused)
  const setLive = useOscilloscopeStore((s) => s.setLive)
  const toggleChannelVisibility = useOscilloscopeStore((s) => s.toggleChannelVisibility)
  const setWindowSec = useOscilloscopeStore((s) => s.setWindowSec)

  const historyMs = windowSec * 1000
  const { buffer, dirty, clear, getSampleRate } = useScopeData(panelId, MAX_CHANNELS, historyMs)

  // 通道最新值 + 采样率：节流进 state（仅 UI 显示用）
  const [latest, setLatest] = useState<number[]>(Array(MAX_CHANNELS).fill(NaN))
  const [sampleRate, setSampleRate] = useState(0)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const lin = linearize(buffer.current)
      if (lin.count > 0) {
        const next = Array(MAX_CHANNELS).fill(NaN)
        for (let c = 0; c < lin.ch.length; c++) {
          next[c] = lin.ch[c][lin.count - 1]
        }
        setLatest(next)
      }
      setSampleRate(getSampleRate())
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [buffer, getSampleRate])

  if (!cfg) return null

  const series: ScopeSeries[] = Array.from({ length: MAX_CHANNELS }, (_, i) => ({
    label: `CH${i + 1}`,
    visible: cfg.channelVisible[i] ?? true
  }))

  return (
    <div className="flex flex-col h-full bg-background">
      <ScopeToolbar
        paused={cfg.paused}
        live={cfg.live}
        sampleRate={sampleRate}
        onPause={() => setPaused(panelId, true)}
        onResume={() => setPaused(panelId, false)}
        onClear={clear}
        onBackToLive={() => setLive(panelId, true)}
      />
      <div className="flex-1 min-h-0 p-1">
        <TimeSeriesChart
          series={series}
          buffer={buffer}
          dirty={dirty}
          live={cfg.live}
          windowSec={windowSec}
          channelCount={MAX_CHANNELS}
          onRangeChange={() => setLive(panelId, false)}
        />
      </div>
      <ChannelLegend
        latest={latest}
        visible={cfg.channelVisible}
        onToggle={(i) => toggleChannelVisibility(panelId, i)}
      />
      <div className="flex items-center justify-between px-2 py-1 border-t border-border bg-muted/30">
        <WindowSizeSelect
          windowSec={windowSec}
          sampleRate={sampleRate}
          channelCount={MAX_CHANNELS}
          onChange={setWindowSec}
        />
        <span className="text-xs text-muted-foreground font-mono">{title}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/features/oscilloscope/OscilloscopePane.tsx
git commit -m "feat(oscilloscope): add OscilloscopePane shell composing chart + toolbar + legend"
```

---

### Task 11: OscilloscopeFloatingWindow（拖拽/缩放外壳）

**Files:**
- Create: `src/features/oscilloscope/OscilloscopeFloatingWindow.tsx`

- [ ] **Step 1: 实现拖拽缩放外壳（复用 usePaneInteraction）**

创建 `src/features/oscilloscope/OscilloscopeFloatingWindow.tsx`：

```tsx
import { useRef, useState } from 'react'
import { usePaneDrag, usePaneResize, RESIZE_HANDLES } from '@/features/serial-panel/usePaneInteraction'
import { useOscilloscopeStore } from './store'
import { OscilloscopePane } from './OscilloscopePane'
import { PushPin, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface Geometry {
  x: number
  y: number
  w: number
  h: number
}

interface OscilloscopeFloatingWindowProps {
  panelId: string
  title: string
  containerRef: React.RefObject<HTMLDivElement | null>
  initialGeometry?: Geometry
}

/**
 * 示波器浮动窗格。复用 serial-panel 的 usePaneDrag/usePaneResize（原生 pointer，React 19 兼容）。
 * 几何状态本地维护（示波器几何不持久化到 panels.json，与串口面板不同）。
 */
export function OscilloscopeFloatingWindow(props: OscilloscopeFloatingWindowProps) {
  const closePane = useOscilloscopeStore((s) => s.closePane)
  const setActive = useOscilloscopeStore((s) => s.openPane)
  const [geo, setGeo] = useState<Geometry>(props.initialGeometry ?? { x: 60, y: 60, w: 640, h: 380 })
  const paneRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  usePaneDrag(headerRef, paneRef, props.containerRef, () => setActive(props.panelId), (x, y) =>
    setGeo((g) => ({ ...g, x, y }))
  )
  usePaneResize(paneRef, props.containerRef, (next) => setGeo(next))

  return (
    <div
      ref={paneRef}
      className="absolute bg-background border border-border rounded-md shadow-xl flex flex-col"
      style={{ left: geo.x, top: geo.y, width: geo.w, height: geo.h, zIndex: 1000 }}
      onPointerDown={() => setActive(props.panelId)}
    >
      <div
        ref={headerRef}
        className="flex items-center justify-between px-2 py-1 border-b border-border cursor-move select-none bg-muted/40"
      >
        <span className="text-xs font-medium">示波器 · {props.title}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" title="置顶（暂用主窗 pin）">
            <PushPin size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => closePane(props.panelId)}>
            <X size={14} />
          </Button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <OscilloscopePane panelId={props.panelId} title={props.title} />
      </div>
      {RESIZE_HANDLES.map((dir) => (
        <div key={dir} data-resize-handle={dir} className={`resize-handle resize-${dir}`} />
      ))}
    </div>
  )
}
```

> 注：`RESIZE_HANDLES` 与 `usePaneResize` 的协作依赖 serial-panel 的实现细节。若 `usePaneResize` 通过 `data-resize-handle` 属性定位手柄（需在实现时核对 `usePaneInteraction.ts`），手柄 div 加对应 class（在 `scope.css` 或 `main-window.css` 中定义 `.resize-handle` 的定位样式）。如签名不符，改为直接用 `react-rnd`（仓库已安装）渲染窗格外壳，内部仍用 `OscilloscopePane`。**实现此任务前先读 `src/features/serial-panel/usePaneInteraction.ts` 确认 `usePaneResize` 的手柄约定。**

- [ ] **Step 2: typecheck + 核对 usePaneResize 手柄约定**

Run:
```bash
npm run typecheck
```
并阅读 `src/features/serial-panel/usePaneInteraction.ts` 的 `usePaneResize` 实现与 `RESIZE_HANDLES` 导出，确认手柄 DOM 约定。若不符，切换到 react-rnd 方案。

Expected: 无类型错误；手柄机制已确认。

- [ ] **Step 3: 提交**

```bash
git add src/features/oscilloscope/OscilloscopeFloatingWindow.tsx
git commit -m "feat(oscilloscope): add draggable/resizable floating window shell"
```

---

## 阶段 5：接入主面板

### Task 12: feature flag + 挂载 + 按钮接入

**Files:**
- Modify: `src/shared/store/flags.ts`
- Modify: `src/features/serial-panel/components/SerialPanelWorkspace.tsx`
- Modify: `src/features/main-window/components/ActivePanelConfigPanel.tsx:215`

- [ ] **Step 1: 加 feature flag**

修改 `src/shared/store/flags.ts`，在 interface 与初始值中加：

```ts
interface FlagsState {
  /** Phase 1 完成后开启：脚本编辑器走 React+Rete */
  useReactScriptEditor: boolean
  /** Phase 2 完成后开启：串口面板走 React */
  useReactPanels: boolean
  /** 示波器走 React（新高性能组件） */
  useReactOscilloscope: boolean
  /** Phase 3+ 后续 */
  useReactCommands: boolean
  useReactSettings: boolean
  setFlag: (key: keyof Omit<FlagsState, 'setFlag'>, value: boolean) => void
}

export const useFlags = create<FlagsState>((set) => ({
  useReactScriptEditor: true,
  useReactPanels: false,
  useReactOscilloscope: true, // 新示波器默认开启
  useReactCommands: false,
  useReactSettings: false,
  setFlag: (key, value) => set({ [key]: value } as Partial<FlagsState>)
}))
```

- [ ] **Step 2: 接入 ActivePanelConfigPanel 按钮**

修改 `src/features/main-window/components/ActivePanelConfigPanel.tsx:215`，把：

```tsx
<Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => appendSysLine(pnl.id, '[系统] 示波器暂未迁移')}>示波器</Button>
```

改为：

```tsx
<Button
  variant="ghost"
  size="sm"
  className="h-6 px-2"
  onClick={() => useOscilloscopeStore.getState().openPane(pnl.id)}
>
  示波器
</Button>
```

并在文件顶部 import：

```tsx
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
```

- [ ] **Step 3: 挂载浮动窗格到 SerialPanelWorkspace**

先读 `src/features/serial-panel/components/SerialPanelWorkspace.tsx`，找到浮动窗格渲染处（约 55-66 行）。在其 `containerRef` 容器内、与 `FloatingPane` 并列，渲染所有打开的示波器窗格：

```tsx
import { useFlags } from '@/shared/store/flags'
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
import { OscilloscopeFloatingWindow } from '@/features/oscilloscope/OscilloscopeFloatingWindow'
```

在渲染区（`containerRef` 指向的容器内）：

```tsx
{useFlags((s) => s.useReactOscilloscope) &&
  Object.entries(useOscilloscopeStore((s) => s.panes)).map(([id, cfg]) => (
    <OscilloscopeFloatingWindow
      key={id}
      panelId={id}
      title={cfg.panelId}
      containerRef={containerRef}
    />
  ))}
```

> 实际接入时需核对 `SerialPanelWorkspace` 现有结构与 `containerRef` 命名，确保示波器窗格挂在工作区同一 relative 容器内（绝对定位依赖）。

- [ ] **Step 4: typecheck + test**

Run: `npm run typecheck && npm test`
Expected: 无错误，全部测试通过

- [ ] **Step 5: 手动验证（记录到 PR）**

Run: `npm run dev`
手动验证：
1. 打开一个串口面板，点"示波器"按钮 → 浮动窗格出现
2. 设备发送数字（如 `1,2,3\r\n`）→ 多通道曲线实时绘制
3. 滚轮/框选缩放、拖动平移 → 视图脱离右沿（live=false），"回到实时"按钮出现
4. 点暂停 → 视图冻结，但数据继续采集；恢复后曲线连续无空洞
5. 切换主窗深/浅色 → 示波器自动跟随，无闪烁
6. 时间窗下拉 → 预估内存数值变化

- [ ] **Step 6: 提交**

```bash
git add src/shared/store/flags.ts src/features/serial-panel/components/SerialPanelWorkspace.tsx src/features/main-window/components/ActivePanelConfigPanel.tsx
git commit -m "feat(oscilloscope): wire React oscilloscope into main panel behind flag"
```

---

## 阶段 6：清理老示波器死代码

### Task 13: 移除老示波器（迁移验证通过后）

> **前置条件**：Task 12 手动验证全部通过，且团队确认可下线老示波器。此任务可在新示波器稳定运行一段时间后单独执行。

**Files:**
- Modify: `renderer.js`（移除 `openWaveWindow` / `feedWaveData` / `SerialWave` 相关，约 3991-4185 行；移除 `btnShowWave` 接线 4156-4158；移除右键菜单项 4917-4919；移除 onData 中的 `feedWaveData` 调用 2818/2877）
- Modify: `src/index.html:78`（移除 `<button id="btnShowWave">示波器</button>`）
- Modify: `electron/main.ts:1557-1589`（移除 `window:set-oscilloscope-top` handler 与 `SerialWave` setWindowOpenHandler 分支）
- Modify: `electron/preload.ts:34`（移除 `setOscilloscopeTop`）
- Modify: `shared/types.ts:210`（移除 `setOscilloscopeTop` 类型声明）

- [ ] **Step 1: 确认新示波器无依赖老代码**

Run: `grep -rn "SerialWave\|feedWaveData\|openWaveWindow\|btnShowWave\|setOscilloscopeTop" src/ electron/ shared/`
Expected: 仅命中即将删除的老代码自身，新代码（`src/features/oscilloscope/`、`src/components/scope/`）不引用这些符号。

- [ ] **Step 2: 逐个删除老代码块**

按上面 Files 列表，逐文件移除相关代码。每改一个文件后运行 `npm run typecheck` 确认未引入类型错误。

- [ ] **Step 3: 全量验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通过

- [ ] **Step 4: 手动验证无回归**

Run: `npm run dev`
确认：串口面板正常、文本总线正常、新示波器正常、无控制台报错。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor(oscilloscope): remove legacy Canvas oscilloscope + setOscilloscopeTop IPC

Migrated to React high-performance scope. Removes openWaveWindow/SerialWave
popout, feedWaveData, btnShowWave, and the dedicated always-on-top IPC
(the new floating pane reuses the existing pin mechanism)."
```

---

## 完成验收标准

- [ ] 所有单测通过：`npm test`
- [ ] 类型检查通过：`npm run typecheck`
- [ ] 构建通过：`npm run build`
- [ ] 手动验证清单（Task 12 Step 5）全部通过
- [ ] 设计规格的 8 条决策全部实现并有对应代码
- [ ] 老示波器死代码已清理（Task 13）或明确标记"延迟清理"

## 风险提示

1. **uPlot 类型路径**：Task 4/5 若 `import UPlot from 'uplot'` 类型解析失败，查阅 `node_modules/uplot/dist/` 的 d.ts，可能需 `import UPlot from 'uplot/dist/uPlot.cjs'`。
2. **usePaneResize 手柄约定**：Task 11 实现前必须读 `usePaneInteraction.ts` 确认手柄 DOM 约定，否则改用 react-rnd。
3. **oklch canvas 兼容**：Electron Chromium 原生支持，若异常在 `theme.ts` 单点转 rgb。
4. **高采样率内存**：`estimateCapacity` 已设 500k 上限，极端情况（>100k/s × 5min）会触发裁剪而非 OOM。
