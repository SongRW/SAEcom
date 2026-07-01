import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30">
      {props.paused ? (
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onResume}>
          <Play size={14} weight="fill" /> {t('oscilloscope.realtime')}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onPause}>
          <Pause size={14} weight="fill" /> {t('oscilloscope.pause')}
        </Button>
      )}
      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onClear} title={t('oscilloscope.clear')}>
        <Eraser size={14} /> {t('oscilloscope.clear')}
      </Button>
      {!props.live && (
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1" onClick={props.onBackToLive}>
          <ArrowsClockwise size={14} /> {t('oscilloscope.backToRealtime')}
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground font-mono">
        ~{props.sampleRate} {t('oscilloscope.rateUnit')}
      </span>
    </div>
  )
}
