/**
 * addPanel 应有最大面板数上限（MAX_PANELS=64），超出时返回 false 且不新增，
 * 避免 listOrder 无界增长。
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { usePanelsStore } from '@/features/serial-panel/store'

vi.mock('@/shared/ipc', () => ({
  getIPC: () => ({
    config: { load: vi.fn(async () => []), save: vi.fn() },
    serial: { list: vi.fn(async () => []), open: vi.fn(), close: vi.fn(), write: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    tcp: { open: vi.fn(), write: vi.fn(), close: vi.fn(), onData: vi.fn(), onEvent: vi.fn() },
    panel: { saveLog: vi.fn() },
    logger: { pickFile: vi.fn(), append: vi.fn() },
    tcpShare: { start: vi.fn(), stop: vi.fn(), status: vi.fn() }
  })
}))

describe('addPanel enforces MAX_PANELS=64', () => {
  beforeEach(() => {
    usePanelsStore.setState({ panels: {}, listOrder: [], activeId: null, zCounter: 0 })
  })

  it('第 64 个面板成功创建，返回 true', () => {
    // 先建 63 个
    for (let i = 0; i < 63; i++) {
      usePanelsStore.getState().addPanel({ id: `COM${i}`, name: `COM${i}`, type: 'serial' })
    }
    expect(usePanelsStore.getState().listOrder.length).toBe(63)
    // 第 64 个应成功
    const ok = usePanelsStore.getState().addPanel({ id: 'COM63', name: 'COM63', type: 'serial' })
    expect(ok).toBe(true)
    expect(usePanelsStore.getState().listOrder.length).toBe(64)
  })

  it('第 65 个面板被拒绝，返回 false 且不新增', () => {
    // 先建满 64 个
    for (let i = 0; i < 64; i++) {
      usePanelsStore.getState().addPanel({ id: `COM${i}`, name: `COM${i}`, type: 'serial' })
    }
    expect(usePanelsStore.getState().listOrder.length).toBe(64)
    // 第 65 个应被拒
    const ok = usePanelsStore.getState().addPanel({ id: 'COM64', name: 'COM64', type: 'serial' })
    expect(ok).toBe(false)
    expect(usePanelsStore.getState().listOrder.length).toBe(64)
    expect(usePanelsStore.getState().panels.COM64).toBeUndefined()
  })
})
