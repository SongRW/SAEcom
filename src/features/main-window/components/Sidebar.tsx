import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SquaresFour, Plugs, Gear, Info, List, Code, type Icon as PhosphorIcon } from '@phosphor-icons/react'
import {
  Sidebar as UISidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger
} from '@/components/ui/sidebar'
import { useAppShell, type MainTab } from '@/shared/store/appShell'
import { useIPC } from '@/shared/ipc'
import { useChangelogBadgeStore } from '@/shared/store/changelog'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useGlobalShortcuts } from '@/features/settings/shortcuts'
import { PaneList } from '@/features/serial-panel/components/PaneList'

/** 底部页面切换项：串口/命令/脚本（关于已独立成单独窗口） */
const PAGES: { tab: MainTab; icon: PhosphorIcon }[] = [
  { tab: 'serial', icon: Plugs },
  { tab: 'commands', icon: List },
  { tab: 'script', icon: Code }
]

/**
 * 左侧栏：基于 shadcn Sidebar 组件。
 * collapsible="icon" 可折叠为图标模式；Header 放品牌与 Trigger，Content 放操作菜单与面板列表，
 * Footer 放页面切换 + 关于(独立窗) + 设置。
 */
export function Sidebar() {
  const { t } = useTranslation()
  const activeTab = useAppShell((s) => s.activeTab)
  const setActiveTab = useAppShell((s) => s.setActiveTab)
  const ipc = useIPC()
  const setNewPanelDialogOpen = useAppShell((s) => s.setNewPanelDialogOpen)
  const hasUnreadChangelog = useChangelogBadgeStore((s) => s.hasUnread())
  const [settingsOpen, setSettingsOpen] = useState(false)
  useGlobalShortcuts({ onOpenSettings: () => setSettingsOpen(true) })

  return (
    <UISidebar collapsible="icon" className="border-r">
      <SidebarHeader className="flex flex-row items-center justify-between px-3 py-3 group-data-[collapsible=icon]:justify-center">
        <div className="flex items-center gap-2 overflow-hidden group-data-[collapsible=icon]:hidden">
          <SquaresFour className="size-4 shrink-0 text-muted-foreground" weight="duotone" />
          <span className="truncate text-sm font-semibold">
            {t('mainWindow.sidebar.title')}
          </span>
        </div>
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{t('mainWindow.sidebar.operation')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={t('mainWindow.sidebar.newPanel')} onClick={() => setNewPanelDialogOpen(true)}>
                  <SquaresFour />
                  <span>{t('mainWindow.sidebar.newPanel')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden flex-1 min-h-0 flex flex-col">
          <SidebarGroupLabel>{t('mainWindow.sidebar.panels')}</SidebarGroupLabel>
          <SidebarGroupContent className="flex-1 min-h-0">
            <PaneList onNewPanel={() => setNewPanelDialogOpen(true)} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {PAGES.map((page) => {
            const Icon = page.icon
            return (
              <SidebarMenuItem key={page.tab}>
                <SidebarMenuButton
                  tooltip={t(`mainWindow.sidebar.page.${page.tab}`)}
                  isActive={activeTab === page.tab}
                  onClick={() => setActiveTab(page.tab)}
                >
                  <Icon />
                  <span>{t(`mainWindow.sidebar.page.${page.tab}`)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t('mainWindow.sidebar.about')} className="relative" onClick={() => ipc.about.open()}>
              <Info />
              <span>{t('mainWindow.sidebar.about')}</span>
              {/* 有未读更新内容时显示角标 */}
              {hasUnreadChangelog && (
                <span
                  className="absolute right-2 top-2 inline-block size-2 rounded-full bg-primary ring-2 ring-background"
                  aria-label={t('mainWindow.sidebar.hasUpdate')}
                />
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t('mainWindow.sidebar.settings')} onClick={() => setSettingsOpen(true)}>
              <Gear />
              <span>{t('mainWindow.sidebar.settings')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </UISidebar>
  )
}
