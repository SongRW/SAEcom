import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/utils'
import { SlidersHorizontal, Palette, Plugs, Keyboard, Sparkle, Info } from '@phosphor-icons/react'

/** 设置分区 id(导航与内容区共用)。 */
export type SettingsSection = 'general' | 'appearance' | 'serial' | 'shortcuts' | 'agent' | 'about'

/** 每个分区的图标（zcode/codex 式：图标 + 文字导航）。 */
const NAV_ICONS: Record<SettingsSection, React.ReactNode> = {
  general: <SlidersHorizontal size={16} weight="duotone" />,
  appearance: <Palette size={16} weight="duotone" />,
  serial: <Plugs size={16} weight="duotone" />,
  shortcuts: <Keyboard size={16} weight="duotone" />,
  agent: <Sparkle size={16} weight="duotone" />,
  about: <Info size={16} weight="duotone" />
}

const NAV_ITEMS: SettingsSection[] = ['general', 'appearance', 'serial', 'shortcuts', 'agent', 'about']

interface SettingsNavProps {
  active: SettingsSection
  onChange: (id: SettingsSection) => void
}

/** 左侧导航:6 个分区（图标 + 文字，zcode/codex 式），点击切换,当前项高亮。 */
export function SettingsNav({ active, onChange }: SettingsNavProps) {
  const { t } = useTranslation()
  return (
    <nav className="flex w-44 flex-col gap-1 border-r border-border/50 p-2">
      {NAV_ITEMS.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          data-testid={`settings-nav-${item}`}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
            active === item
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
        >
          {NAV_ICONS[item]}
          <span>{t(`settings.nav.${item}`)}</span>
        </button>
      ))}
    </nav>
  )
}
