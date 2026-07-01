import { useEffect, useRef } from 'react'
import UPlot from 'uplot'
import type { Options, AlignedData } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { readTheme, buildSeriesStyles, type ScopeTheme } from '@/features/oscilloscope/components/theme'
import type { RingBuffer } from '@/features/oscilloscope/components/ringBuffer'
import { linearize } from '@/features/oscilloscope/components/ringBuffer'
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
  /** 视图脱离右沿时回调（用户拖动/缩放后） */
  onRangeChange?: (range: [number, number]) => void
  className?: string
}

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { series, buffer, dirty, live, windowSec, channelCount, onRangeChange } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<UPlot | null>(null)
  const themeRef = useRef<ScopeTheme>(readTheme())
  const liveRef = useRef(live)
  const windowSecRef = useRef(windowSec)
  /** 我们最近一次程序性 setScale 设置的目标范围（秒）。用于区分用户拖拽与自动滚动 */
  const autoScaleRef = useRef<{ min: number; max: number } | null>(null)
  liveRef.current = live
  windowSecRef.current = windowSec

  // 建实例 + 销毁（仅在通道数变化时重建）
  useEffect(() => {
    if (!containerRef.current) return
    const theme = themeRef.current
    const styles = buildSeriesStyles(theme, channelCount)

    const opts: Options = {
      width: containerRef.current.clientWidth || 600,
      height: containerRef.current.clientHeight || 200,
      ms: 1e-3, // 我们喂入的 X 值单位是秒（setData 前已 ms/1000）
      series: [
        {}, // X 轴（时间）
        ...Array.from({ length: channelCount }, (_, i) => ({
          label: `CH${i + 1}`,
          stroke: styles[i].stroke,
          width: styles[i].width,
          dash: styles[i].dash,
          // 初始可见性由下方的 visibility effect 接管（按 React effect 执行顺序在 build 之后运行）
          spanGaps: true
        }))
      ],
      axes: [
        { stroke: theme.text, grid: { stroke: theme.grid, width: 1 } },
        { stroke: theme.text, grid: { stroke: theme.grid, width: 1 } }
      ],
      scales: { x: { time: true }, y: { auto: true } },
      // 框选缩放；setScale:true 让用户拖拽/滚轮缩放自动改刻度
      cursor: { drag: { x: true, y: true, setScale: true } },
      // 用户拖动/缩放导致 setScale 时脱离实时。
      // 注意：我们自己的 live-tail 也会调用 setScale，必须排除，否则会
      // 形成"自动滚动→onRangeChange→setLive(false)"反馈环，实时尾立刻失效。
      // 用 autoScaleRef 记录我们刚设置的目标范围，与之匹配则视为程序性、不触发回调。
      hooks: {
        setScale: [
          (self) => {
            const sc = self.scales.x
            if (!sc || sc.min == null || sc.max == null || !onRangeChange) return
            const expected = autoScaleRef.current
            if (expected && Math.abs(sc.min - expected.min) < 1e-6 && Math.abs(sc.max - expected.max) < 1e-6) {
              return // 程序性 live-tail 触发的，忽略
            }
            autoScaleRef.current = null
            onRangeChange([sc.min, sc.max])
          }
        ]
      }
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

  // rAF 节流渲染循环：脏才 setData，避免空转
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const plot = plotRef.current
      if (!plot) return
      if (dirty.current) {
        dirty.current = false
        const lin = linearize(buffer.current)
        if (lin.count === 0) return
        const data: AlignedData = [
          Array.from(lin.ts, (t) => t / 1000), // ms → s
          ...lin.ch.map((c) => Array.from(c))
        ]
        plot.setData(data, false)
        if (liveRef.current && lin.count > 1) {
          const tEnd = lin.ts[lin.count - 1] / 1000
          const min = tEnd - windowSecRef.current
          const max = tEnd
          // 记录程序性目标范围，setScale hook 会据此跳过 onRangeChange
          autoScaleRef.current = { min, max }
          plot.setScale('x', { min, max })
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [buffer, dirty])

  // 主题跟随（MutationObserver 监听 <html> class，主窗切 .dark 时触发）
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
      plot.setSeries(i + 1, { show: s.visible })
    })
  }, [series])

  return <div ref={containerRef} className={`scope-chart-container ${props.className ?? ''}`} />
}
