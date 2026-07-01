import { describe, expect, it } from 'vitest'
import { createRingBuffer, pushSample, linearize, clearBuffer, trimOlderThan, peekLatest } from '../src/features/oscilloscope/components/ringBuffer'

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
    // 保留最近 t >= 3000
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

  it('trims correctly after wrap-around (capacity < pushed count)', () => {
    // 容量 3，推 5 个（已环绕 2 圈），再裁剪
    const rb = createRingBuffer({ capacity: 3, channels: 1 })
    for (let i = 0; i < 5; i++) pushSample(rb, i * 1000, [i + 1]) // ts 0..4000, val 1..5
    // 当前缓冲仅保留最近 3 个：ts [2000,3000,4000] val [3,4,5]
    const dropped = trimOlderThan(rb, 3000) // 丢 ts<3000
    expect(dropped).toBe(1)
    const out = linearize(rb)
    expect(out.ts).toEqual(new Float64Array([3000, 4000]))
    expect(out.ch).toEqual([new Float32Array([4, 5])])
  })

  it('linearize returns new arrays (does not alias the live buffer)', () => {
    const rb = createRingBuffer({ capacity: 3, channels: 1 })
    pushSample(rb, 1, [10])
    const out = linearize(rb)
    out.ts[0] = 999
    out.ch[0][0] = 999
    // 改输出不应影响内部缓冲
    const out2 = linearize(rb)
    expect(out2.ts[0]).toBe(1)
    expect(out2.ch[0][0]).toBe(10)
  })

  it('trimOlderThan is a no-op on empty buffer', () => {
    const rb = createRingBuffer({ capacity: 3, channels: 1 })
    expect(trimOlderThan(rb, 1000)).toBe(0)
    expect(rb.count).toBe(0)
  })

  it('trimOlderThan advances in-place: head index and the newest value stay put', () => {
    // O(1) trim 契约：裁剪只向前移动逻辑起点（count 减少），不搬动任何样本。
    // 判据：trim 前后 head 索引不变，最新帧（head 处）原值仍在。
    const rb = createRingBuffer({ capacity: 8, channels: 1 })
    for (let i = 0; i < 8; i++) pushSample(rb, i * 1000, [i + 1]) // ts 0..7000, val 1..8
    const headBefore = rb.head
    const newestBefore = rb.ch[0][headBefore]
    const dropped = trimOlderThan(rb, 3000) // 丢 ts<3000（0,1000,2000）= 3 个
    expect(dropped).toBe(3)
    expect(rb.count).toBe(5)
    // 关键：head 没动，最新样本仍在原位置
    expect(rb.head).toBe(headBefore)
    expect(rb.ch[0][rb.head]).toBe(newestBefore)
    // 线性化仍然给出正确顺序
    const out = linearize(rb)
    expect(out.ts).toEqual(new Float64Array([3000, 4000, 5000, 6000, 7000]))
    expect(out.ch).toEqual([new Float32Array([4, 5, 6, 7, 8])])
  })

  it('trimOlderThan after wrap-around keeps head index and wraps correctly', () => {
    // 容量 4，推 6 个（环绕 1 圈半），丢掉最旧的若干，验证 head 不搬移
    const rb = createRingBuffer({ capacity: 4, channels: 1 })
    for (let i = 0; i < 6; i++) pushSample(rb, i * 1000, [i + 1]) // ts 0..5000, val 1..6
    // 缓冲保留最近 4 个：ts 2000..5000，head 指向 val 6
    const headBefore = rb.head
    const dropped = trimOlderThan(rb, 4000) // 丢 ts<4000（2000,3000）= 2 个
    expect(dropped).toBe(2)
    expect(rb.head).toBe(headBefore)
    const out = linearize(rb)
    expect(out.ts).toEqual(new Float64Array([4000, 5000]))
    expect(out.ch).toEqual([new Float32Array([5, 6])])
  })

  it('peekLatest returns the newest frame in O(1) without copying', () => {
    const rb = createRingBuffer({ capacity: 3, channels: 2 })
    expect(peekLatest(rb)).toBeNull()
    pushSample(rb, 1000, [10, 20])
    pushSample(rb, 2000, [11, 21])
    const latest = peekLatest(rb)
    expect(latest).toEqual({ ts: 2000, vals: [11, 21] })
  })

  it('peekLatest returns newest after wrap-around', () => {
    const rb = createRingBuffer({ capacity: 2, channels: 1 })
    pushSample(rb, 1, [10])
    pushSample(rb, 2, [20])
    pushSample(rb, 3, [30]) // wrap, drop oldest
    const latest = peekLatest(rb)
    expect(latest).toEqual({ ts: 3, vals: [30] })
  })
})
