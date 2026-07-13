import { usePanelsStore } from '@/features/serial-panel/store'
import type { SerialPanelSummary } from '@/features/serial-panel/types'

/**
 * 把 getSerialPanelSummaries 挂到 window，供脚本编辑器跨轨读取（替代 legacy 同名全局）。
 * installActiveBridge() 在 MainWindow 挂载时调用一次，返回 cleanup。
 * 活跃面板 id 的唯一真相源是 usePanelsStore.activeId，不再另设镜像同步。
 */
export function installActiveBridge(): () => void {
  // 暴露跨轨读取（预览窗自己的 window 上下文，不污染 legacy 主窗）。
  // Node/SSR/测试环境无 window，跳过。
  const w = (typeof window !== 'undefined' ? (window as unknown as { getSerialPanelSummaries?: typeof getSerialPanelSummaries; getModbusPanelSummaries?: typeof getModbusPanelSummaries }) : null)
  if (w) w.getSerialPanelSummaries = getSerialPanelSummaries
  if (w) w.getModbusPanelSummaries = getModbusPanelSummaries

  return () => {
    if (w) delete w.getSerialPanelSummaries
    if (w) delete w.getModbusPanelSummaries
  }
}

/**
 * 从 panels store 派生面板概要数组。字段对齐 legacy getSerialPanelSummaries。
 */
export function getSerialPanelSummaries(): SerialPanelSummary[] {
  const { panels, listOrder, activeId } = usePanelsStore.getState()
  return listOrder.map((id) => {
    const p = panels[id]
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      open: p.open,
      active: activeId === id,
      hidden: p.hidden,
      options: p.type === 'serial' ? p.options : undefined
    }
  })
}

/**
 * 从 panels store 派生 modbus 面板概要数组（镜像 getSerialPanelSummaries，仅筛选 type==='modbus'）。
 * modbus 面板概要不含 serial 专属的 options/bufferMs/append 字段。
 */
export function getModbusPanelSummaries(): SerialPanelSummary[] {
  const { panels, listOrder, activeId } = usePanelsStore.getState()
  return listOrder
    .map((id) => panels[id])
    .filter((p) => p && p.type === 'modbus')
    .map((p) => ({
      id: p.id,
      name: p.name,
      type: 'modbus' as const,
      open: p.open,
      active: activeId === p.id,
      hidden: p.hidden
    }))
}
