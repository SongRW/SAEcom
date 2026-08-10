import { GeneralSection } from '@/features/settings/sections/GeneralSection'
import { AppearanceSection } from '@/features/settings/sections/AppearanceSection'
import { SerialSection } from '@/features/settings/sections/SerialSection'
import { ShortcutsSection } from '@/features/settings/sections/ShortcutsSection'
import { AgentSection } from '@/features/settings/sections/AgentSection'
import { AboutSection } from '@/features/settings/sections/AboutSection'
import type { SettingsSection } from '@/features/settings/SettingsNav'

interface SettingsContentProps {
  section: SettingsSection
}

/** 右侧内容区:按当前分区渲染对应组件。 */
export function SettingsContent({ section }: SettingsContentProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      {section === 'general' && <GeneralSection />}
      {section === 'appearance' && <AppearanceSection />}
      {section === 'serial' && <SerialSection />}
      {section === 'shortcuts' && <ShortcutsSection />}
      {section === 'agent' && <AgentSection />}
      {section === 'about' && <AboutSection />}
    </div>
  )
}
