import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'

/** 设置分区 id(导航与内容区共用)。 */
export type SettingsSection = 'general' | 'appearance' | 'serial' | 'shortcuts' | 'about'

const NAV_ITEMS: SettingsSection[] = ['general', 'appearance', 'serial', 'shortcuts', 'about']

interface SettingsNavProps {
  active: SettingsSection
  onChange: (id: SettingsSection) => void
}

/** 左侧导航:5 个分区,点击切换,当前项高亮。 */
export function SettingsNav({ active, onChange }: SettingsNavProps) {
  const { t } = useTranslation()
  return (
    <nav className="flex w-40 flex-col gap-1 border-r border-border/50 p-2">
      {NAV_ITEMS.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={cn(
            'rounded-md px-3 py-2 text-left text-sm transition-colors',
            active === item
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
        >
          {t(`settings.nav.${item}`)}
        </button>
      ))}
    </nav>
  )
}
