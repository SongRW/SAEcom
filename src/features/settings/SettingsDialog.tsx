import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIPC } from '@/shared/ipc'
import { useSettingsStore } from '@/shared/store/settings'
import { SettingsNav, type SettingsSection } from '@/features/settings/SettingsNav'
import { SettingsContent } from '@/features/settings/SettingsContent'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * zcode 风格设置对话框:左导航 + 右分区,沿用 shadcn Dialog(加宽 max-w-2xl)。
 * 副作用 effect:
 * - fullscreen → ipc.window.setFullscreen
 * 注：主题（dark）与字号（fontSize）的 <html> 应用已上移到 MainWindow（始终挂载，
 * 更可靠；此前仅在此对话框挂载时生效，运行时切换若未开对话框则 <html>.dark 不更新，
 * 画板区等 var(--background) 元素会露出浅色）。
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const ipc = useIPC()
  const { t } = useTranslation()
  const fullscreen = useSettingsStore((s) => s.fullscreen)
  const [section, setSection] = useState<SettingsSection>('general')

  useEffect(() => {
    ipc.window.setFullscreen(!!fullscreen)
  }, [fullscreen, ipc])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="border-b border-border/50 px-4 py-3">
          <DialogTitle>{t('settings.dialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex" style={{ minHeight: '420px' }}>
          <SettingsNav active={section} onChange={setSection} />
          <ScrollArea className="flex-1">
            <SettingsContent section={section} />
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
