import { useEffect, useRef } from 'react'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import {
  createRingBuffer,
  pushSample,
  trimOlderThan,
  clearBuffer,
  linearize,
  type RingBuffer
} from '@/features/oscilloscope/components/ringBuffer'
import { parseChunk } from '@/features/oscilloscope/parser'

/**
 * 订阅指定面板的串口数据 → 解析 → 入环形缓冲。仿 src/panel.tsx:85-112 直连监听模式。
 * 关键：原始字节不进 React state，全部在 ref 里；采集在任何视图状态下都不停
 * （暂停/回溯只冻结视图，不丢数据——与老示波器不同，是有意改进）。
 *
 * @param panelId 要监听的面板 id
 * @param channelCount 通道数
 * @param historyMs 历史缓冲时长（毫秒），用于按时间上限裁剪
 * @returns { buffer, dirty, clear, getSampleRate } —— buffer/dirty 是 ref，clear 清空
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

  // historyMs 变化（用户改时间窗）时，按新容量重建缓冲，保留已采集数据。
  // 否则窗口放大后容量不够，会静默丢数据。
  useEffect(() => {
    const newCap = estimateCapacity(historyMs)
    const cur = buffer.current
    if (newCap === cur.cap) return
    const next = createRingBuffer({ capacity: newCap, channels: cur.ch.length })
    const lin = linearize(cur)
    for (let i = 0; i < lin.count; i++) {
      const vals = lin.ch.map((c) => c[i])
      pushSample(next, lin.ts[i], vals)
    }
    buffer.current = next
    dirty.current = true
  }, [historyMs])

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
      // 吞吐量统计（每 500ms 更新一次）
      const acc = rateAccum.current
      acc.count += sets.length
      const elapsed = performance.now() - acc.t0
      if (elapsed >= 500) {
        sampleRate.current = Math.round((acc.count * 1000) / elapsed)
        acc.count = 0
        acc.t0 = performance.now()
      }
    }
    const offSerial = ipc.serial.onData(onData)
    const offTcp = ipc.tcp?.onData(onData)
    // 卸载时移除监听，避免每次挂载累积 serial:data/tcp:data 监听（CPU+内存泄漏）
    return () => {
      offSerial()
      offTcp?.()
    }
  }, [ipc, panelId])

  const clear = () => {
    clearBuffer(buffer.current)
    dirty.current = true
  }

  return { buffer, dirty, clear, getSampleRate: () => sampleRate.current }
}

/** 估算环形缓冲容量：历史时长 × 假设最大采样率（保守 1000/s），设下限。 */
export function estimateCapacity(historyMs: number): number {
  const maxRate = 1000 // pts/s 保守估计
  const cap = Math.ceil((historyMs / 1000) * maxRate)
  return Math.max(1000, Math.min(cap, 500000)) // 1k ~ 500k
}
