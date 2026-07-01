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
 * 副作用 effect 监听关键字段:
 * - dark → ipc.theme.set + documentElement .dark class
 * - fullscreen → ipc.window.setFullscreen
 * - fontSize → documentElement --font-size-base
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const ipc = useIPC()
  const { t } = useTranslation()
  const dark = useSettingsStore((s) => s.dark)
  const fullscreen = useSettingsStore((s) => s.fullscreen)
  const fontSize = useSettingsStore((s) => s.fontSize)
  const [section, setSection] = useState<SettingsSection>('general')

  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', !!dark)
    el.classList.toggle('theme-dark', !!dark)
    ipc.theme.set(!!dark)
  }, [dark, ipc])

  useEffect(() => {
    ipc.window.setFullscreen(!!fullscreen)
  }, [fullscreen, ipc])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
  }, [fontSize])

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
