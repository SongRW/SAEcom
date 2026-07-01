/**
 * activeBridge 单测。
 * installActiveBridge 把 getSerialPanelSummaries 挂到 window，供脚本编辑器跨轨读取。
 * 活跃面板 id 的真相源在 usePanelsStore.activeId，不再有镜像同步逻辑。
 */
import { describe, expect, it } from 'vitest'
import { usePanelsStore } from '../src/features/serial-panel/store'
import { installActiveBridge, getSerialPanelSummaries } from '../src/features/serial-panel/activeBridge'

function resetStores() {
  // 重置 store 到初始态，隔离用例
  usePanelsStore.setState({ panels: {}, listOrder: [], activeId: null, zCounter: 0, loaded: true })
}

// node 测试环境无 window；activeBridge 的 window 暴露用 typeof 守卫跳过。
// 该用例需 window 存在才能验证，故临时注入最小 shim。
function withWindowShim<T>(fn: () => T): T {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window')
  const prev = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = prev ?? {}
  try {
    return fn()
  } finally {
    if (had) (globalThis as { window?: unknown }).window = prev
    else delete (globalThis as { window?: unknown }).window
  }
}

describe('activeBridge', () => {
  it('getSerialPanelSummaries 暴露到 window 且字段对齐', () => {
    resetStores()
    // bridge 的 window 暴露需 window 存在才能验证，故临时注入最小 shim。
    withWindowShim(() => {
      const c = installActiveBridge()
      try {
        const store = usePanelsStore.getState()
        store.addPanel({ id: 'COM6', name: 'COM6', type: 'serial' })
        store.setActive('COM6')
        const summaries = getSerialPanelSummaries()
        const target = summaries.find((s) => s.id === 'COM6')
        expect(target).toBeDefined()
        expect(target).toMatchObject({
          id: 'COM6',
          name: 'COM6',
          type: 'serial',
          open: false,
          active: true,
          hidden: false
        })
        expect(target!.options).toBeDefined()
        expect(typeof (window as { getSerialPanelSummaries?: unknown }).getSerialPanelSummaries).toBe('function')
      } finally {
        c()
      }
    })
    resetStores()
  })
})
