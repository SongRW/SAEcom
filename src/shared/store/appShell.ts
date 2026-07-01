import { create } from 'zustand'

/** 主窗口底部导航页签（关于已独立成单独窗口，不再在此） */
export type MainTab = 'serial' | 'commands' | 'script'

interface AppShellState {
  /** 当前激活的底部页签 */
  activeTab: MainTab
  /** 新建面板弹窗开关（Sidebar 触发，SerialPanelWorkspace 监听渲染） */
  newPanelDialogOpen: boolean
  setActiveTab: (tab: MainTab) => void
  setNewPanelDialogOpen: (open: boolean) => void
}

/**
 * 主窗口外壳共享状态。
 * 仅承载跨子系统的导航类状态；各 feature 的局部状态留在各自组件内。
 * 活跃面板 id 的唯一真相源在 usePanelsStore.activeId，此处不再镜像。
 */
export const useAppShell = create<AppShellState>((set) => ({
  activeTab: 'serial',
  newPanelDialogOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setNewPanelDialogOpen: (open) => set({ newPanelDialogOpen: open })
}))
