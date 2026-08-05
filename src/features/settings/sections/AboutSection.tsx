import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useIPC } from '@/shared/ipc'
import { ToggleRow } from '@/features/settings/ToggleRow'
import { useSettingsStore } from '@/shared/store/settings'
import { useChangelogBadgeStore } from '@/shared/store/changelog'

/** 关于分区:应用名 / 版本 / 描述 / 检查更新 / 自动检查开关 / 打开更新日志。版本号经 IPC 懒加载。 */
export function AboutSection() {
  const ipc = useIPC()
  const { t } = useTranslation()
  const [version, setVersion] = useState('—')
  const autoCheckUpdate = useSettingsStore((s) => s.autoCheckUpdate)
  const setField = useSettingsStore((s) => s.setField)
  const setAppVersion = useChangelogBadgeStore((s) => s.setAppVersion)
  const markRead = useChangelogBadgeStore((s) => s.markRead)
  const hasUnread = useChangelogBadgeStore((s) => s.hasUnread())

  useEffect(() => {
    let alive = true
    ipc.app.getVersion().then((v) => {
      if (!alive) return
      setVersion(v)
      setAppVersion(v) // 写入 changelog badge store，重算「有未读更新内容」
    })
    return () => {
      alive = false
    }
  }, [ipc, setAppVersion])

  return (
    <div className="flex flex-col py-1">
      <h3 className="text-sm font-semibold">{t('settings.about.title')}</h3>
      <p className="text-xs text-muted-foreground mb-2">{t('settings.about.subtitle')}</p>

      <dl className="text-sm">
        <div className="flex justify-between py-2 border-b border-border/50">
          <dt className="text-muted-foreground">{t('settings.about.appName')}</dt>
          <dd>串串</dd>
        </div>
        <div className="flex justify-between py-2 border-b border-border/50">
          <dt className="text-muted-foreground">{t('settings.about.version')}</dt>
          <dd>v{version}</dd>
        </div>
        <div className="flex justify-between py-2 border-b border-border/50">
          <dt className="text-muted-foreground">{t('settings.about.description')}</dt>
          <dd>{t('settings.about.descriptionValue')}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <ToggleRow
          id="autoCheckUpdate"
          label={t('settings.about.autoCheckUpdate')}
          checked={autoCheckUpdate}
          onCheckedChange={(v) => setField('autoCheckUpdate', v)}
        />
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => ipc.app.checkUpdate()}>
          {t('settings.about.checkUpdate')}
        </Button>
        <Button
          variant={hasUnread ? 'default' : 'outline'}
          size="sm"
          title={hasUnread ? t('settings.about.newVersionTooltip') : undefined}
          onClick={() => {
            ipc.changelog.open()
            // 打开过更新日志 → 标记当前版本为已读，清除高亮
            markRead()
          }}
        >
          {t('settings.about.openChangelog')}
          {hasUnread && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-background/80" />}
        </Button>
      </div>
    </div>
  )
}
