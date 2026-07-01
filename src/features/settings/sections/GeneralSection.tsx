import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ToggleRow } from '@/features/settings/ToggleRow'
import { useSettingsStore, type SettingKey } from '@/shared/store/settings'

/** 通用分区:全屏 / 清除确认 / 删除确认 + 重置全部为默认。 */
export function GeneralSection() {
  const { t } = useTranslation()
  const { fullscreen, confirmClear, confirmDelete } = useSettingsStore(
    useShallow((s) => ({
      fullscreen: s.fullscreen,
      confirmClear: s.confirmClear,
      confirmDelete: s.confirmDelete
    }))
  )
  const setField = useSettingsStore((s) => s.setField)
  const reset = useSettingsStore((s) => s.reset)
  const toggle = (key: SettingKey) => (v: boolean) => setField(key, v)

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">{t('settings.general.title')}</h3>
      <p className="text-xs text-muted-foreground mb-2">{t('settings.general.subtitle')}</p>
      <ToggleRow id="fullscreen" label={t('settings.general.fullscreen')} checked={fullscreen} onCheckedChange={toggle('fullscreen')} />
      <ToggleRow id="confirmClear" label={t('settings.general.confirmClear')} checked={confirmClear} onCheckedChange={toggle('confirmClear')} />
      <ToggleRow id="confirmDelete" label={t('settings.general.confirmDelete')} checked={confirmDelete} onCheckedChange={toggle('confirmDelete')} />
      <div className="mt-4 flex justify-end">
        <Button variant="destructive" size="sm" onClick={() => reset()}>
          {t('settings.general.resetAll')}
        </Button>
      </div>
    </div>
  )
}
