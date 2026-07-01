import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { estimateMemoryMB } from '@/features/oscilloscope/memEstimate'

interface WindowSizeSelectProps {
  windowSec: number
  sampleRate: number
  channelCount: number
  onChange: (sec: number) => void
}

const OPTIONS = [
  { key: '30s', sec: 30 },
  { key: '1m', sec: 60 },
  { key: '5m', sec: 300 },
  { key: '10m', sec: 600 },
  { key: '30m', sec: 1800 }
]

export function WindowSizeSelect(props: WindowSizeSelectProps) {
  const { t } = useTranslation()
  const mem = estimateMemoryMB({
    sec: props.windowSec,
    rate: Math.max(props.sampleRate, 1),
    channels: Math.max(props.channelCount, 1)
  })
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{t('oscilloscope.windowLabel')}</span>
      <Select value={String(props.windowSec)} onValueChange={(v) => props.onChange(Number(v))}>
        <SelectTrigger className="h-6 w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.sec} value={String(o.sec)}>
              {t(`oscilloscope.window.${o.key}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground" title={t('oscilloscope.estimateHint')}>
        ≈ {mem < 1 ? `${(mem * 1024).toFixed(0)} KB` : `${mem.toFixed(1)} MB`}
      </span>
    </div>
  )
}
