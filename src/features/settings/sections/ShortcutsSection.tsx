import { useTranslation } from 'react-i18next'
import { SHORTCUTS, isMac, getDisplayCombo } from '@/features/settings/shortcuts'

/** 快捷键分区:只读清单(按平台展示组合键)。 */
export function ShortcutsSection() {
  const { t } = useTranslation()
  const mac = isMac()
  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">{t('settings.shortcuts.title')}</h3>
      <p className="text-xs text-muted-foreground mb-2">{t('settings.shortcuts.subtitle')}</p>
      <dl className="text-sm">
        {SHORTCUTS.map((s) => (
          <div key={s.id} className="flex justify-between py-2 border-b border-border/50">
            <dt className="text-muted-foreground">{t(`settings.shortcuts.item.${s.id}`)}</dt>
            <dd className="font-mono">{getDisplayCombo(s, mac)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
