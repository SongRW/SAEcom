import { create } from 'zustand'
import { MAX_CHANNELS } from '@/features/oscilloscope/parser'

/** 单个示波器窗格的配置（不含样本数据） */
export interface ScopePaneConfig {
  panelId: string
  paused: boolean
  /** 是否吸附实时右沿（回溯/框选时变 false） */
  live: boolean
  /** 各通道可见性（索引 0..MAX_CHANNELS-1） */
  channelVisible: boolean[]
}

interface OscilloscopeState {
  /** 当前聚焦的窗格 panel id */
  openPaneId: string | null
  panes: Record<string, ScopePaneConfig>
  /** 显示时间窗（秒） */
  windowSec: number

  openPane: (panelId: string) => void
  closePane: (panelId: string) => void
  setPaused: (panelId: string, paused: boolean) => void
  setLive: (panelId: string, live: boolean) => void
  toggleChannelVisibility: (panelId: string, channelIndex: number) => void
  setWindowSec: (sec: number) => void
}

export const useOscilloscopeStore = create<OscilloscopeState>((set) => ({
  openPaneId: null,
  panes: {},
  windowSec: 300, // 5 分钟默认

  openPane: (panelId) =>
    set((s) => {
      if (s.panes[panelId]) {
        return { openPaneId: panelId }
      }
      const cfg: ScopePaneConfig = {
        panelId,
        paused: false,
        live: true,
        channelVisible: Array.from({ length: MAX_CHANNELS }, () => true)
      }
      return { openPaneId: panelId, panes: { ...s.panes, [panelId]: cfg } }
    }),

  closePane: (panelId) =>
    set((s) => {
      const panes = { ...s.panes }
      delete panes[panelId]
      return {
        panes,
        openPaneId: s.openPaneId === panelId ? null : s.openPaneId
      }
    }),

  setPaused: (panelId, paused) =>
    set((s) => {
      const p = s.panes[panelId]
      if (!p) return s
      return { panes: { ...s.panes, [panelId]: { ...p, paused, live: paused ? false : p.live } } }
    }),

  setLive: (panelId, live) =>
    set((s) => {
      const p = s.panes[panelId]
      if (!p) return s
      return { panes: { ...s.panes, [panelId]: { ...p, live, paused: live ? false : p.paused } } }
    }),

  toggleChannelVisibility: (panelId, channelIndex) =>
    set((s) => {
      const p = s.panes[panelId]
      if (!p) return s
      const channelVisible = [...p.channelVisible]
      channelVisible[channelIndex] = !channelVisible[channelIndex]
      return { panes: { ...s.panes, [panelId]: { ...p, channelVisible } } }
    }),

  setWindowSec: (sec) => set({ windowSec: sec })
}))
