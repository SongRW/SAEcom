import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SettingsNav, type SettingsSection } from '@/features/settings/SettingsNav'
import { SettingsContent } from '@/features/settings/SettingsContent'
import './settings-page.css'

/**
 * 设置页（主界面功能区页面，zcode/codex 式布局，非弹窗非独立窗）。
 * 左导航（图标+文字分区）+ 右内容区；AI 与 Agent（模型 provider 管理）是其一个分区。
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const [section, setSection] = useState<SettingsSection>('general')

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="settings-page__header">
        <span className="settings-page__title">{t('settings.dialog.title')}</span>
        <span className="settings-page__section">{t(`settings.nav.${section}`)}</span>
      </div>
      <div className="settings-page__body">
        <SettingsNav active={section} onChange={setSection} />
        <ScrollArea className="flex-1">
          <SettingsContent section={section} />
        </ScrollArea>
      </div>
    </div>
  )
}
