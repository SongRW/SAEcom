import { useShallow } from 'zustand/react/shallow'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleRow } from '@/features/settings/ToggleRow'
import { useSettingsStore } from '@/shared/store/settings'
import { SUPPORTED_LOCALES, type SupportedLocale } from '@/shared/i18n'
import i18n from '@/shared/i18n'

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20]

/** 外观分区:夜间模式 + 字体大小(写 --font-size-base 到 <html>) + 界面语言。 */
export function AppearanceSection() {
  const { t } = useTranslation()
  const { dark, fontSize, longCommandThreshold, locale } = useSettingsStore(
    useShallow((s) => ({
      dark: s.dark,
      fontSize: s.fontSize,
      longCommandThreshold: s.longCommandThreshold,
      locale: s.locale
    }))
  )
  const setField = useSettingsStore((s) => s.setField)

  /** 切换语言：写持久化 + 即时切换 i18n */
  function changeLocale(v: string) {
    setField('locale', v)
    i18n.changeLanguage(v)
  }

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">{t('settings.appearance.title')}</h3>
      <p className="text-xs text-muted-foreground mb-2">{t('settings.appearance.subtitle')}</p>
      <ToggleRow id="dark" label={t('settings.appearance.darkMode')} checked={dark} onCheckedChange={(v) => setField('dark', v)} />

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="fontSize" className="text-sm font-normal">
          {t('settings.appearance.fontSize')}
        </Label>
        <Select value={String(fontSize)} onValueChange={(v) => setField('fontSize', Number(v))}>
          <SelectTrigger id="fontSize" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="longCommandThreshold" className="text-sm font-normal">
          {t('settings.appearance.longCommandThreshold')}
        </Label>
        <Input
          id="longCommandThreshold"
          type="number"
          min={1}
          value={longCommandThreshold}
          onChange={(e) => setField('longCommandThreshold', Math.max(1, Number(e.target.value) || 1))}
          className="w-24"
        />
      </div>

      <div className="flex items-center justify-between py-2">
        <Label htmlFor="locale" className="text-sm font-normal">
          {t('settings.appearance.language')}
        </Label>
        <Select value={locale} onValueChange={changeLocale}>
          <SelectTrigger id="locale" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((l: SupportedLocale) => (
              <SelectItem key={l} value={l}>
                {t(`settings.language.${l}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
