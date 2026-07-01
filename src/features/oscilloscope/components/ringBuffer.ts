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

/** O(1) 读取最新一帧（旧→新的最后一个）。count=0 返回 null。仅供 UI 显示用，不拷贝。 */
export function peekLatest(rb: RingBuffer): { ts: number; vals: number[] } | null {
  if (rb.count === 0) return null
  const idx = rb.head
  return {
    ts: rb.ts[idx],
    vals: rb.ch.map((c) => c[idx])
  }
}

/**
 * 丢弃时间戳早于 minTs 的样本（按时间窗上限裁剪）。
 * 返回丢弃的样本数。
 *
 * O(1) 原地裁剪：head 不动，仅从最旧端向前推进 count。
 * 旧实现把保留段整段拷贝重写到缓冲前部（O(n)），在每帧数据都触发 trim 时
 * 是真实热点（见 useScopeData：每个数据块都 trimOlderThan）。改为只减 count。
 *
 * 假设：缓冲内时间戳按 old→new 单调非递减（实时采集的固有性质）。
 * 遇到第一个 ts >= minTs 即停止扫描，因此乱序时间戳会漏删。
 */
export function trimOlderThan(rb: RingBuffer, minTs: number): number {
  if (rb.count === 0) return 0
  const { head, cap, count, ts } = rb
  // 最旧样本的物理索引
  const oldest = (head - (count - 1) + cap) % cap
  let drop = 0
  while (drop < count) {
    const idx = (oldest + drop) % cap
    if (ts[idx] < minTs) drop++
    else break
  }
  if (drop > 0) rb.count = count - drop
  return drop
}
