import React from 'react'
import { useTranslation } from 'react-i18next'
import { usePanelsStore } from '@/features/serial-panel/store'

/** 徽章显示用文案 key：connected 带 name 插值，disconnected 无参数 */
export type BadgeLabelKey = 'connected' | 'disconnected'

/** 徽章可显示态：null=无活动面板不渲染，否则 {connected, labelKey, labelArg} */
export interface BadgeState {
  connected: boolean
  labelKey: BadgeLabelKey
  /** connected 时为面板显示名（name 缺省回退 id），disconnected 时为 undefined */
  labelArg?: string
}

/**
 * 纯函数：由活动面板计算徽章态（便于脱离 SSR 直接单测，且不依赖 i18n 运行时）。
 * - panel 为空 → null（不渲染）
 * - open=false → disconnected
 * - open=true → connected，labelArg 用显示名：name 优先，缺省回退 id（对齐 store genPanel 的 name||id 规则）
 *
 * 文案翻译交给组件层（t()），故此函数仅产出稳定的 labelKey + labelArg。
 */
export function computeBadgeState(panel: { id: string; name?: string; open: boolean } | undefined | null): BadgeState | null {
  if (!panel) return null
  if (!panel.open) return { connected: false, labelKey: 'disconnected' }
  return { connected: true, labelKey: 'connected', labelArg: panel.name || panel.id }
}

/**
 * 主窗串口/TCP 连接状态徽章。
 * 读 usePanelsStore.activeId → panels[activeId]，经 computeBadgeState 计算后用 t() 翻译渲染。
 */
export function ConnectionBadge() {
  const { t } = useTranslation()
  const activeId = usePanelsStore((s) => s.activeId)
  const panel = usePanelsStore((s) => (activeId ? s.panels[activeId] : undefined))
  const state = computeBadgeState(panel)
  if (!state) return null

  const dotColor = state.connected ? 'bg-[#16a34a] dark:bg-[#4ade80]' : 'bg-muted-foreground'
  const label = state.connected
    ? t('titlebar.connection.connected', { name: state.labelArg })
    : t('titlebar.connection.disconnected')

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
      <span className={`size-1.5 rounded-full ${dotColor}`} />
      {label}
    </span>
  )
}
