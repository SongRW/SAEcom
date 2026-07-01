/**
 * 快捷键只读数据表 + 按键处理 + 全局监听 hook(Task 6)。
 * 数据表驱动「快捷键」分区 UI;handleShortcutKey 是纯函数,便于在 node 环境单测。
 *
 * 注意:`Ctrl+B`(侧边栏)已存在于 sidebar.tsx,此处不重复监听。
 */

import { useEffect } from 'react'
import { useSettingsStore } from '@/shared/store/settings'

export interface ShortcutDef {
  id: string
  label: string
  /** win/linux 展示用,如 "Ctrl+B" */
  combo: string
  /** mac 展示用,如 "⌘B";无则回退 combo */
  platformCombo?: string
}

/** 快捷键只读清单(驱动「快捷键」分区)。 */
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'sidebar', label: '切换侧边栏', combo: 'Ctrl+B', platformCombo: '⌘B' },
  { id: 'settings', label: '打开设置', combo: 'Ctrl+,', platformCombo: '⌘,' },
  { id: 'theme', label: '切换夜间模式', combo: 'Ctrl+Shift+L', platformCombo: '⌘⇧L' },
  { id: 'fullscreen', label: '切换全屏', combo: 'F11' },
  { id: 'close', label: '关闭设置', combo: 'Esc' }
]

/** 是否为 Mac 平台(决定快捷键展示用 ⌘ 还是 Ctrl)。单一来源：titlebar/platform.ts。 */
export { isMac } from '@/features/titlebar/platform'

/** 根据平台返回展示用组合键字符串。 */
export function getDisplayCombo(s: ShortcutDef, mac: boolean): string {
  if (mac && s.platformCombo) return s.platformCombo
  return s.combo
}

/** handleShortcutKey 触发的动作集合(由调用方提供具体实现)。 */
export interface ShortcutActions {
  openSettings: () => void
  toggleDark: () => void
  toggleFullscreen: () => void
}

/** 判断事件 target 是否为可编辑元素(输入框/文本域/选择框/contenteditable)。 */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

/**
 * 纯按键处理函数。返回 true 表示命中快捷键(调用方应 preventDefault)。
 * - Ctrl/Cmd+,  → openSettings
 * - Ctrl/Cmd+Shift+L → toggleDark
 * - F11 → toggleFullscreen
 * 输入框聚焦时不拦截。不含 Ctrl+B(侧边栏由 sidebar.tsx 处理)。
 */
export function handleShortcutKey(e: KeyboardEvent, actions: ShortcutActions): boolean {
  if (isEditableTarget(e)) return false
  const mod = e.ctrlKey || e.metaKey

  // Ctrl/Cmd+, 打开设置(无 shift/alt)
  if (mod && !e.shiftKey && !e.altKey && e.key === ',') {
    e.preventDefault()
    actions.openSettings()
    return true
  }
  // Ctrl/Cmd+Shift+L 切换夜间
  if (mod && e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
    e.preventDefault()
    actions.toggleDark()
    return true
  }
  // F11 切换全屏
  if (!mod && !e.shiftKey && !e.altKey && e.key === 'F11') {
    e.preventDefault()
    actions.toggleFullscreen()
    return true
  }
  return false
}

/**
 * 全局快捷键监听。在主窗口顶层挂一次。
 * 按键判定委托给纯函数 handleShortcutKey(已单测),此处只负责挂/卸监听。
 * - Ctrl/Cmd+,  打开设置
 * - Ctrl/Cmd+Shift+L 切换夜间模式
 * - F11 切换全屏
 *
 * Ctrl+B(侧边栏)由 sidebar.tsx 自行处理,不在此重复。
 */
export function useGlobalShortcuts({ onOpenSettings }: { onOpenSettings: () => void }) {
  useEffect(() => {
    const actions: ShortcutActions = {
      openSettings: onOpenSettings,
      toggleDark: () => useSettingsStore.getState().setField('dark', !useSettingsStore.getState().dark),
      toggleFullscreen: () =>
        useSettingsStore.getState().setField('fullscreen', !useSettingsStore.getState().fullscreen)
    }
    const onKey = (e: KeyboardEvent) => {
      handleShortcutKey(e, actions)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenSettings])
}
