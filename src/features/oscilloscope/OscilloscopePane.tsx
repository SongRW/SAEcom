import { useEffect, useRef, useState } from 'react'
import { TimeSeriesChart, type ScopeSeries } from '@/features/oscilloscope/components/TimeSeriesChart'
import { peekLatest } from '@/features/oscilloscope/components/ringBuffer'
import { useScopeData } from '@/features/oscilloscope/useScopeData'
import { useOscilloscopeStore } from '@/features/oscilloscope/store'
import { MAX_CHANNELS } from '@/features/oscilloscope/parser'
import { ScopeToolbar } from '@/features/oscilloscope/components/ScopeToolbar'
import { ChannelLegend } from '@/features/oscilloscope/components/ChannelLegend'
import { WindowSizeSelect } from '@/features/oscilloscope/components/WindowSizeSelect'

interface OscilloscopePaneProps {
  panelId: string
  title: string
}

/**
 * 示波器浮动窗格内容（不含拖拽/缩放外壳，外壳由 OscilloscopeFloatingWindow 提供）。
 * 组装：工具栏 + TimeSeriesChart + 通道图例 + 时间窗选择。
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

  // 通道最新值 + 采样率：节流进 state（仅 UI 显示用，约 10fps，避免每帧重渲染）
  const [latest, setLatest] = useState<number[]>(Array(MAX_CHANNELS).fill(NaN))
  const [sampleRate, setSampleRate] = useState(0)
  const lastUiTick = useRef(0)
  useEffect(() => {
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - lastUiTick.current < 100) return // ~10fps 节流
      lastUiTick.current = t
      const latestFrame = peekLatest(buffer.current)
      if (latestFrame) {
        const next = Array(MAX_CHANNELS).fill(NaN)
        for (let c = 0; c < latestFrame.vals.length; c++) {
          next[c] = latestFrame.vals[c]
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
