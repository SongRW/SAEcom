import { useEffect, useRef } from 'react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TitleBarChrome, ConnectionBadge } from '@/features/titlebar'
import { Sidebar } from '@/features/main-window/components/Sidebar'
import { Workspace } from '@/features/main-window/components/Workspace'
import { BottomNav } from '@/features/main-window/components/BottomNav'
import { installActiveBridge } from '@/features/serial-panel/activeBridge'
import { useSettingsStore } from '@/shared/store/settings'
import { useCommandsStore } from '@/features/commands/store'
import { getIPC } from '@/shared/ipc'
import { Toaster } from '@/components/ui/sonner'
import './main-window.css'

/**
 * React 主窗口（双轨并行可视）。
 * 顶部 TitleBarChrome 横跨全窗（品牌/标题 + 连接徽章 + 原生窗口按钮），
 * 下方 SidebarProvider 包裹 Sidebar + SidebarInset（上下分栏工作区/内容面板）。
 *
 * TooltipProvider 必须在根：SidebarMenuButton 的 tooltip、以及后续 Tooltip 用法都依赖它。
 * activeBridge：把 getSerialPanelSummaries 挂到 window 供脚本编辑器跨轨读取。
 */
export default function MainWindow() {
  useEffect(() => installActiveBridge(), [])

  // 启动加载框淡出：React 首帧提交后触发。useEffect 在 commit 后执行，此时主窗口
  // 已绘制，可安全淡出加载框（html 侧另有 8s 超时兜底，防止本 effect 因任何原因
  // 未执行导致加载框永久遮挡主窗口）。
  useEffect(() => {
    const hide = (window as any).__hideAppLoader
    if (typeof hide === 'function') hide()
  }, [])

  // 退出前 flush：主进程 before-quit 会发 app:flush-requested（preventDefault 取消了
  // 窗口关闭级联，beforeunload 不触发，故用主进程驱动的 IPC）。收到后立即 flushNow
  //（清防抖定时器 + save + flush invoke）；flush 的 invoke resolve 即告知主进程可退。
  useEffect(() => {
    const off = getIPC().app.onFlushRequested(() => {
      useCommandsStore.getState().flushNow()
    })
    return off
  }, [])

  // 启动时自动检查更新（按设置 appSettings.autoCheckUpdate，默认关闭）。
  // 仅在首次挂载触发一次；StrictMode 下双挂载用 ref guard 避免重复定时器。
  const autoChecked = useRef(false)
  useEffect(() => {
    if (autoChecked.current) return
    autoChecked.current = true
    if (!useSettingsStore.getState().autoCheckUpdate) return
    const t = setTimeout(() => {
      try {
        getIPC().app.checkUpdate()
      } catch {
        /* preload 未注入（如纯浏览器预览）时忽略 */
      }
    }, 3000)
    return () => clearTimeout(t)
  }, [])

  // 深浅色跟随 settings.dark（项目用 <html>.dark class 切换，非 next-themes）。
  // 显式传 theme，避免 sonner 包装里 useTheme() 返回 undefined 落到 system。
  const dark = useSettingsStore((s) => s.dark)

  // 主题 class 应用：MainWindow 始终挂载，是主窗最可靠的主题应用点。
  // 此前仅 mainwindow.html 冷启动脚本（只读一次 localStorage）+ SettingsDialog effect
  // （依赖设置对话框挂载）负责，运行时若 store.dark 变化但 SettingsDialog 未挂载，
  // <html>.dark 不会更新 → 画板区等用 var(--background) 的元素露出浅色（白条）。
  // 这里在顶层始终同步 .dark/.theme-dark + 广播 ipc.theme.set 给独立窗。
  useEffect(() => {
    const el = document.documentElement
    el.classList.toggle('dark', !!dark)
    el.classList.toggle('theme-dark', !!dark)
    try {
      getIPC().theme.set(!!dark)
    } catch {
      /* preload 未注入时忽略 */
    }
  }, [dark])

  const fontSize = useSettingsStore((s) => s.fontSize)
  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`)
  }, [fontSize])

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <TitleBarChrome status={<ConnectionBadge />} />
        <SidebarProvider style={{ minHeight: 0 }} className="flex-1 min-h-0">
          <Sidebar />
          <SidebarInset className="min-w-0 flex-1 overflow-hidden">
            <PanelGroup orientation="vertical" className="h-full">
              <Panel defaultSize={62} minSize={20}>
                <Workspace />
              </Panel>
              <PanelResizeHandle className="h-1.5 w-full cursor-row-resize bg-border transition-colors hover:bg-primary/40" />
              <Panel defaultSize={38} minSize={12}>
                <BottomNav />
              </Panel>
            </PanelGroup>
          </SidebarInset>
        </SidebarProvider>
      </div>
      <Toaster position="bottom-right" richColors closeButton theme={dark ? 'dark' : 'light'} />
    </TooltipProvider>
  )
}
