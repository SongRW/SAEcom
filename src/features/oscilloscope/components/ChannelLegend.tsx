import { readTheme } from '@/features/oscilloscope/components/theme'

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
